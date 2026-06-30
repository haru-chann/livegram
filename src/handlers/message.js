import { sendMessage, sendMedia, forwardMessage, forwardMessages, deleteMessage, sendChatAction, setWebhook, safeTelegramCall } from '../services/telegram.js';
import { queryDB, queryDBFirst, queryDBRun, upsertUser } from '../services/db.js';
import { MESSAGES, escapeMarkdown, escapeHTML } from '../config.js';
import { logError } from '../utils/logger.js';
import { handleSetupState, handleBroadcastState, handleReplyFlow, sendWelcome } from './flow.js';
import { handleAdminCommands } from './admin.js';
import { runGlobalBroadcast } from '../services/broadcast.js';

import { memoryCache, configCache } from '../utils/cache.js';

export async function handleMessage(msg, env, ctx) {
    const { bot_id, admin_id, user_id, bot_token, super_admin_id } = ctx;
    const text = msg.text || '';
    const isAdmin = user_id.toString() === admin_id;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    const fullCommand = text.trim();
    const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];
    const stateKey = `state:${bot_id}:${user_id}`;

    // 1. Early Rate Limit Check (Protects KV/D1 Quota)
    if (!isAdmin) {
        const cache = caches.default;
        const rateKey = `https://rate-limit.local/${bot_id}/${user_id}`;
        const rateRes = await cache.match(rateKey);
        let rlData = { count: 0, ts: Date.now() };
        if (rateRes) {
            try { rlData = await rateRes.json(); } catch (e) { }
        }

        const now = Date.now();
        if (now - rlData.ts > 30000) {
            rlData = { count: 1, ts: now };
        } else {
            rlData.count++;
        }

        if (rlData.count >= 5) {
            if (rlData.count === 5) await sendMessage(bot_token, user_id, MESSAGES.RATE_LIMIT, { parse_mode: 'HTML' });
            ctx.executionCtx.waitUntil(cache.put(rateKey, new Response(JSON.stringify(rlData), { headers: { 'Cache-Control': 'max-age=60' } })));
            return;
        }
        ctx.executionCtx.waitUntil(cache.put(rateKey, new Response(JSON.stringify(rlData), { headers: { 'Cache-Control': 'max-age=60' } })));
    }

    // Filter group noise (Robust Entities + Shortcuts)
    if (isGroup && !isAdmin) {
        const botName = ctx.bot_username?.toLowerCase();
        let isMentioned = false;

        // Entity-based Mention Detection (Robust)
        const entities = msg.entities || msg.caption_entities || [];
        const combinedText = (text || msg.caption || '').toLowerCase();
        for (const entity of entities) {
            if (entity.type === 'mention') {
                const mention = combinedText.substring(entity.offset, entity.offset + entity.length);
                if (botName && mention === `@${botName}`) { isMentioned = true; break; }
            }
        }

        const isShortcutRequest = text.startsWith('!') || text.startsWith('.') || (msg.caption && (msg.caption.startsWith('!') || msg.caption.startsWith('.')));
        const isReplyToBot = botName && msg.reply_to_message?.from?.username?.toLowerCase() === botName;

        if (!isMentioned && !isShortcutRequest && !isReplyToBot) return;
    }

    if (text.startsWith('/')) {
        // Secure Webhook Initialization (Main Bot Only)
        if (isAdmin && bot_id === 0) {
            const hasSecret = await env.KV.get('config:0:webhook_secret');
            if (!hasSecret) {
                const newSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
                const webhookUrl = new URL(ctx.request_url).origin;
                const whRes = await setWebhook(bot_token, webhookUrl, newSecret);
                if (whRes.ok) await env.KV.put('config:0:webhook_secret', newSecret);
            }
        }
        // Force clear memory cache if a new command is sent to break out of "stuck" states
        if (isAdmin) memoryCache.delete(stateKey);
        if (await handleAdminCommands(msg, env, ctx, { command, fullCommand })) return;
    }

    // 2. Setup/Broadcast States (Only if no command was handled)
    let setupStr = await env.KV.get(stateKey);

    if (setupStr) {
        try {
            const setupData = JSON.parse(setupStr);
            if (await handleSetupState(msg, env, ctx, setupData)) return;
        } catch (e) {
            console.error(`[JSON Error] setupStr: "${setupStr}" - ${e.message}`);
            await env.KV.delete(stateKey);
            memoryCache.delete(stateKey);
        }
    }

    if (isAdmin) {
        let broadStr = await env.KV.get(`state:${bot_id}:broadcast:${admin_id}`);
        if (broadStr) {
            try {
                const broadData = JSON.parse(broadStr);
                if (await handleBroadcastState(msg, env, ctx, broadData)) return;
            } catch (e) {
                console.error(`[JSON Error] broadStr: "${broadStr}" - ${e.message}`);
                await env.KV.delete(`state:${bot_id}:broadcast:${admin_id}`);
            }
        }
    }

    // --- Implicit Reply (Private DMs only) ---
    if (isAdmin && !text.startsWith('/') && !msg.reply_to_message && !isGroup) {
        let targetId = await env.KV.get(`reply_target:${bot_id}:${user_id}`);

        if (!targetId) return await sendMessage(bot_token, msg.chat.id, MESSAGES.NO_LAST_TARGET);

        await sendChatAction(bot_token, targetId, 'typing');
        const quickMsg = { ...msg }; // Original message

        try {
            let res = await sendMedia(bot_token, targetId, quickMsg);
            if (res.ok) {
                const name = await getUserName(env, bot_id, targetId);
                const confKey = `state:${bot_id}:reply_conf:${user_id}`;
                const prevConfId = await env.KV.get(confKey);
                if (prevConfId) { try { await deleteMessage(bot_token, msg.chat.id, parseInt(prevConfId)); } catch (e) { } }

                const ctxMsg = { ...ctx, user_id: admin_id };
                const conf = await sendMessage(bot_token, msg.chat.id, MESSAGES.QUICK_REPLY_SENT(name, targetId), { parse_mode: 'HTML', auto_delete: true, ctx: ctxMsg });
                if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
            }
        } catch (e) {
            console.error(`[ImplicitReply Error] ${e.message}`);
            await logError(env, ctx, e, "ImplicitReply");
        }
        return;
    }

    if (isAdmin && msg.reply_to_message && await handleReplyFlow(msg, env, ctx)) return;
    await handleUserMessage(msg, env, ctx);
}

export async function handleUserMessage(msg, env, ctx) {
    const { bot_token, admin_id, bot_id, user_id, super_admin_id } = ctx;

    // 1. Optimized Blocked Check (Memory + D1)
    const blockKey = `blocked:${bot_id}:${user_id}`;
    let isBlocked = memoryCache.get(blockKey);
    if (isBlocked === undefined) {
        const blocked = await queryDBFirst(env, 'SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?', [user_id, bot_id]);
        isBlocked = !!blocked;
        memoryCache.set(blockKey, isBlocked);
    }
    if (isBlocked) return;

    // Rate limit check moved to top

    const fullCommand = msg.text?.trim() || '';
    const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];
    const stateKey = `state:${bot_id}:${user_id}`;

    ctx.executionCtx.waitUntil(upsertUser(env, bot_id, user_id, msg.from));

    if (command === '/start') {
        await sendWelcome(env, ctx, user_id);
        return;
    }

    if (command === '/clone') {
        if (ctx.is_super_bot) {
            const clonesCountRes = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE owner_id = ? AND status != ?', [user_id, 'rejected']);
            const clonesCount = clonesCountRes?.c || 0;
            const user = await queryDBFirst(env, 'SELECT extra_clones FROM users WHERE user_id = ? AND bot_id = 0', [user_id]);
            const limit = 1 + (user?.extra_clones || 0);

            if (clonesCount >= limit && user_id.toString() !== ctx.super_admin_id) {
                return await sendMessage(bot_token, user_id, "<blockquote><b>Limit Reached</b>\nYou already have your allowed number of bots. If you need another, please use /request to ask for permission.</blockquote>", { parse_mode: 'HTML' });
            }
            const stateData = JSON.stringify({ type: 'clone_collect' });
            await env.KV.put(stateKey, stateData, { expirationTtl: 600 });
            memoryCache.set(stateKey, stateData);
            await sendMessage(bot_token, user_id, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: 'HTML' });
        } else {
            await sendMessage(bot_token, user_id, `<blockquote>To create your own bot, please visit: @StellarModuleBot</blockquote>`, { parse_mode: 'HTML' });
        }
        return;
    }

    // /request command has been removed since limits are removed.

    if (command === '/help') {
        if (ctx.is_super_bot) {
            const helpText = `<b>📖 Help & Info</b>\n\n` +
                `This is the main bot to create your own contact bot.\n\n` +
                `• Use /start to see what I can do\n` +
                `• Use /clone to create your own bot\n\n` +
                `<i>For further help contact the owner @thv_haru</i>`;
            await sendMessage(bot_token, user_id, helpText, { parse_mode: 'HTML' });
        } else {
            const helpText = `<b>📖 Help & Info</b>\n\n` +
                `This is a contact bot. You can send your messages here to reach the owner.\n\n` +
                `Want your own contact bot? Create one easily at @StellarModuleBot!`;
            await sendMessage(bot_token, user_id, helpText, { parse_mode: 'HTML' });
        }
        return;
    }

    try {
        let replyParams = {};
        if (msg.reply_to_message) {
            const mapKey = `https://map.local/${bot_id}/${msg.reply_to_message.message_id}`;
            const cacheRes = await caches.default.match(mapKey);
            let m = null;
            if (cacheRes) {
                try { m = await cacheRes.json(); } catch (e) { }
            }
            if (!m) {
                m = await queryDBFirst(env, 'SELECT admin_msg_id FROM messages WHERE user_msg_id = ? AND bot_id = ?', [msg.reply_to_message.message_id, bot_id]);
            }
            if (m && m.admin_msg_id) {
                replyParams.reply_to_message_id = m.admin_msg_id;
            }
        }

        if (msg.media_group_id) {
            const mgid = msg.media_group_id;
            const key = `mg:${bot_id}:${mgid}`;
            const current = await env.KV.get(key);
            let ids = current ? JSON.parse(current) : [];
            if (!ids.includes(msg.message_id)) {
                ids.push(msg.message_id);
                ids.sort((a, b) => a - b);
                await env.KV.put(key, JSON.stringify(ids), { expirationTtl: 300 });
            }

            ctx.executionCtx.waitUntil((async () => {
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    const lockKey = `${key}:lock`;
                    const isLocked = await env.KV.get(lockKey);
                    if (isLocked) return;
                    await env.KV.put(lockKey, "1", { expirationTtl: 60 });

                    const finalIds = JSON.parse(await env.KV.get(key) || "[]");
                    if (!finalIds.length) return;

                    const fwd = await forwardMessages(bot_token, admin_id, msg.chat.id, finalIds);
                    if (fwd.ok) {
                        await env.KV.put(`reply_target:${bot_id}:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
                        if (super_admin_id && admin_id !== super_admin_id) {
                            await env.KV.put(`reply_target:${bot_id}:${super_admin_id}`, user_id.toString(), { expirationTtl: 86400 });
                        }
                        const results = Array.isArray(fwd.result) ? fwd.result : [fwd.result];
                        const batch = [];

                        if (msg.chat.type === 'private') {
                            const userStmt = await upsertUser(env, bot_id, user_id, msg.from, true);
                            if (userStmt) batch.push(userStmt);
                        }

                        for (let i = 0; i < finalIds.length; i++) {
                            const adminMid = results[i]?.message_id;
                            if (adminMid) {
                                const mapData = JSON.stringify({ user_id: user_id, user_msg_id: finalIds[i], admin_msg_id: adminMid });
                                if (msg.chat.type === 'private') {
                                    batch.push(env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(adminMid, user_id, finalIds[i], bot_id, Math.floor(Date.now() / 1000)));
                                } else {
                                    const mapKey1 = `https://map.local/${bot_id}/${adminMid}`;
                                    const mapKey2 = `https://map.local/${bot_id}/${finalIds[i]}`;
                                    ctx.executionCtx.waitUntil(caches.default.put(mapKey1, new Response(mapData, { headers: { 'Cache-Control': 'max-age=172800' } })));
                                    ctx.executionCtx.waitUntil(caches.default.put(mapKey2, new Response(mapData, { headers: { 'Cache-Control': 'max-age=172800' } })));
                                    batch.push(env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(adminMid, msg.chat.id, finalIds[i], bot_id, Math.floor(Date.now() / 1000)));
                                }
                            }
                        }

                        if (batch.length > 0) {
                            ctx.executionCtx.waitUntil(env.D1.batch(batch));
                        }

                        const prevConfId = await env.KV.get(`state:${bot_id}:conf:${user_id}`);
                        if (prevConfId) { try { await deleteMessage(bot_token, user_id, parseInt(prevConfId)); } catch (e) { } }

                        const conf = await sendMessage(bot_token, user_id, MESSAGES.CONFIRMATION, { auto_delete: true, ctx });
                        if (conf.ok) await env.KV.put(`state:${bot_id}:conf:${user_id}`, conf.result.message_id.toString(), { expirationTtl: 86400 });
                    }
                    await env.KV.delete(key);
                } catch (err) {
                    console.error(`[MediaGroup Background Error] ${err.message}`);
                    await logError(env, ctx, err, "MediaGroupBackground");
                }
            })());
            return;
        }

        const fwd = await forwardMessage(bot_token, admin_id, msg.chat.id, msg.message_id);
        
        if (fwd && fwd.ok) {
            await env.KV.put(`reply_target:${bot_id}:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
            if (super_admin_id && admin_id !== super_admin_id) {
                await env.KV.put(`reply_target:${bot_id}:${super_admin_id}`, user_id.toString(), { expirationTtl: 86400 });
            }

            const mapData = JSON.stringify({ user_id: user_id, user_msg_id: msg.message_id, admin_msg_id: fwd.result.message_id });
            if (msg.chat.type === 'private') {
                const batch = [];
                const userStmt = await upsertUser(env, bot_id, user_id, msg.from, true);
                if (userStmt) batch.push(userStmt);
                batch.push(env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(fwd.result.message_id, user_id, msg.message_id, bot_id, Math.floor(Date.now() / 1000)));
                ctx.executionCtx.waitUntil(env.D1.batch(batch));
            } else {
                const mapKey1 = `https://map.local/${bot_id}/${fwd.result.message_id}`;
                const mapKey2 = `https://map.local/${bot_id}/${msg.message_id}`;
                ctx.executionCtx.waitUntil(caches.default.put(mapKey1, new Response(mapData, { headers: { 'Cache-Control': 'max-age=172800' } })));
                ctx.executionCtx.waitUntil(caches.default.put(mapKey2, new Response(mapData, { headers: { 'Cache-Control': 'max-age=172800' } })));
                ctx.executionCtx.waitUntil(env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(fwd.result.message_id, msg.chat.id, msg.message_id, bot_id, Math.floor(Date.now() / 1000)).run());
            }

            const prevConfId = await env.KV.get(`state:${bot_id}:conf:${user_id}`);
            if (prevConfId) {
                try { await deleteMessage(bot_token, user_id, parseInt(prevConfId)); } catch (e) { }
            }

            const conf = await sendMessage(bot_token, user_id, MESSAGES.CONFIRMATION, { auto_delete: true, ctx });
            if (conf.ok) await env.KV.put(`state:${bot_id}:conf:${user_id}`, conf.result.message_id.toString(), { expirationTtl: 86400 });
        } else {
            const desc = fwd?.description || "Unknown Telegram API Error";
            console.error(`[Forward Error] ${desc}`);
            await logError(env, ctx, new Error(desc), "UserMsgForward");
        }
    } catch (e) {
        await logError(env, ctx, e, "UserMsgBatch");
    }
}

export async function handleChannelPost(post, env, ctx) {
    const { bot_token, bot_id, admin_id } = ctx;
    const confKey = `config:${bot_id}:channel`;

    let channelId = configCache.get(confKey);
    if (!channelId) {
        channelId = await env.KV.get(confKey);
        if (channelId) configCache.set(confKey, channelId);
    }

    if (!channelId || post.chat.id.toString() !== channelId) {
        console.log(`[Channel Skip] Bot: ${bot_id}, Chat: ${post.chat.id}, Target: ${channelId}`);
        return;
    }

    if (bot_id === 0) {
        const results = await runGlobalBroadcast(env, { from_chat_id: post.chat.id, message_id: post.message_id }, ctx);
        if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
        return;
    }

    const limit = 500;
    let last_id = 0;
    const cursorKey = `broadcast:channel:${bot_id}:cursor`;
    const savedCursor = await env.KV.get(cursorKey);
    if (savedCursor) last_id = parseInt(savedCursor, 10) || 0;

    const startTime = Date.now();
    let success = 0, fail = 0;

    while (true) {
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, last_id.toString(), { expirationTtl: 86400 });
            return;
        }

        const usersRes = await queryDB(env, `SELECT u.rowid as id, u.user_id FROM users u LEFT JOIN blocked_users b ON u.user_id = b.user_id AND b.bot_id = ? WHERE b.user_id IS NULL AND u.bot_id = ? AND u.rowid > ? ORDER BY u.rowid ASC LIMIT ?`, [bot_id, bot_id, last_id, limit]);
        if (!usersRes) break;
        const users = usersRes.results || [];

        if (!users.length) break;

        for (const u of users) {
            try {
                const res = await forwardMessage(bot_token, u.user_id, post.chat.id, post.message_id);
                if (res && res.ok) success++;
                else fail++;
            } catch (err) {
                fail++;
            }
            await new Promise(r => setTimeout(r, 25));
        }

        last_id = users[users.length - 1].id;
        if (users.length < limit) break;
    }
    await env.KV.delete(cursorKey);
    if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(success, fail), { parse_mode: 'HTML' });
}

async function getUserName(env, bot_id, user_id) {
    const userResults = await queryDBFirst(env, 'SELECT first_name FROM users WHERE user_id = ? AND bot_id = ?', [user_id, bot_id]);
    return userResults?.first_name || 'User';
}
