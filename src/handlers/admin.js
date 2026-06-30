import { sendMessage, setMyCommands, buildKeyboard, deleteMessage } from '../services/telegram.js';
import { queryDB, queryDBFirst, queryDBRun } from '../services/db.js';
import { MESSAGES, MAIN_BOT_USERNAME, escapeHTML } from '../config.js';
import { logError } from '../utils/logger.js';
import { handleCloneAction, sendWelcome } from './flow.js';
import { clearConfig, memoryCache } from '../utils/cache.js';

export async function handleAdminCommands(msg, env, ctx, { command, fullCommand }) {
    const { bot_token, admin_id, bot_id, user_id, is_super_bot, super_admin_id } = ctx;
    const chatId = msg.chat.id;
    const isAdmin = user_id.toString() === admin_id || (bot_id === 0 && ctx.is_system_admin);
    if (!isAdmin) return false;

    const setupKey = `state:${bot_id}:${user_id}`;
    const broadcastKey = `state:${bot_id}:broadcast:${user_id}`;

    try {
        if (command === '/start') {
            await sendWelcome(env, ctx, chatId);
            return true;
        }

        if (command === '/help' || command === '/cmd' || command === '/cmds') {
            const helpText = `<b>Command Menu</b>\n\n` +
                `<b>User Commands</b>\n` +
                `<blockquote>• /start - Start the bot\n` +
                `• /clone - Request your own bot clone</blockquote>\n` +
                `<b>Admin Commands</b>\n` +
                `<blockquote>• /broadcast - Send message to all users\n` +
                `• /send - Direct msg (ID text)\n` +
                `• /say - Bot speaks in current chat\n` +
                `• /userlist - List bot users\n` +
                `• /block - (reply) Block a user\n` +
                `• /unblock - Unblock a user\n` +
                `• /setwelcome - Customize welcome greeting\n` +
                `• /delwelcome - Remove welcome greeting\n` +
                `• /setbuttons - Customize start buttons\n` +
                `• /delbuttons - Remove start buttons\n` +
                `• /setchannel - Link channel for posts\n` +
                `• /cancel - Stop current process</blockquote>\n` +
                `<b>Reply Shortcuts</b>\n` +
                `<blockquote>• To reply, just send a message in this chat.</blockquote>\n` +
                (ctx.is_system_admin && ctx.is_super_bot ? `<b>Owner Commands</b>\n` +
                    `<blockquote>• /status - Global system status\n` +
                    `• /req - Pending requests\n` +
                    `• /clones - Manage bots\n` +
                    `• /cbroadcast - Message bot owners\n` +
                    `• /syncwebhooks - Re-sync webhooks</blockquote>\n` : '') +
                (user_id.toString() === super_admin_id && ctx.is_super_bot ? `<b>Super Admin Commands</b>\n` +
                    `<blockquote>• /addadmin - Add system admin\n` +
                    `• /deladmin - Remove system admin\n` +
                    `• /adminlist - List system admins</blockquote>\n` : '') +
                `<i>For further assistance contact the owner.</i>`;
            await sendMessage(bot_token, msg.chat.id, helpText, { parse_mode: 'HTML' });
            return true;
        }

        if (is_super_bot && user_id.toString() === super_admin_id) {
            if (command === '/addadmin') {
                const parts = fullCommand.split(/\s+/);
                const targetId = parts[1];
                if (!targetId) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/addadmin &lt;id&gt;</code></blockquote>", { parse_mode: 'HTML' });
                if (!ctx.system_admins.includes(targetId)) {
                    ctx.system_admins.push(targetId);
                    await env.KV.put('config:0:admins', JSON.stringify(ctx.system_admins));
                    configCache.set('system_admins', ctx.system_admins);
                }
                return await sendMessage(bot_token, chatId, `<blockquote><b>Admin Added</b>\n<code>${targetId}</code> is now a system admin.</blockquote>`, { parse_mode: 'HTML' });
            }

            if (command === '/deladmin') {
                const parts = fullCommand.split(/\s+/);
                const targetId = parts[1];
                if (!targetId) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/deladmin &lt;id&gt;</code></blockquote>", { parse_mode: 'HTML' });
                const idx = ctx.system_admins.indexOf(targetId);
                if (idx > -1) {
                    ctx.system_admins.splice(idx, 1);
                    await env.KV.put('config:0:admins', JSON.stringify(ctx.system_admins));
                    configCache.set('system_admins', ctx.system_admins);
                }
                return await sendMessage(bot_token, chatId, `<blockquote><b>Admin Removed</b>\n<code>${targetId}</code> is no longer an admin.</blockquote>`, { parse_mode: 'HTML' });
            }

            if (command === '/adminlist') {
                if (!ctx.system_admins.length) return await sendMessage(bot_token, chatId, "<blockquote>No additional system admins.</blockquote>", { parse_mode: 'HTML' });
                let list = "<b>System Admins</b>\n\n";
                list += ctx.system_admins.map((id, i) => `<blockquote>${i + 1}. <a href="tg://user?id=${id}">${id}</a>\n/deladmin ${id}</blockquote>`).join('\n');
                return await sendMessage(bot_token, chatId, list, { parse_mode: 'HTML' });
            }
        }

        if (command === '/cancel') {
            const hasSetup = await env.KV.get(setupKey);
            const hasBroadcast = await env.KV.get(broadcastKey);

            if (hasSetup || hasBroadcast) {
                await env.KV.delete(setupKey);
                await env.KV.delete(broadcastKey);
                memoryCache.delete(setupKey);
                memoryCache.delete(broadcastKey);
                await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
            } else {
                await sendMessage(bot_token, chatId, MESSAGES.NO_ACTIVE_CANCEL);
            }
            return true;
        }

        if (command === '/status' && is_super_bot) {
            const clones = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE status = ?', ['active']);
            const mainUsers = await queryDBFirst(env, 'SELECT count(*) as c FROM users WHERE bot_id = ?', [bot_id]);
            const globalUsers = await queryDBFirst(env, 'SELECT count(*) as c FROM users');

            const status = `<b>${MESSAGES.STATUS_TITLE}</b>\n\n` +
                `<b>Active Clones:</b> <code>${clones?.c || 0}</code>\n` +
                `👥 <b>Current Bot Users:</b> <code>${mainUsers?.c || 0}</code>\n` +
                `🌐 <b>Global Users:</b> <code>${globalUsers?.c || 0}</code>\n\n` +
                `• <b>Bot ID:</b> <code>${bot_id}</code>\n` +
                `• <b>Admin:</b> <code>${admin_id}</code>\n\n` +
                MESSAGES.STATUS_FOOTER;

            await setMyCommands(bot_token, is_super_bot);
            await sendMessage(bot_token, chatId, status, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/clone') {
            if (is_super_bot) {
                await env.KV.put(setupKey, JSON.stringify({ type: 'clone_collect' }), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: 'HTML' });
            } else {
                await sendMessage(bot_token, chatId, `<blockquote>To create your own bot, please visit: ${MAIN_BOT_USERNAME}</blockquote>`, { parse_mode: 'HTML' });
            }
            return true;
        }

        if (command === '/userlist') {
            const usersRes = await queryDB(env, 'SELECT user_id, username, first_name FROM users WHERE bot_id = ? LIMIT 50', [bot_id]);
            const users = usersRes.results;
            if (!users.length) return await sendMessage(bot_token, chatId, '<blockquote>No users yet.</blockquote>', { parse_mode: 'HTML' });
            let list = '<b>👥 Users:</b>\n\n' + users.map(u => {
                const name = (u.first_name && u.first_name !== 'User') ? u.first_name : "";
                const identifier = u.username ? `@${u.username}` : `<code>${u.user_id}</code>`;
                const displayName = name ? `<a href="tg://user?id=${u.user_id}">${escapeHTML(name)}</a>` : "";
                return displayName ? `• ${displayName} - ${identifier}` : `• ${identifier}`;
            }).join('\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/broadcast') {
            memoryCache.delete(broadcastKey);
            const type = (bot_id === 0) ? 'global' : 'local';
            await env.KV.put(broadcastKey, JSON.stringify({ type: type }), { expirationTtl: 300 });

            const prompt = (bot_id === 0)
                ? "<blockquote><b>Global Broadcast Prompt</b>\nSend the message to EVERY user of EVERY bot in the system.</blockquote>"
                : MESSAGES.BROADCAST_PROMPT;

            await sendMessage(bot_token, chatId, prompt, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/setchannel') {
            memoryCache.delete(setupKey);
            await env.KV.put(setupKey, JSON.stringify({ type: 'channel' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_PROMPT + "\n\n<i>Reply with <code>none</code> to remove the linked channel.</i>", { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/block') {
            let targetId = fullCommand.split(/\s+/)[1];
            if (!targetId && msg.reply_to_message) {
                const ref = msg.reply_to_message.message_id;
                const mapKey = `https://map.local/${bot_id}/${ref}`;
                const cacheRes = await caches.default.match(mapKey);
                let m = null;
                if (cacheRes) {
                    try { m = await cacheRes.json(); } catch (e) { }
                }
                targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
            }

            if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.BLOCK_USAGE, { parse_mode: 'HTML' });

            const user = await queryDBFirst(env, 'SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?', [targetId, targetId.replace('@', ''), bot_id]);
            if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: 'HTML' });

            await queryDBRun(env, 'INSERT INTO blocked_users (user_id, bot_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [user.user_id, bot_id, Math.floor(Date.now() / 1000)]);
            memoryCache.delete(`blocked:${bot_id}:${user.user_id}`);
            await sendMessage(bot_token, chatId, MESSAGES.USER_BLOCKED_SUCCESS(user.first_name), { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/unblock') {
            let targetId = fullCommand.split(/\s+/)[1];
            if (!targetId && msg.reply_to_message) {
                const ref = msg.reply_to_message.message_id;
                const mapKey = `https://map.local/${bot_id}/${ref}`;
                const cacheRes = await caches.default.match(mapKey);
                let m = null;
                if (cacheRes) {
                    try { m = await cacheRes.json(); } catch (e) { }
                }
                targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
            }

            if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.UNBLOCK_USAGE, { parse_mode: 'HTML' });

            const user = await queryDBFirst(env, 'SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?', [targetId, targetId.replace('@', ''), bot_id]);
            if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: 'HTML' });

            await queryDBRun(env, 'DELETE FROM blocked_users WHERE user_id = ? AND bot_id = ?', [user.user_id, bot_id]);
            memoryCache.delete(`blocked:${bot_id}:${user.user_id}`);
            await sendMessage(bot_token, chatId, MESSAGES.USER_UNBLOCKED_SUCCESS(user.first_name), { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/setwelcome') {
            memoryCache.delete(setupKey);
            await env.KV.put(setupKey, JSON.stringify({ type: 'welcome_count' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PROMPT);
            return true;
        }

        if (command === '/setbuttons') {
            memoryCache.delete(setupKey);
            await env.KV.put(setupKey, JSON.stringify({ type: 'buttons' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_PROMPT, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/delwelcome') {
            await env.KV.delete(`config:${bot_id}:welcome`);
            await sendMessage(bot_token, chatId, "<blockquote>Welcome message reset.</blockquote>", { parse_mode: 'HTML' });
            clearConfig(bot_id);
            return true;
        }

        if (command === '/delchannel') {
            await env.KV.delete(`config:${bot_id}:channel`);
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_REMOVED);
            clearConfig(bot_id);
            return true;
        }

        if (command === '/delbuttons') {
            let btns = [];
            const btnsStr = await env.KV.get(`config:${bot_id}:buttons`);
            try { if (btnsStr) btns = JSON.parse(btnsStr); } catch (e) { console.error(`[JSON Error] btnsStr Del: "${btnsStr}"`); }
            if (!btns.length) return await sendMessage(bot_token, chatId, MESSAGES.NO_BUTTONS);
            const kb = btns.map((b, i) => [{ text: `🗑️ ${b.text}`, callback_data: `delete_btn:${i}` }]);
            await sendMessage(bot_token, chatId, MESSAGES.BUTTON_DELETE_SELECT, { reply_markup: { inline_keyboard: kb } });
            return true;
        }

        if (is_super_bot && command === '/req') {
            const reqs = (await env.D1.prepare('SELECT c.*, u.first_name FROM clones c LEFT JOIN users u ON c.owner_id = u.user_id AND u.bot_id = 0 WHERE c.status = ? ORDER BY c.id ASC').bind('pending').all()).results;

            if (!reqs.length) return await sendMessage(bot_token, chatId, "<blockquote>No pending requests.</blockquote>", { parse_mode: 'HTML' });

            for (const r of reqs) {
                const name = r.first_name || 'User';
                await sendMessage(bot_token, chatId, `<b>New Clone Request</b>\n<blockquote>Bot: @${r.bot_username}\nOwner: <a href="tg://user?id=${r.owner_id}">${escapeHTML(name)}</a> (<code>${r.owner_id}</code>)</blockquote>`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: `approve_clone:${r.secret_ref}` }, { text: 'Reject', callback_data: `reject_clone:${r.secret_ref}` }]] } });
            }
            return true;
        }

        if (is_super_bot && command === '/clones') {
            const clonesRes = await queryDB(env, `
                SELECT c.bot_username, c.owner_id, u.first_name, u.username 
                FROM clones c 
                LEFT JOIN users u ON c.owner_id = u.user_id AND u.bot_id = 0 
                WHERE c.status = ? 
                ORDER BY c.id ASC
            `, ['active']);
            const clones = clonesRes.results;

            if (!clones.length) return await sendMessage(bot_token, chatId, "<blockquote>No active clones.</blockquote>", { parse_mode: 'HTML' });
            let list = "<b>Active Clones</b>\n\n";
            list += clones.map((c, i) => {
                const name = c.first_name || 'User';
                const clickableName = `<a href="tg://user?id=${c.owner_id}">${escapeHTML(name)}</a>`;
                const uname = c.username ? ` (@${c.username})` : ` [<code>${c.owner_id}</code>]`;
                return `<blockquote>${i + 1}. @${c.bot_username}\nOwner: ${clickableName}${uname}\n/delclone_${i + 1}</blockquote>`;
            }).join('\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'HTML' });
            return true;
        }

        if (is_super_bot && command === '/cbroadcast') {
            memoryCache.delete(broadcastKey);
            await env.KV.put(broadcastKey, JSON.stringify({ type: 'owners' }), { expirationTtl: 300 });
            await sendMessage(bot_token, chatId, MESSAGES.OWNER_BROADCAST_START, { parse_mode: 'HTML' });
            return true;
        }

        if (is_super_bot && command === '/syncwebhooks') {
            const clonesRes = await queryDB(env, 'SELECT * FROM clones WHERE status = ?', ['active']);
            const clones = clonesRes.results || [];
            if (!clones.length) return await sendMessage(bot_token, chatId, "<blockquote>No active clones found.</blockquote>", { parse_mode: 'HTML' });

            let success = 0, fail = 0;
            const workerUrl = new URL(ctx.request_url).origin;

            await sendMessage(bot_token, chatId, `<blockquote><b>Syncing ${clones.length} webhooks...</b>\nTarget: <code>${workerUrl}</code></blockquote>`, { parse_mode: 'HTML' });

            for (const clone of clones) {
                const webhookUrl = `${workerUrl}/handle/${clone.secret_ref}`;
                const webhookSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
                
                try {
                    const whRes = await fetch(`https://api.telegram.org/bot${clone.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${webhookSecret}`).then(r => r.json());
                    if (whRes.ok) {
                        await env.KV.put(`config:${clone.id}:webhook_secret`, webhookSecret);
                        success++;
                    } else {
                        fail++;
                    }
                } catch (e) {
                    fail++;
                }
            }

            await sendMessage(bot_token, chatId, `<blockquote><b>Sync Complete</b>\nSuccess: <code>${success}</code>\nFailed: <code>${fail}</code></blockquote>`, { parse_mode: 'HTML' });
            return true;
        }


        if (is_super_bot && (command.startsWith('/approve_') || command.startsWith('/reject_'))) {
            const idx = parseInt(command.split('_')[1], 10) - 1;
            const action = command.startsWith('/approve') ? 'approve' : 'reject';
            const reqsRes = await queryDB(env, 'SELECT * FROM clones WHERE status = ? ORDER BY id ASC', ['pending']);
            const reqs = reqsRes.results;
            if (reqs[idx]) await handleCloneAction(reqs[idx], null, null, action, env, ctx);
            else await sendMessage(bot_token, chatId, MESSAGES.REQ_INVALID);
            return true;
        }

        if (is_super_bot && command.startsWith('/delclone_')) {
            const idx = parseInt(command.split('_')[1], 10) - 1;
            const clonesRes = await queryDB(env, 'SELECT * FROM clones WHERE status = ? ORDER BY id ASC', ['active']);
            const clones = clonesRes.results;
            if (clones[idx]) await handleCloneAction(clones[idx], null, null, 'delete', env, ctx);
            else await sendMessage(bot_token, chatId, MESSAGES.CLONE_DEL_INVALID);
            return true;
        }


        if (command === '/say') {
            const content = fullCommand.substring(command.length).trim();
            if (!content) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/say &lt;text&gt;</code></blockquote>", { parse_mode: 'HTML' });
            await sendMessage(bot_token, chatId, content, { parse_mode: 'HTML' });
            try { await deleteMessage(bot_token, chatId, msg.message_id); } catch (e) { }
            return true;
        }

        if (command === '/send') {
            const parts = fullCommand.split(/\s+/);
            const targetId = parts[1];
            const content = fullCommand.substring(command.length + targetId?.length + 1).trim();
            if (!targetId || !content) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/send &lt;id&gt; &lt;text&gt;</code></blockquote>", { parse_mode: 'HTML' });

            const res = await sendMessage(bot_token, targetId, content, { parse_mode: 'HTML' });
            if (res.ok) {
                await sendMessage(bot_token, chatId, `<blockquote><b>Message Sent</b>\nDelivered to <code>${targetId}</code></blockquote>`, { parse_mode: 'HTML' });
            } else {
                await sendMessage(bot_token, chatId, `<blockquote><b>Failed</b>\n${res.description}</blockquote>`, { parse_mode: 'HTML' });
            }
            return true;
        }

    } catch (err) { 
        await logError(env, ctx, err, "handleAdminCommands"); 
        return true; 
    }
    return false;
}
