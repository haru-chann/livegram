import { sendMessage, sendMedia, setWebhook, setMyCommands, buildKeyboard, deleteMessage, sendChatAction, editMessageText, answerCallbackQuery } from '../services/telegram.js';
import { copyMessage } from '../services/broadcast.js';
import { queryDB, queryDBFirst, queryDBRun } from '../services/db.js';
import { MESSAGES, escapeMarkdown, escapeHTML } from '../config.js';
import { log, logError } from '../utils/logger.js';
import { clearConfig, activityCache, memoryCache } from '../utils/cache.js';

async function getUserName(env, bot_id, user_id) {
    const userResults = await queryDBFirst(env, 'SELECT first_name FROM users WHERE user_id = ? AND bot_id = ?', [user_id, bot_id]);
    return userResults?.first_name || 'User';
}

export async function sendWelcome(env, ctx, targetId) {
    const { bot_token, bot_id } = ctx;
    let welcome = [];
    let buttons = [];
    const welcomeStr = await env.KV.get(`config:${bot_id}:welcome`);
    const buttonsStr = await env.KV.get(`config:${bot_id}:buttons`);

    try { if (welcomeStr) welcome = JSON.parse(welcomeStr); } catch (e) { console.error(`[JSON Error] welcomeStr: "${welcomeStr}"`); }
    try { if (buttonsStr) buttons = JSON.parse(buttonsStr); } catch (e) { console.error(`[JSON Error] buttonsStr: "${buttonsStr}"`); }

    if (welcome.length) {
        for (let i = 0; i < welcome.length; i++) {
            const item = welcome[i];
            const kb = (i === welcome.length - 1) ? buildKeyboard(buttons) : undefined;
            if (item.type === 'text') await sendMessage(bot_token, targetId, item.content, { reply_markup: kb, entities: item.entities });
            else await sendMedia(bot_token, targetId, { [item.type]: item.file_id, caption: item.caption, caption_entities: item.caption_entities }, { reply_markup: kb });
        }
    } else {
        await sendMessage(bot_token, targetId, MESSAGES.START_GREETING, { reply_markup: buildKeyboard(buttons) });
    }
}

export async function handleCloneAction(prefetchedClone, id, secretRef, action, env, ctx) {
    const mainToken = env.BOT_TOKEN;
    try {
        let clone = prefetchedClone;
        if (!clone) {
            if (id) clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE id = ?', [id]);
            else clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE secret_ref = ?', [secretRef]);
        }
        if (!clone) return;

        if (action === 'approve') {
            const webhookUrl = `${new URL(ctx.request_url).origin}/handle/${clone.secret_ref}`;
            const webhookSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
            const whRes = await setWebhook(clone.token, webhookUrl, webhookSecret);
            if (whRes.ok) {
                await env.KV.put(`config:${clone.id}:webhook_secret`, webhookSecret);
                await setMyCommands(clone.token, false);
                await queryDBRun(env, 'UPDATE clones SET status = ? WHERE id = ?', ['active', clone.id]);
                await sendMessage(mainToken, clone.owner_id, `<b>Congratulations!</b> Your bot @${clone.bot_username} has been approved and activated!\n\nUse it to stay in touch with your audience!`, { parse_mode: 'HTML' });
                await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Activated</b>\n@${clone.bot_username} is now online.</blockquote>`, { parse_mode: 'HTML' });
                await env.KV.delete(key);
                return true;
            } else {
                const whError = whRes ? await whRes.text() : 'Unknown Error';
                await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Activation Failed</b>\n@${escapeMarkdown(clone.bot_username)}: ${escapeMarkdown(whError)}\n(Clone request deleted)</blockquote>`, { parse_mode: 'HTML' });
                throw new Error(`Activation failed for @${clone.bot_username}: ${whError}`);
            }
        } else if (action === 'reject') {
            await queryDBRun(env, 'DELETE FROM clones WHERE id = ?', [clone.id]);
            await sendMessage(mainToken, clone.owner_id, `<blockquote><b>Request Rejected</b>\nYour bot @${escapeMarkdown(clone.bot_username)} was rejected. Please check your token and try again.</blockquote>`, { parse_mode: 'HTML' });
            await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Rejected</b>\n@${escapeMarkdown(clone.bot_username)} has been rejected.</blockquote>`, { parse_mode: 'HTML' });
        } else if (action === 'delete') {
            await queryDBRun(env, 'DELETE FROM clones WHERE id = ?', [clone.id]);
            try {
                await fetch(`https://api.telegram.org/bot${clone.token}/deleteWebhook`);
                await sendMessage(mainToken, clone.owner_id, MESSAGES.CLONE_DELETED_OWNER(clone.bot_username), { parse_mode: 'HTML' });
            } catch (e) {
                log(ctx, "Cleanup/Notify failed on delete", { error: e.message });
            }
            await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Deleted @${clone.bot_username}</b></blockquote>`, { parse_mode: 'HTML' });
        }
    } catch (err) {
        await logError(env, ctx, err, "handleCloneAction");
    }
}

export async function handleSetupState(msg, env, ctx, state) {
    const { bot_token, admin_id, bot_id, user_id } = ctx;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const key = `state:${bot_id}:${user_id}`;

    try {
        if (text.startsWith('/')) {
            if (text.toLowerCase().split('@')[0] === '/cancel') {
                await env.KV.delete(key);
                memoryCache.delete(key);
                await env.KV.delete(`state:${bot_id}:broadcast:${user_id}`);
                await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
                return true;
            }
            // Bypass setup for any other command (allows restart or other actions)
            return false;
        }

        if (state.type === 'welcome_count') {
            const n = parseInt(text, 10);
            if (n === 1 || n === 2) {
                state.type = 'welcome_collect'; state.targetCount = n; state.messages = [];
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.STEP_1_WELCOME);
            } else await sendMessage(bot_token, chatId, '<blockquote>Please send 1 or 2.</blockquote>', { parse_mode: 'HTML' });
            return true;
        }

        if (state.type === 'welcome_collect') {
            let msgData;
            if (msg.text) msgData = { type: 'text', content: msg.text, entities: msg.entities };
            else if (msg.sticker) msgData = { type: 'sticker', file_id: msg.sticker.file_id };
            else if (msg.photo) msgData = { type: 'photo', file_id: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption, caption_entities: msg.caption_entities };
            else if (msg.animation) msgData = { type: 'animation', file_id: msg.animation.file_id, caption: msg.caption, caption_entities: msg.caption_entities };
            else if (msg.video) msgData = { type: 'video', file_id: msg.video.file_id, caption: msg.caption, caption_entities: msg.caption_entities };
            else if (msg.document) msgData = { type: 'document', file_id: msg.document.file_id, caption: msg.caption, caption_entities: msg.caption_entities };

            if (!msgData) return await sendMessage(bot_token, chatId, MESSAGES.WELCOME_UNSUPPORTED);

            state.messages.push(msgData);
            if (state.messages.length < state.targetCount) {
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.STEP_2_WELCOME);
            } else {
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PREVIEW, { parse_mode: 'HTML' });
                for (const m of state.messages) {
                    try {
                        if (m.type === 'text') await sendMessage(bot_token, chatId, m.content, { entities: m.entities });
                        else await sendMedia(bot_token, chatId, { [m.type]: m.file_id, caption: m.caption, caption_entities: m.caption_entities });
                    } catch (e) {
                        console.error(`[Setup Preview Error] ${e.message}`, m);
                    }
                }
                await sendMessage(bot_token, chatId, MESSAGES.WELCOME_SAVE_CONFIRM, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Save', callback_data: 'save_welcome' }, { text: 'Cancel', callback_data: 'cancel_welcome' }]] } });
            }
            return true;
        }

        if (state.type === 'buttons') {
            const btns = [];
            text.split('\n').filter(l => l.trim()).forEach(l => {
                const [label, url] = l.split('|').map(s => s.trim());
                if (label && url) btns.push({ text: label, url: url.startsWith('@') ? `https://t.me/${url.substring(1)}` : url });
            });
            if (btns.length > 2) return await sendMessage(bot_token, chatId, "<blockquote><b>Limit Reached</b>\nYou can only add up to 2 buttons. Please contact the owner if you need more.</blockquote>", { parse_mode: 'HTML' });
            if (btns.length) {
                await env.KV.put(`config:${bot_id}:buttons`, JSON.stringify(btns));
                await env.KV.delete(key);
                clearConfig(bot_id);
                await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_UPDATED(btns.length));
            } else await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_INVALID);
            return true;
        }

        if (state.type === 'channel') {
            if (text.toLowerCase() === 'none') {
                await env.KV.delete(`config:${bot_id}:channel`);
                memoryCache.delete(`config:${bot_id}:channel`);
                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, "<blockquote><b>Channel removed</b></blockquote>", { parse_mode: 'HTML' });
                return true;
            }
            const cid = msg.forward_from_chat?.id?.toString() || (text.startsWith('-100') ? text.trim() : null);
            if (cid) {
                await env.KV.put(`config:${bot_id}:channel`, cid);
                await env.KV.delete(key);
                clearConfig(bot_id);
                await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_LINKED(cid), { parse_mode: 'HTML' });
            } else await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_INVALID);
            return true;
        }

        if (state.type === 'clone_collect') {
            if (/^\d+:[\w-]+$/.test(text.trim())) {
                const token = text.trim();
                const exists = await queryDBFirst(env, 'SELECT bot_username FROM clones WHERE token = ?', [token]);
                if (exists) {
                    await env.KV.delete(key);
                    await sendMessage(bot_token, chatId, `<blockquote><b>Already Registered</b>\nThis bot @${exists.bot_username} is already in our system.</blockquote>`, { parse_mode: 'HTML' });
                    return true;
                }

                const meRes = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json().catch(() => ({ ok: false, description: "Network error or invalid response" }));
                if (!meRes.ok) throw new Error(meRes.description || "Invalid bot token");

                const botUsername = meRes.result.username;
                const userExists = await queryDBFirst(env, 'SELECT id FROM clones WHERE bot_username = ?', [botUsername]);
                if (userExists) {
                    await env.KV.delete(key);
                    await sendMessage(bot_token, chatId, `<blockquote><b>Username Taken</b>\nThe username @${botUsername} is already taken as a clone. If this is your bot, please contact support.</blockquote>`, { parse_mode: 'HTML' });
                    return true;
                }

                const ref = Math.random().toString(36).substring(7);
                const insert = await queryDBRun(env, 'INSERT INTO clones (token, owner_id, bot_username, secret_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [token, user_id, botUsername, ref, 'pending', Math.floor(Date.now() / 1000)]);

                if (!insert.success) {
                    if (insert.error.includes('UNIQUE constraint failed: clones.token')) {
                        await env.KV.delete(key);
                        await sendMessage(bot_token, chatId, "<b>Duplicate Token</b>\nThis bot token is already being used by another clone.", { parse_mode: 'HTML' });
                        return true;
                    }
                    throw new Error(insert.error);
                }

                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, MESSAGES.CLONE_REQUEST_SENT(botUsername), { parse_mode: 'HTML' });
                const ownerName = msg.from.first_name || 'User';
                const notifyHtml = `<b>New Clone Request</b>\n<blockquote>Bot: @${botUsername}\nOwner: <a href="tg://user?id=${user_id}">${escapeHTML(ownerName)}</a> (<code>${user_id}</code>)</blockquote>`;
                const notifyOpts = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `approve_clone:${ref}` }, { text: 'Reject', callback_data: `reject_clone:${ref}` }]] } };
                const allAdmins = [...new Set([ctx.super_admin_id, ...(ctx.system_admins || [])])];
                for (const adId of allAdmins) {
                    await sendMessage(env.BOT_TOKEN, adId, notifyHtml, notifyOpts);
                }
                return true;
            } else {
                await sendMessage(bot_token, chatId, MESSAGES.CLONE_TOKEN_INVALID, { parse_mode: 'HTML' });
                return true;
            }
        }

        if (state.type === 'gbroadcast_collect') {
            await env.KV.put(state.id, JSON.stringify({ from_chat_id: chatId, message_id: msg.message_id }), { expirationTtl: 3600 });
            await env.KV.delete(key);
            await copyMessage(bot_token, chatId, chatId, msg.message_id, { reply_markup: { inline_keyboard: [[{ text: 'Launch Global', callback_data: `confirm_gbroadcast:${state.id}` }, { text: 'Cancel', callback_data: `cancel_${state.id}` }]] } });
            return true;
        }
    } catch (err) { await logError(env, ctx, err, "handleSetupState"); }
    return false;
}

export async function handleBroadcastState(msg, env, ctx, state) {
    const { bot_token, admin_id, bot_id } = ctx;
    const bid = `b:${bot_id}:${Date.now()}`;
    // Save text as fallback because copyMessage from main bot's private chat to clones will fail in Telegram API
    await env.KV.put(bid, JSON.stringify({ from_chat_id: msg.chat.id, message_id: msg.message_id, text: msg.text || msg.caption || '' }), { expirationTtl: 3600 });
    await env.KV.delete(`state:${bot_id}:broadcast:${admin_id}`);

    const isMainAdmin = ctx.is_super_bot && bot_id === 0;
    let cb = `confirm_broadcast:${bid}`; // Default local

    if (state.type === 'global' && isMainAdmin) cb = `confirm_gbroadcast:${bid}`;
    else if (state.type === 'owners' && isMainAdmin) cb = `confirm_cbroadcast:${bid}`;
    else if (state.type === 'local') cb = `confirm_broadcast:${bid}`;

    await sendMessage(bot_token, admin_id, "<blockquote><b>Broadcast Preview:</b></blockquote>", { parse_mode: 'HTML' });
    await copyMessage(bot_token, admin_id, msg.chat.id, msg.message_id, { reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: cb }, { text: '❌ Cancel', callback_data: `cancel_${bid}` }]] } });
    return true;
}

export async function handleReplyFlow(msg, env, ctx) {
    const { bot_token, admin_id, bot_id } = ctx;
    const ref = msg.reply_to_message.message_id;
    const text = msg.text || msg.caption || '';
    const isShortcut = text.startsWith('!') || text.startsWith('.');
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    // Handle Media Group Replies
    if (msg.media_group_id) {
        const mgid = msg.media_group_id;
        const mgKey = `reply_mg:${bot_id}:${mgid}`;
        const current = await env.KV.get(mgKey);
        let ids = current ? JSON.parse(current) : [];
        if (!ids.includes(msg.message_id)) {
            ids.push(msg.message_id);
            ids.sort((a, b) => a - b);
            await env.KV.put(mgKey, JSON.stringify(ids), { expirationTtl: 300 });
        }

        ctx.executionCtx.waitUntil((async () => {
            try {
                await new Promise(r => setTimeout(r, 1500));
                const lockKey = `${mgKey}:lock`;
                if (activityCache.has(lockKey)) return;
                activityCache.set(lockKey, "1");
                const isLocked = await env.KV.get(lockKey);
                if (isLocked) return;
                await env.KV.put(lockKey, "1", { expirationTtl: 60 });

                const finalIds = JSON.parse(await env.KV.get(mgKey) || "[]");
                if (!finalIds.length) return;

                // Lookup target from the first message of the group (re-run lookup)
                const lookupRes = await caches.default.match(`https://map.local/${bot_id}/${ref}`);
                let m = null;
                if (lookupRes) m = await lookupRes.json();
                if (!m) m = await queryDBFirst(env, 'SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?', [ref, bot_id]);

                const targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
                if (!targetId || targetId.toString() === admin_id) return;

                const fwd = await forwardMessages(bot_token, targetId, msg.chat.id, finalIds);
                if (fwd.ok) {
                    const name = await getUserName(env, bot_id, targetId);
                    const ctxMsg = { ...ctx, user_id: admin_id };
                    if (!isGroup) {
                        const confKey = `state:${bot_id}:reply_conf:${admin_id}`;
                        const prevConfId = await env.KV.get(confKey);
                        if (prevConfId) { try { await deleteMessage(bot_token, admin_id, parseInt(prevConfId)); } catch (e) { } }
                        const conf = await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(name, targetId), { parse_mode: 'HTML', auto_delete: true, ctx: ctxMsg });
                        if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
                    }
                    await env.KV.put(`reply_target:${bot_id}:${admin_id}`, targetId.toString(), { expirationTtl: 86400 });
                }
                await env.KV.delete(mgKey);
            } catch (e) {
                console.error(`[Reply MediaGroup Error] ${e.message}`);
            }
        })());
        return true;
    }

    // 1. Hybrid Lookup: Cache API (Groups/Recent) -> D1 (Safe DM Persistence)
    const mapKey = `https://map.local/${bot_id}/${ref}`;
    const cacheRes = await caches.default.match(mapKey);
    let m = null;
    if (cacheRes) {
        try { m = await cacheRes.json(); } catch (e) { }
    }
    if (!m) {
        m = await queryDBFirst(env, 'SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?', [ref, bot_id]);
    }

    const targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
    if (!targetId || targetId.toString() === admin_id) return false;

    const blocked = await queryDBFirst(env, 'SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?', [targetId, bot_id]);
    if (blocked) {
        await sendMessage(bot_token, admin_id, `<blockquote><b>Cannot Reply</b>\nUser <code>${targetId}</code> is blocked on this bot.</blockquote>`, { parse_mode: 'HTML' });
        return true;
    }

    await sendChatAction(bot_token, targetId, 'typing');

    // Private DM reply mode
    const finalTargetId = targetId;
    const replyToId = m?.user_msg_id || null;

    let res = await sendMedia(bot_token, finalTargetId, msg, replyToId ? { reply_to_message_id: replyToId } : {});

    if (!res.ok && res.description?.toLowerCase().includes("message to be replied not found")) {
        res = await sendMedia(bot_token, finalTargetId, msg, {});
    }

    if (res.ok) {
        const name = await getUserName(env, bot_id, targetId);
        const ctxMsg = { ...ctx, user_id: admin_id };

        // Silent in groups for shortcuts/standalone, but usually we only notify in Private DM
        if (!isGroup) {
            const confKey = `state:${bot_id}:reply_conf:${admin_id}`;
            const prevConfId = await env.KV.get(confKey);
            if (prevConfId) { try { await deleteMessage(bot_token, admin_id, parseInt(prevConfId)); } catch (e) { } }

            const conf = await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(name, targetId), { parse_mode: 'HTML', auto_delete: true, ctx: ctxMsg });
            if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
        }
        await env.KV.put(`reply_target:${bot_id}:${ctx.user_id}`, targetId.toString(), { expirationTtl: 86400 });
    } else {
        await logError(env, ctx, new Error(res.description), "ReplyFlowDeliver");
        await sendMessage(bot_token, admin_id, `<blockquote><b>Failed to deliver reply</b>\n${res.description}</blockquote>`, { parse_mode: 'HTML' });
    }
    return true;
}
