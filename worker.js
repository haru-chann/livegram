const MAIN_BOT_USERNAME = '@StellarModuleBot';
const MESSAGES = {
    START_GREETING: "Hey there! You can contact us using this bot, just send your message and we will get back to you as soon as possible.",
    CANCELLED_ALL: "✅ <b>Process cancelled successfully.</b>",
    NO_ACTIVE_CANCEL: "No active setup or broadcast to cancel.",
    RATE_LIMIT: "⚠️ <b>Too many messages!</b> Please wait 1 minute before sending more.",
    NO_LAST_TARGET: "❌ <b>No last target found.</b> Reply to a user first to set one.",
    QUICK_REPLY_EMPTY: "❌ Please provide a message after !.",
    QUICK_REPLY_SENT: (targetId) => `✅ Message sent to user <code>${targetId}</code>`,
    STEP_1_WELCOME: "<b>Step 1:</b> Send the first message (Text, Photo, Sticker, GIF, etc.)",
    STEP_2_WELCOME: "<b>Step 2:</b> Send the second message (Text, Photo, Sticker, GIF, etc.)",
    WELCOME_SAVE_CONFIRM: "Confirm saving this sequence?",
    WELCOME_UNSUPPORTED: "Unsupported media type for welcome message. Please send text, sticker, photo, GIF, video, or document.",
    BUTTONS_UPDATED: (count) => `✅ <b>${count}</b> buttons updated successfully!`,
    BUTTONS_INVALID: "❌ <b>Invalid format.</b> Please send buttons in <code>Label | Link</code> format, one per line.",
    CHANNEL_LINKED: (id) => `✅ <b>Channel linked successfully!</b> ID: <code>${id}</code>\nMake sure the bot is an admin in that channel.`,
    CHANNEL_INVALID: "❌ <b>Invalid channel.</b> Please forward a message from the channel or send the correct ID.",
    CLONE_TOKEN_INVALID: "❌ <b>Invalid bot token format.</b> It should look like <code>12345:6789ABCDEF</code>.",
    CLONE_REQUEST_SENT: (username) => `✅ <b>Request sent!</b> Your bot @${username} is now pending approval from the Super Admin.`,
    CLONE_PENDING_TITLE: "⏳ <b>Pending Clone Requests:</b>\n\n",
    ACTIVE_CLONES_TITLE: "🤖 <b>Active Clones:</b>\n\n",
    REQ_INVALID: "❌ <b>Invalid request number.</b>",
    CLONE_DEL_INVALID: "❌ <b>Invalid clone number.</b>",
    OWNER_BROADCAST_START: "📢 <b>Owner Broadcast Mode</b>\n\nSend me the message you want to broadcast to EVERY clone owner.",
    GLOBAL_BROADCAST_START: "📢 <b>Global Broadcast Mode</b>\n\nSend me the message you want to broadcast to EVERY user across ALL bots.",
    BROADCAST_PROMPT: "Please send the message or media you want to broadcast. Or forward a message from a <b>public channel</b> for reliable global delivery across all clones.",
    WELCOME_PROMPT: "How many welcome messages do you want? (1 or 2)",
    BUTTONS_PROMPT: "Please send your buttons. You can use any format, e.g.:\n<code>Join Channel | @mychannel</code>\n<code>Support | t.me/user</code>",
    CHANNEL_PROMPT: "Please forward a message FROM the channel you want to link, or send the Channel ID (starting with -100).",
    RESET_DEFAULT: "✅ <b>Welcome message and buttons have been reset to default.</b>",
    NO_BUTTONS: "No buttons to delete.",
    BUTTON_DELETE_SELECT: "Select a button to delete:",
    BLOCKED_USER: "<b>You have been blocked from using this bot.</b>",
    USER_BLOCKED_SUCCESS: (name) => `✅ <b>User ${name} blocked.</b>`,
    BLOCK_USAGE: "Please provide a username (e.g., @username) or user ID, or reply to their message.\n\nUsage: <code>/block @username</code> or <code>/block 12345</code> or reply to their text.",
    UNBLOCK_USAGE: "Please provide a username (e.g., @username) or user ID, or reply to their message.\n\nUsage: <code>/unblock @username</code> or <code>/unblock 12345</code> or reply to their text.",
    USER_NOT_FOUND: (val) => `User <b>${val}</b> not found.`,
    USER_UNBLOCKED_SUCCESS: (name) => `✅ <b>User ${name} unblocked.</b>`,
    USER_NOT_BLOCKED: (name) => `User <b>${name}</b> was not blocked on this bot.`,
    CHANNEL_REMOVED: "✅ <b>Linked channel removed.</b>",
    STATUS_TITLE: "ℹ️ <b>Bot Status</b>",
    STATUS_FOOTER: "<i>Command menu synchronized for this bot</i>",
    REPLIED_SUCCESS: (name, id) => `✅ <b>Replied to ${name}</b> (<code>${id}</code>)`,
    USER_UNREACHABLE: (id, desc) => `User <code>${id}</code> unreachable: ${desc}`,
    BROADCAST_REPORT: (success, fail) => `Broadcast sent to <b>${success}</b> users, failed for <b>${fail}</b> users.`,
    FORWARD_REPORT: (success, fail) => `📢 <b>Auto-Forward Report</b>\n✅ Sent to <b>${success}</b> users\n❌ Failed for <b>${fail}</b> users`,
    CONFIRMATION: "𝚜𝚎𝚗𝚝 ✅",
    WELCOME_PREVIEW: "✨ <b>Previewing your new welcome sequence:</b>",
    CLONE_INSTRUCTIONS: "<b>How to connect your bot:</b>\n\n1. Open @BotFather and create a new bot.\n2. You'll get a token (e.g. <code>12345:6789ABCDEF</code>) — <b>copy-paste it here</b>.\n\n⚠️ <i>Warning! Don't connect bots already used by other services.</i>\n\nType /cancel to abort at any time.",
    CANCEL_SUCCESS: "✅ <b>Process cancelled successfully.</b>",
    CLONE_DELETED_OWNER: (bot) => `⚠️ <b>Your bot @${bot} has been deleted by the administrator.</b>`,
    EXTRA_CLONE_PROMPT: "🚀 <b>Requesting another bot...</b>\nPlease wait for the administrator to review your request. You will be notified once it is approved.",
    EXTRA_CLONE_ADMIN_NOTIFY: (name, id) => `🎫 <b>Extra Bot Request</b>\nUser: ${name} (<code>${id}</code>) wants more bots.\n\n/approve_extra_${id} | /reject_extra_${id}`,
    EXTRA_CLONE_APPROVED: "✅ <b>Congratulations!</b>\nYour request for another bot has been <b>approved</b>! You can now use /clone to start the setup.",
    EXTRA_CLONE_REJECTED: "❌ <b>Sorry</b>\nYour request for another bot was not approved at this time. Please contact the owner for more info."
};

function log(ctx, message, data = {}) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        bot_id: ctx.bot_id || 0,
        user_id: ctx.user_id || 0,
        message,
        ...data
    }));
}

async function logError(env, ctx, error, context = "General") {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const data = {
        timestamp: new Date().toISOString(),
        bot_id: ctx?.bot_id || 0,
        user_id: ctx?.user_id || 0,
        context,
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
    };
    console.error(JSON.stringify(data));

    // SYSTEM ERRORS ONLY FOR SUPER ADMIN
    if (ctx?.super_admin_id && env.BOT_TOKEN) {
        // Filter out expected/common noise
        const silentErrors = ["chat not found", "bot was blocked by the user", "user is deactivated", "can't parse entities", "message is not modified", "message to forward not found"];
        if (silentErrors.some(se => errorMsg.toLowerCase().includes(se))) return;

        try {
            const report = `⚠️ <b>System Error</b> [${context}]\n` +
                `• <b>Bot ID:</b> <code>${ctx.bot_id}</code>\n` +
                `• <b>User ID:</b> <code>${ctx.user_id}</code>\n\n` +
                `<code>${errorMsg}</code>`;
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, report, { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to send error report:", e.message);
        }
    }
}

export default {
    async fetch(request, env, executionCtx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 1) Lightweight Health Check
        if (method === 'GET' && path === '/health') {
            return new Response('Bot running', { status: 200 });
        }

        // 2) Safe Request Guard (Method check & HEAD protection)
        if (method !== 'POST') {
            return new Response('OK', { status: 200 });
        }

        const superAdminId = env.ADMIN_ID?.toString().trim();
        let ctx = {
            bot_id: 0,
            bot_token: env.BOT_TOKEN?.toString().trim(),
            admin_id: superAdminId,
            super_admin_id: superAdminId,
            is_super_bot: true,
            request_url: request.url,
            executionCtx: executionCtx
        };

        // 5) Validate Webhook Route Robustly
        if (path.startsWith('/handle/')) {
            const secretRef = path.split('/')[2];
            const clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE secret_ref = ? AND status = ?', [secretRef, 'active']);
            if (clone) {
                ctx = {
                    bot_id: clone.id,
                    bot_token: clone.token.toString().trim(),
                    admin_id: clone.owner_id.toString(),
                    super_admin_id: superAdminId,
                    is_super_bot: false,
                    request_url: request.url,
                    executionCtx: executionCtx
                };
            }
        }

        // 3) Wrap Entire Update Handler in Try/Catch
        try {
            const bodyText = await request.text();
            let update;

            // 6) Protect Against Invalid JSON
            try {
                update = JSON.parse(bodyText);
            } catch (e) {
                console.warn(`[JSON Error] Invalid update body: ${bodyText.substring(0, 100)}`);
                return new Response('OK', { status: 200 });
            }

            // 4) Top-Level Logging
            const updateType = update.message ? 'message' : (update.callback_query ? 'callback_query' : (update.channel_post ? 'channel_post' : 'unknown'));
            console.log(`[Update] BotID: ${ctx.bot_id}, Type: ${updateType}, Path: ${path}`);

            ctx.user_id = update.message?.from?.id || update.callback_query?.from?.id || update.channel_post?.from?.id || 0;

            if (update.message) {
                const channelId = await env.KV.get(`config:${ctx.bot_id}:channel`);
                if (channelId && update.message.chat.id.toString() === channelId && !update.message.from?.is_bot) await handleChannelPost(update.message, env, ctx);
                else await handleMessage(update.message, env, ctx);
            } else if (update.callback_query) {
                await handleCallbackQuery(update.callback_query, env, ctx);
            } else if (update.channel_post) {
                await handleChannelPost(update.channel_post, env, ctx);
            }
        } catch (err) {
            // Log errors using existing logError function, but do NOT fail the response
            await logError(env, ctx, err, "WebhookHandler");
        }

        // 2) Always Return 200 to Telegram
        return new Response('OK', { status: 200 });
    },
    async scheduled(event, env, ctx) {
        await scheduled(event, env, ctx);
    }
};

async function handleMessage(msg, env, ctx) {
    const { bot_id, admin_id, user_id, bot_token, super_admin_id } = ctx;
    const text = msg.text || '';
    const isAdmin = user_id.toString() === admin_id || user_id.toString() === super_admin_id;
    const fullCommand = text.trim();
    const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];

    // Check for active setup state (cloning or admin tasks)
    let setupStr = await env.KV.get(`state:${bot_id}:${user_id}`);
    if (setupStr) {
        try {
            const setupData = JSON.parse(setupStr);
            if (await handleSetupState(msg, env, ctx, setupData)) return;
        } catch (e) {
            console.error(`[JSON Error] setupStr: "${setupStr}" - ${e.message}`);
            await env.KV.delete(`state:${bot_id}:${user_id}`);
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

    if (text.startsWith('/')) {
        if (await handleAdminCommands(msg, env, ctx, { command, fullCommand })) return;
    }

    if (isAdmin && (text.startsWith('!') || text.startsWith('.') || (msg.caption && (msg.caption.startsWith('!') || msg.caption.startsWith('.'))))) {
        const targetId = await env.KV.get(`reply_target:${bot_id}:${admin_id}`);
        if (!targetId) return await sendMessage(bot_token, msg.chat.id, MESSAGES.NO_LAST_TARGET);

        const content = (text || msg.caption || '').substring(1).trim();
        if (!content && !msg.photo && !msg.sticker && !msg.video && !msg.animation && !msg.document) return await sendMessage(bot_token, msg.chat.id, MESSAGES.QUICK_REPLY_EMPTY);

        const quickMsg = { ...msg };
        if (msg.text) quickMsg.text = content;
        if (msg.caption) quickMsg.caption = content;

        try {
            const mediaRes = await sendMedia(bot_token, targetId, quickMsg);
            const res = await mediaRes.json();
            if (res.ok) await sendMessage(bot_token, msg.chat.id, MESSAGES.QUICK_REPLY_SENT(targetId), { parse_mode: 'MarkdownV2', auto_escape: false });
        } catch (e) {
            console.error(`[QuickReply Error] ${e.message}`);
            await logError(env, ctx, e, "QuickReply");
        }
        return;
    }

    if (isAdmin && msg.reply_to_message && await handleReplyFlow(msg, env, ctx)) return;
    if (!isAdmin) await handleUserMessage(msg, env, ctx);
}

async function handleCallbackQuery(query, env, ctx) {
    const { bot_token, admin_id, bot_id, super_admin_id } = ctx;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (query.from.id.toString() !== admin_id && query.from.id.toString() !== super_admin_id) {
        return await answerCallbackQuery(bot_token, query.id, 'Only admin can manage this bot.');
    }

    try {
        if (data === 'save_welcome') {
            const stateKey = `state:${bot_id}:${admin_id}`;
            const state = JSON.parse(await env.KV.get(stateKey) || '{}');
            if (state.type === 'welcome_collect') {
                await env.KV.put(`config:${bot_id}:welcome`, JSON.stringify(state.messages));
                await env.KV.delete(stateKey);
                await sendMessage(bot_token, admin_id, '✅ Welcome messages updated!');
            }
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data === 'cancel_welcome') {
            await env.KV.delete(`state:${bot_id}:${admin_id}`);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.startsWith('delete_btn:')) {
            const index = parseInt(data.split(':')[1], 10);
            const btnsStr = await env.KV.get(`config:${bot_id}:buttons`);
            let buttons = [];
            try { if (btnsStr) buttons = JSON.parse(btnsStr); } catch (e) { console.error(`[JSON Error] buttonsStr Query: "${btnsStr}"`); }
            if (buttons[index]) {
                const removed = buttons.splice(index, 1)[0];
                await env.KV.put(`config:${bot_id}:buttons`, JSON.stringify(buttons));
                await answerCallbackQuery(bot_token, query.id, `Deleted ${removed.text}`);
                if (buttons.length) await fetch(`https://api.telegram.org/bot${bot_token}/editMessageReplyMarkup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: buildKeyboard(buttons) }) });
                else await deleteMessage(bot_token, chatId, messageId);
            }
        } else if (data.startsWith('confirm_gbroadcast:')) {
            const sid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(sid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { console.error(`[JSON Error] bdataStr G: "${bdataStr}"`); }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runGlobalBroadcast(env, bdata, ctx);
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
                await env.KV.delete(sid);
            }
        } else if (data.startsWith('confirm_broadcast:')) {
            const bid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(bid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { console.error(`[JSON Error] bdataStr B: "${bdataStr}"`); }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runBroadcast(env, bot_id, bot_token, bdata, ctx);
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('confirm_cbroadcast:')) {
            const bid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(bid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { console.error(`[JSON Error] bdataStr C: "${bdataStr}"`); }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runCloneBroadcast(env, bdata);
                await sendMessage(bot_token, admin_id, `📢 <b>Owner Broadcast Result:</b>\n✅ Sent to: <b>${results.success}</b>\n❌ Failed: <b>${results.fail}</b>`, { parse_mode: 'HTML' });
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('approve_clone:')) {
            await handleCloneAction(null, null, data.substring(data.indexOf(':') + 1), 'approve', env, ctx);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.startsWith('reject_clone:')) {
            await handleCloneAction(null, null, data.substring(data.indexOf(':') + 1), 'reject', env, ctx);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.includes('cancel_')) {
            const bid = data.substring(data.indexOf('_') + 1);
            if (bid) await env.KV.delete(bid);
            await deleteMessage(bot_token, chatId, messageId);
        }
    } catch (err) { await logError(env, ctx, err, "handleCallbackQuery"); }
}

async function handleChannelPost(post, env, ctx) {
    const { bot_token, bot_id, admin_id } = ctx;
    const channelId = await env.KV.get(`config:${bot_id}:channel`);
    if (!channelId || post.chat.id.toString() !== channelId) return;

    let success = 0, fail = 0;

    // Global Channel Forwarding (from Main Bot)
    if (bot_id === 0) {
        const results = await runGlobalBroadcast(env, { from_chat_id: post.chat.id, message_id: post.message_id }, ctx);
        if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
        return;
    }

    // Local Channel Forwarding (from Clone Bot)
    const limit = 500;
    let last_id = 0;
    const cursorKey = `broadcast:channel:${bot_id}:cursor`;
    const savedCursor = await env.KV.get(cursorKey);
    if (savedCursor) last_id = parseInt(savedCursor, 10) || 0;

    console.log(JSON.stringify({ level: "info", event: "broadcast_start", bot_id }));
    const startTime = Date.now();

    while (true) {
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, last_id.toString(), { expirationTtl: 86400 });
            return;
        }

        const usersRes = await queryDB(env, `SELECT u.rowid as id, u.user_id FROM users u LEFT JOIN blocked_users b ON u.user_id = b.user_id AND b.bot_id = ? WHERE b.user_id IS NULL AND u.bot_id = ? AND u.rowid > ? ORDER BY u.rowid ASC LIMIT ?`, [bot_id, bot_id, last_id, limit]);
        const users = usersRes.results;

        if (!users.length) break;

        for (const u of users) {
            try {
                const res = await forwardMessage(bot_token, u.user_id, post.chat.id, post.message_id);
                if (res && res.ok) {
                    success++;
                    console.log(JSON.stringify({ level: "info", event: "broadcast_send", bot_id, user_id: u.user_id }));
                } else if (res) {
                    fail++;
                    if (res.description !== "Forbidden: bot was blocked by the user") {
                        console.log(JSON.stringify({ level: "warn", event: "broadcast_failure", bot_id, user_id: u.user_id, error: res.description }));
                    }
                } else fail++;
            } catch (err) {
                fail++;
                console.log(JSON.stringify({ level: "error", event: "broadcast_exception", bot_id, user_id: u.user_id, error: err.message }));
            }
            await new Promise(r => setTimeout(r, 25));
        }

        last_id = users[users.length - 1].id;
        if (users.length < limit) break;
    }
    await env.KV.delete(cursorKey);
    console.log(JSON.stringify({ level: "info", event: "broadcast_finish", bot_id, success, fail }));
    if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(success, fail), { parse_mode: 'HTML' });
}

// Higher-level Broadcast Helpers
async function runBroadcast(env, botId, token, bdata, ctx) {
    let success = 0, fail = 0;
    const limit = 500;
    let last_id = 0;

    const cursorKey = `broadcast:${botId}:cursor`;
    const savedCursor = await env.KV.get(cursorKey);
    if (savedCursor) last_id = parseInt(savedCursor, 10) || 0;

    console.log(JSON.stringify({ level: "info", event: "broadcast_start", bot_id: botId }));
    const startTime = Date.now();

    while (true) {
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, last_id.toString(), { expirationTtl: 86400 });
            return { success, fail };
        }

        const usersRes = await queryDB(env, `
            SELECT u.rowid as id, u.user_id 
            FROM users u 
            LEFT JOIN blocked_users bl ON u.user_id = bl.user_id AND bl.bot_id = ? 
            WHERE bl.user_id IS NULL AND u.bot_id = ? AND u.rowid > ?
            ORDER BY u.rowid ASC
            LIMIT ?
        `, [botId, botId, last_id, limit]);
        const users = usersRes.results;

        if (!users.length) break;

        for (const u of users) {
            try {
                const resData = await copyMessage(token, u.user_id, bdata.from_chat_id, bdata.message_id);
                if (resData && resData.ok) {
                    success++;
                    console.log(JSON.stringify({ level: "info", event: "broadcast_send", bot_id: botId, user_id: u.user_id }));
                } else if (resData) {
                    fail++;
                    if (resData.description !== "Forbidden: bot was blocked by the user") {
                        console.log(JSON.stringify({ level: "warn", event: "broadcast_failure", bot_id: botId, user_id: u.user_id, error: resData.description }));
                    }
                } else fail++;
            } catch (err) {
                fail++;
                console.log(JSON.stringify({ level: "error", event: "broadcast_exception", bot_id: botId, user_id: u.user_id, error: err.message }));
            }
            await new Promise(r => setTimeout(r, 25));
        }

        last_id = users[users.length - 1].id;
        if (users.length < limit) break;
    }

    await env.KV.delete(cursorKey);
    console.log(JSON.stringify({ level: "info", event: "broadcast_finish", bot_id: botId, success, fail }));
    return { success, fail };
}

async function runGlobalBroadcast(env, bdata, ctx) {
    const bots = [{ id: 0, token: env.BOT_TOKEN }];
    const clones = (await env.D1.prepare('SELECT id, token FROM clones WHERE status = ?').bind('active').all()).results;
    bots.push(...clones);

    const botIds = bots.map(b => b.id);
    const placeholders = botIds.map(() => '?').join(',');

    let success = 0, fail = 0;
    const limit = 500;
    let last_id = 0;

    const cursorKey = `broadcast:global:cursor`;
    const savedCursor = await env.KV.get(cursorKey);
    if (savedCursor) last_id = parseInt(savedCursor, 10) || 0;

    console.log(JSON.stringify({ level: "info", event: "broadcast_start", bot_id: 0, type: "global" }));
    const startTime = Date.now();

    while (true) {
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, last_id.toString(), { expirationTtl: 86400 });
            return { success, fail };
        }

        const allUsersRes = await queryDB(env, `
            SELECT u.rowid as id, u.user_id, u.bot_id 
            FROM users u 
            LEFT JOIN blocked_users bl ON u.user_id = bl.user_id AND bl.bot_id = u.bot_id 
            WHERE bl.user_id IS NULL AND u.bot_id IN (${placeholders}) AND u.rowid > ?
            ORDER BY u.rowid ASC
            LIMIT ?
        `, [...botIds, last_id, limit]);
        const allUsers = allUsersRes.results;

        if (!allUsers.length) break;

        const userGroups = allUsers.reduce((acc, user) => {
            acc[user.bot_id] = acc[user.bot_id] || [];
            acc[user.bot_id].push(user.user_id);
            return acc;
        }, {});

        for (const b of bots) {
            const users = userGroups[b.id] || [];
            if (!users.length) continue;

            for (const userId of users) {
                try {
                    const resData = await copyMessage(b.token, userId, bdata.from_chat_id, bdata.message_id);
                    if (resData && resData.ok) {
                        success++;
                        console.log(JSON.stringify({ level: "info", event: "broadcast_send", bot_id: b.id, user_id: userId }));
                    } else if (resData) {
                        fail++;
                        if (resData.description !== "Forbidden: bot was blocked by the user") {
                            console.log(JSON.stringify({ level: "warn", event: "broadcast_failure", bot_id: b.id, user_id: userId, error: resData.description }));
                        }
                    } else fail++;
                } catch (err) {
                    fail++;
                    console.log(JSON.stringify({ level: "error", event: "broadcast_exception", bot_id: b.id, user_id: userId, error: err.message }));
                }
                await new Promise(r => setTimeout(r, 25));
            }
        }

        last_id = allUsers[allUsers.length - 1].id;
        if (allUsers.length < limit) break;
    }

    await env.KV.delete(cursorKey);
    console.log(JSON.stringify({ level: "info", event: "broadcast_finish", bot_id: 0, type: "global", success, fail }));
    return { success, fail };
}

async function runCloneBroadcast(env, bdata) {
    const ownersRes = await queryDB(env, 'SELECT DISTINCT owner_id FROM clones WHERE status = ?', ['active']);
    const owners = ownersRes.results;
    let success = 0, fail = 0;

    console.log(JSON.stringify({ level: "info", event: "broadcast_start", type: "clone_owners", count: owners.length }));

    for (const o of owners) {
        try {
            const resData = await copyMessage(env.BOT_TOKEN, o.owner_id, bdata.from_chat_id, bdata.message_id);
            if (resData && resData.ok) {
                success++;
                console.log(JSON.stringify({ level: "info", event: "broadcast_send", bot_id: 0, user_id: o.owner_id }));
            } else if (resData) {
                fail++;
                if (resData.description !== "Forbidden: bot was blocked by the user") {
                    console.log(JSON.stringify({ level: "warn", event: "broadcast_failure", bot_id: 0, user_id: o.owner_id, error: resData.description }));
                }
            } else fail++;
        } catch (err) {
            fail++;
            console.log(JSON.stringify({ level: "error", event: "broadcast_exception", bot_id: 0, user_id: o.owner_id, error: err.message }));
        }
        await new Promise(r => setTimeout(r, 25));
    }

    console.log(JSON.stringify({ level: "info", event: "broadcast_finish", type: "clone_owners", success, fail }));
    return { success, fail };
}

// Telegram API Helpers
async function safeTelegramCall(url, payload) {
    try {
        let response = await fetch(url, payload);
        let data;
        try {
            data = await response.json();
        } catch (e) {
            console.error(JSON.stringify({ level: "error", event: "telegram_api_json_parse_error", url, status: response.status }));
            return null;
        }

        if (!data.ok && response.status === 429) {
            const retryAfter = data.parameters?.retry_after || 1;
            console.log(JSON.stringify({ level: "warn", event: "429_retry", url, retryAfter }));
            await new Promise(r => setTimeout(r, (retryAfter * 1000) + 1000));

            response = await fetch(url, payload);
            try {
                data = await response.json();
            } catch (e) {
                return null;
            }
        }
        return data; // returns the parsed JSON object
    } catch (err) {
        console.error(JSON.stringify({ level: "error", event: "telegram_api_error", error: err.message, url }));
        return null;
    }
}

async function sendMessage(token, chatId, text, options = {}) {
    const parse_mode = options.parse_mode === undefined ? 'HTML' : options.parse_mode;
    const body = {
        chat_id: (chatId && typeof chatId === 'object' && chatId.id) ? chatId.id : chatId,
        text: text,
        ...options
    };
    if (parse_mode) body.parse_mode = parse_mode;
    else delete body.parse_mode;

    const autoDelete = options.auto_delete === true;
    const executionCtx = options.ctx?.executionCtx || options.executionCtx;

    delete body.auto_delete;
    delete body.ctx;
    delete body.executionCtx;

    const data = await safeTelegramCall(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (autoDelete && data && data.ok && executionCtx) {
        const msgId = data.result.message_id;
        const targetId = body.chat_id;
        executionCtx.waitUntil((async () => {
            await new Promise(r => setTimeout(r, 15000));
            try { await deleteMessage(token, targetId, msgId); } catch (e) { }
        })());
    }
    return data || { ok: false, description: "Telegram API Failure" };
}


async function sendMedia(token, chatId, msg, options = {}) {
    let endpoint, body;
    const parse_mode = options.parse_mode === undefined ? 'HTML' : options.parse_mode;
    const bodyBase = { chat_id: chatId, parse_mode: parse_mode, ...options };

    if (msg.caption && !msg.sticker) {
        bodyBase.caption = msg.caption;
    } else {
        delete bodyBase.caption;
    }

    if (msg.text) {
        endpoint = `sendMessage`;
        body = { ...bodyBase, text: msg.text };
    } else if (msg.sticker) {
        endpoint = `sendSticker`;
        const { caption, parse_mode, ...stickerBody } = bodyBase;
        body = { ...stickerBody, sticker: typeof msg.sticker === 'string' ? msg.sticker : msg.sticker.file_id };
    } else if (msg.photo) {
        endpoint = `sendPhoto`;
        const val = typeof msg.photo === 'string' ? msg.photo : msg.photo[msg.photo.length - 1].file_id;
        body = { ...bodyBase, photo: val };
    } else if (msg.animation) {
        endpoint = `sendAnimation`;
        const val = typeof msg.animation === 'string' ? msg.animation : msg.animation.file_id;
        body = { ...bodyBase, animation: val };
    } else if (msg.video) {
        endpoint = `sendVideo`;
        const val = typeof msg.video === 'string' ? msg.video : msg.video.file_id;
        body = { ...bodyBase, video: val };
    } else if (msg.document) {
        endpoint = `sendDocument`;
        const val = typeof msg.document === 'string' ? msg.document : msg.document.file_id;
        body = { ...bodyBase, document: val };
    } else {
        throw new Error('Unsupported media type');
    }

    const url = `https://api.telegram.org/bot${token}/${endpoint}`;

    let data = await safeTelegramCall(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (data && !data.ok && data.description?.includes("can't parse entities") && body.parse_mode === 'MarkdownV2') {
        console.warn(`MarkdownV2 parsing failed for media, falling back to plain text. Error: ${data.description}`);
        // Clean text for plain fallback
        const cleanCaption = msg.caption ? msg.caption.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1') : undefined;
        const cleanText = msg.text ? msg.text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1') : undefined;

        const fallbackBody = { ...body, parse_mode: undefined };
        if (msg.text) fallbackBody.text = cleanText;
        if (msg.caption) fallbackBody.caption = cleanCaption;

        data = await safeTelegramCall(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackBody)
        });
    }
    return data || { ok: false, description: "Telegram API Failure" };
}

async function handleCloneAction(prefetchedClone, id, secretRef, action, env, ctx) {
    const mainToken = env.BOT_TOKEN;
    try {
        let clone = prefetchedClone;
        if (!clone) {
            if (id) clone = await env.D1.prepare('SELECT * FROM clones WHERE id = ?').bind(id).first();
            else clone = await env.D1.prepare('SELECT * FROM clones WHERE secret_ref = ?').bind(secretRef).first();
        }
        if (!clone) return;

        if (action === 'approve') {
            const webhookUrl = `${new URL(ctx.request_url).origin}/handle/${clone.secret_ref}`;

            // SECURITY: Transactional-style safety. Webhook execution MUST succeed before activation.
            const whRes = await setWebhook(clone.token, webhookUrl);
            if (whRes.ok) {
                await setMyCommands(clone.token, false);
                await queryDBRun(env, 'UPDATE clones SET status = ? WHERE id = ?', ['active', clone.id]);
                await sendMessage(mainToken, clone.owner_id, `🎊 <b>Congratulations!</b> Your bot @${clone.bot_username} has been approved and activated!\n\nUse it to stay in touch with your audience!`, { parse_mode: 'HTML' });
                await sendMessage(mainToken, ctx.super_admin_id, `✅ Activated @${clone.bot_username}`, { parse_mode: 'HTML' });
            } else {
                const whError = whRes.description || "Webhook setup failed";
                await sendMessage(mainToken, ctx.super_admin_id, `❌ Failed to activate @${escapeMarkdown(clone.bot_username)}: ${escapeMarkdown(whError)}\n(Clone status remains pending)`);
                throw new Error(`Activation failed for @${clone.bot_username}: ${whError}`);
            }
        } else if (action === 'reject') {
            await queryDBRun(env, 'DELETE FROM clones WHERE id = ?', [clone.id]);
            await sendMessage(mainToken, clone.owner_id, `❌ Your bot @${escapeMarkdown(clone.bot_username)} was rejected. Please check your token and try again.`);
            await sendMessage(mainToken, ctx.super_admin_id, `❌ Rejected @${escapeMarkdown(clone.bot_username)}`);
        } else if (action === 'delete') {
            await queryDBRun(env, 'DELETE FROM clones WHERE id = ?', [clone.id]);
            try {
                await fetch(`https://api.telegram.org/bot${clone.token}/deleteWebhook`);
                // Notify Owner
                await sendMessage(mainToken, clone.owner_id, MESSAGES.CLONE_DELETED_OWNER(clone.bot_username), { parse_mode: 'HTML' });
            } catch (e) {
                log(ctx, "Cleanup/Notify failed on delete", { error: e.message });
            }
            await sendMessage(mainToken, ctx.super_admin_id, `🗑️ <b>Deleted @${clone.bot_username}</b>`, { parse_mode: 'HTML' });
        }
    } catch (err) {
        await logError(env, ctx, err, "handleCloneAction");
    }
}

async function setWebhook(token, url) {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}`);
    try { return await res.json(); } catch (e) {
        const text = await res.text();
        console.error(`[setWebhook Error] ${text}`);
        return { ok: false, description: text.substring(0, 100) };
    }
}

async function setMyCommands(token, isSuperBot = false) {
    const defaultCommands = [
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Help & Contact' },
        { command: 'clone', description: 'Create your own bot' }
    ];

    const adminCommands = [
        ...defaultCommands,
        { command: 'broadcast', description: 'Broadcast message' },
        { command: 'setwelcome', description: 'Set welcome message' },
        { command: 'setbuttons', description: 'Set buttons' },
        { command: 'userlist', description: 'User list' },
        { command: 'cancel', description: 'Cancel current action' }
    ];

    try {
        // Set for everyone
        await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: defaultCommands, scope: { type: 'default' } })
        });
        // Set for admins
        await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: adminCommands, scope: { type: 'all_chat_admins' } })
        });
        return { ok: true };
    } catch (e) {
        console.error(`[setMyCommands Error] ${e.message}`);
        return { ok: false, description: e.message };
    }
}

function buildKeyboard(buttonConfig) {
    if (!buttonConfig || !buttonConfig.length) return undefined;
    const grid = [];
    for (let i = 0; i < buttonConfig.length; i += 2) grid.push(buttonConfig.slice(i, i + 2));
    return { inline_keyboard: grid };
}

async function copyMessage(token, to, fromChat, msgId, options = {}) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/copyMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: to, from_chat_id: fromChat, message_id: msgId, ...options })
    }) || { ok: false, description: "Telegram API Failure" };
}


// --- Modular Handlers ---

async function handleAdminCommands(msg, env, ctx, { command, fullCommand }) {
    const { bot_token, admin_id, bot_id, user_id, is_super_bot, super_admin_id } = ctx;
    const chatId = msg.chat.id;
    const isAdmin = user_id.toString() === admin_id || user_id.toString() === super_admin_id;
    if (!isAdmin) return false;

    const setupKey = `state:${bot_id}:${admin_id}`;
    const broadcastKey = `state:${bot_id}:broadcast:${admin_id}`;

    try {
        if (command === '/start') {
            await sendWelcome(env, ctx, chatId);
            return true;
        }

        if (command === '/help' || command === '/cmd' || command === '/cmds') {
            const helpText = `<b>📖 Available Commands</b>\n\n` +
                `👤 <b>Public</b>\n` +
                `• /start - Start the bot\n` +
                `• /clone - Request your own bot clone\n` +
                `• /help - Get help & contact info\n\n` +
                (isAdmin ? `🛡️ <b>Admin Only</b>\n` +
                    `• /broadcast - Send message to all users\n` +
                    `• /setwelcome - Customize welcome greeting\n` +
                    `• /setbuttons - Customize start buttons\n` +
                    `• /setchannel - Link channel for auto-forwarding\n` +
                    `• /delchannel - Remove linked channel\n` +
                    `• /delwelcome - Reset welcome message\n` +
                    `• /delbuttons - Remove specific buttons\n` +
                    `• /userlist - List bot users\n` +
                    `• /block - (reply) Block a user\n` +
                    `• /unblock - Unblock a user\n` +
                    `• /cancel - Cancel current setup\n\n` : '') +
                (ctx.is_super_bot ? `👑 <b>Super Admin Only</b>\n` +
                    `• /cbroadcast - Message all clone owners\n` +
                    `• /status - Server diagnostics\n` +
                    `• /req - View pending clone requests\n` +
                    `• /clones - Manage active clones\n\n` : '') +
                `<i>For further help contact the owner @thv_haru</i>`;
            if (ctx.is_super_bot) {
                await sendMessage(bot_token, msg.chat.id, helpText, { parse_mode: 'HTML' });
            } else {
                // In clones, admin help should be similar but maybe a bit different? 
                // Let's keep it consistent for now but use HTML.
                await sendMessage(bot_token, msg.chat.id, helpText, { parse_mode: 'HTML' });
            }
            return true;
        }

        if (command === '/cancel') {
            await env.KV.delete(setupKey);
            await env.KV.delete(broadcastKey);
            await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
            return true;
        }

        if (command === '/status' && is_super_bot) {
            const clones = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE status = ?', ['active']);
            const mainUsers = await queryDBFirst(env, 'SELECT count(*) as c FROM users WHERE bot_id = ?', [bot_id]);
            const globalUsers = await queryDBFirst(env, 'SELECT count(*) as c FROM users');

            const status = `<b>${MESSAGES.STATUS_TITLE}</b>\n\n` +
                `🤖 <b>Active Clones:</b> <code>${clones?.c || 0}</code>\n` +
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
                const clonesCountRes = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE owner_id = ? AND status != ?', [user_id, 'rejected']);
                const clonesCount = clonesCountRes?.c || 0;
                const user = await queryDBFirst(env, 'SELECT extra_clones FROM users WHERE user_id = ? AND bot_id = 0', [user_id]);
                const limit = 1 + (user?.extra_clones || 0);

                if (clonesCount >= limit && user_id.toString() !== super_admin_id) {
                    return await sendMessage(bot_token, chatId, "❌ <b>Limit Reached!</b>\nYou already have your allowed number of bots. If you need another, please use /request to ask for permission.", { parse_mode: 'HTML' });
                }
                await env.KV.put(setupKey, JSON.stringify({ type: 'clone_collect' }), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: 'HTML' });
            } else {
                await sendMessage(bot_token, chatId, `To create your own bot, please visit: ${MAIN_BOT_USERNAME}`);
            }
            return true;
        }

        if (command === '/request' && is_super_bot) {
            const clonesCountRes = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE owner_id = ? AND status != ?', [user_id, 'rejected']);
            const clonesCount = clonesCountRes?.c || 0;
            if (clonesCount === 0) return await sendMessage(bot_token, chatId, "You don't have any bots yet. Use /clone first!");

            await env.KV.put(`state:0:extra_req:${user_id}`, "1", { expirationTtl: 86400 * 7 });
            await sendMessage(bot_token, super_admin_id, MESSAGES.EXTRA_CLONE_ADMIN_NOTIFY(msg.from.first_name, user_id), { parse_mode: 'HTML' });
            await sendMessage(bot_token, chatId, "✅ <b>Request sent!</b> Please wait for the reply.", { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/userlist') {
            const usersRes = await queryDB(env, 'SELECT user_id, username, first_name FROM users WHERE bot_id = ? LIMIT 50', [bot_id]);
            const users = usersRes.results;
            if (!users.length) return await sendMessage(bot_token, chatId, 'No users yet.');
            let list = '<b>👥 Users:</b>\n\n' + users.map(u => {
                const name = (u.first_name && u.first_name !== 'User') ? u.first_name : "";
                const identifier = u.username ? `@${u.username}` : `<code>${u.user_id}</code>`;
                return name ? `• ${name} - ${identifier}` : `• ${identifier}`;
            }).join('\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/broadcast') {
            await env.KV.put(broadcastKey, JSON.stringify({ type: 'pending' }), { expirationTtl: 300 });
            await sendMessage(bot_token, chatId, MESSAGES.BROADCAST_PROMPT, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/block') {
            let targetId = fullCommand.split(/\s+/)[1];
            if (!targetId && msg.reply_to_message) {
                const ref = msg.reply_to_message.message_id;
                const m = await env.D1.prepare('SELECT user_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(ref, bot_id).first();
                targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
            }

            if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.BLOCK_USAGE, { parse_mode: 'HTML' });

            const user = await queryDBFirst(env, 'SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?', [targetId, targetId.replace('@', ''), bot_id]);
            if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: 'HTML' });

            await queryDBRun(env, 'INSERT INTO blocked_users (user_id, bot_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [user.user_id, bot_id, Math.floor(Date.now() / 1000)]);
            await sendMessage(bot_token, chatId, MESSAGES.USER_BLOCKED_SUCCESS(user.first_name), { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/unblock') {
            let targetId = fullCommand.split(/\s+/)[1];
            if (!targetId && msg.reply_to_message) {
                const ref = msg.reply_to_message.message_id;
                const m = await env.D1.prepare('SELECT user_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(ref, bot_id).first();
                targetId = m?.user_id || msg.reply_to_message.forward_from?.id;
            }

            if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.UNBLOCK_USAGE, { parse_mode: 'HTML' });

            const user = await queryDBFirst(env, 'SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?', [targetId, targetId.replace('@', ''), bot_id]);
            if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: 'HTML' });

            await queryDBRun(env, 'DELETE FROM blocked_users WHERE user_id = ? AND bot_id = ?', [user.user_id, bot_id]);
            await sendMessage(bot_token, chatId, MESSAGES.USER_UNBLOCKED_SUCCESS(user.first_name), { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/setwelcome') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'welcome_count' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PROMPT);
            return true;
        }

        if (command === '/setbuttons') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'buttons' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_PROMPT, { parse_mode: 'HTML' });
            return true;
        }

        if (command === '/setchannel') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'channel' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_PROMPT);
            return true;
        }

        if (command === '/delwelcome') {
            await env.KV.delete(`config:${bot_id}:welcome`);
            await sendMessage(bot_token, chatId, "Welcome message reset.");
            return true;
        }

        if (command === '/delchannel') {
            await env.KV.delete(`config:${bot_id}:channel`);
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_REMOVED);
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
            const reqs = (await env.D1.prepare('SELECT * FROM clones WHERE status = ? ORDER BY id ASC').bind('pending').all()).results;
            const extraReqKeys = (await env.KV.list({ prefix: 'state:0:extra_req:' })).keys;

            if (!reqs.length && !extraReqKeys.length) return await sendMessage(bot_token, chatId, "No pending requests.");

            let text = "";
            if (reqs.length) {
                text += "⏳ <b>Pending Bot Tokens:</b>\n" + reqs.map((r, i) => `${i + 1}. @${r.bot_username}\n   /approve_${i + 1} | /reject_${i + 1}`).join('\n\n') + "\n\n";
            }
            if (extraReqKeys.length) {
                text += "🎫 <b>Extra Bot Requests:</b>\n";
                for (const k of extraReqKeys) {
                    const uid = k.name.split(':').pop();
                    text += `• User <code>${uid}</code>\n  /approve_extra_${uid} | /reject_extra_${uid}\n`;
                }
            }
            await sendMessage(bot_token, chatId, text, { parse_mode: 'HTML' });
            return true;
        }

        if (is_super_bot && (command.startsWith('/approve_extra_') || command.startsWith('/reject_extra_'))) {
            const [action, , targetUid] = command.split('_');
            const isApprove = action === '/approve';
            await env.KV.delete(`state:0:extra_req:${targetUid}`);

            if (isApprove) {
                await env.D1.prepare('UPDATE users SET extra_clones = extra_clones + 1 WHERE user_id = ? AND bot_id = 0').bind(targetUid).run();
                await sendMessage(env.BOT_TOKEN, targetUid, MESSAGES.EXTRA_CLONE_APPROVED, { parse_mode: 'HTML' });
                await sendMessage(bot_token, chatId, `✅ Approved extra bot for <code>${targetUid}</code>`);
            } else {
                await sendMessage(env.BOT_TOKEN, targetUid, MESSAGES.EXTRA_CLONE_REJECTED, { parse_mode: 'HTML' });
                await sendMessage(bot_token, chatId, `❌ Rejected extra bot for <code>${targetUid}</code>`);
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

            if (!clones.length) return await sendMessage(bot_token, chatId, "No active clones.");
            let list = "🤖 <b>Active Clones:</b>\n\n" + clones.map((c, i) => {
                const name = c.first_name || 'User';
                const uname = c.username ? ` (@${c.username})` : ` [<code>${c.owner_id}</code>]`;
                return `${i + 1}. @${c.bot_username}\n   Owner: ${name}${uname}\n   ID: ${i + 1} | /delclone_${i + 1}`;
            }).join('\n\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'HTML' });
            return true;
        }

        if (is_super_bot && command === '/cbroadcast') {
            await env.KV.put(broadcastKey, JSON.stringify({ type: 'pending_owner' }), { expirationTtl: 300 });
            await sendMessage(bot_token, chatId, MESSAGES.OWNER_BROADCAST_START, { parse_mode: 'HTML' });
            return true;
        }


        // Sub-commands
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

    } catch (err) { await logError(env, ctx, err, "handleAdminCommands"); }
    return false;
}

async function handleSetupState(msg, env, ctx, state) {
    const { bot_token, admin_id, bot_id, user_id } = ctx;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const key = `state:${bot_id}:${user_id}`;

    try {
        if (text.toLowerCase().split('@')[0] === '/cancel') {
            await env.KV.delete(key);
            await env.KV.delete(`state:${bot_id}:broadcast:${user_id}`);
            await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
            return true;
        }

        if (state.type === 'welcome_count') {
            const n = parseInt(text, 10);
            if (n === 1 || n === 2) {
                state.type = 'welcome_collect'; state.targetCount = n; state.messages = [];
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.STEP_1_WELCOME);
            } else await sendMessage(bot_token, chatId, 'Please send 1 or 2.');
            return true;
        }

        if (state.type === 'welcome_collect') {
            let msgData;
            if (msg.text) msgData = { type: 'text', content: msg.text };
            else if (msg.sticker) msgData = { type: 'sticker', file_id: msg.sticker.file_id };
            else if (msg.photo) msgData = { type: 'photo', file_id: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption };
            else if (msg.animation) msgData = { type: 'animation', file_id: msg.animation.file_id, caption: msg.caption };
            else if (msg.video) msgData = { type: 'video', file_id: msg.video.file_id, caption: msg.caption };
            else if (msg.document) msgData = { type: 'document', file_id: msg.document.file_id, caption: msg.caption };

            if (!msgData) return await sendMessage(bot_token, chatId, MESSAGES.WELCOME_UNSUPPORTED);

            state.messages.push(msgData);
            if (state.messages.length < state.targetCount) {
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.STEP_2_WELCOME);
            } else {
                await env.KV.put(key, JSON.stringify(state), { expirationTtl: 600 });
                await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PREVIEW, { parse_mode: 'HTML' });
                for (const m of state.messages) {
                    if (m.type === 'text') await sendMessage(bot_token, chatId, m.content);
                    else await sendMedia(bot_token, chatId, { [m.type]: m.file_id, caption: m.caption });
                }
                await sendMessage(bot_token, chatId, MESSAGES.WELCOME_SAVE_CONFIRM, { reply_markup: { inline_keyboard: [[{ text: '✅ Save', callback_data: 'save_welcome' }, { text: '❌ Cancel', callback_data: 'cancel_welcome' }]] } });
            }
            return true;
        }

        if (state.type === 'buttons') {
            const btns = [];
            text.split('\n').filter(l => l.trim()).forEach(l => {
                const [label, url] = l.split('|').map(s => s.trim());
                if (label && url) btns.push({ text: label, url: url.startsWith('@') ? `https://t.me/${url.substring(1)}` : url });
            });
            if (btns.length > 2) return await sendMessage(bot_token, chatId, "❌ <b>Limit Reached!</b>\nYou can only add up to 2 buttons. Please contact the owner if you need more.", { parse_mode: 'HTML' });
            if (btns.length) {
                await env.KV.put(`config:${bot_id}:buttons`, JSON.stringify(btns));
                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_UPDATED(btns.length));
            } else await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_INVALID);
            return true;
        }

        if (state.type === 'channel') {
            const cid = msg.forward_from_chat?.id?.toString() || (text.startsWith('-100') ? text.trim() : null);
            if (cid) {
                await env.KV.put(`config:${bot_id}:channel`, cid);
                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_LINKED(cid), { parse_mode: 'HTML' });
            } else await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_INVALID);
            return true;
        }

        if (state.type === 'clone_collect' && /^\d+:[\w-]+$/.test(text.trim())) {
            const token = text.trim();

            const exists = await queryDBFirst(env, 'SELECT bot_username FROM clones WHERE token = ?', [token]);
            if (exists) {
                await env.KV.delete(key);
                return await sendMessage(bot_token, chatId, `❌ This bot @${exists.bot_username} is already registered in our system.`);
            }

            const meRes = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
            if (!meRes.ok) throw new Error(meRes.description || "Invalid bot token");

            const botUsername = meRes.result.username;
            const userExists = await queryDBFirst(env, 'SELECT id FROM clones WHERE bot_username = ?', [botUsername]);
            if (userExists) {
                await env.KV.delete(key);
                return await sendMessage(bot_token, chatId, `❌ The username @${botUsername} is already taken as a clone. If this is your bot, please contact support.`);
            }

            const ref = Math.random().toString(36).substring(7);
            const insert = await queryDBRun(env, 'INSERT INTO clones (token, owner_id, bot_username, secret_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [token, user_id, botUsername, ref, 'pending', Math.floor(Date.now() / 1000)]);

            if (!insert.success) {
                if (insert.error.includes('UNIQUE constraint failed: clones.token')) {
                    await env.KV.delete(key);
                    return await sendMessage(bot_token, chatId, "❌ <b>Duplicate Token!</b>\nThis bot token is already being used by another clone.", { parse_mode: 'HTML' });
                }
                throw new Error(insert.error);
            }

            await env.KV.delete(key);
            await sendMessage(bot_token, chatId, MESSAGES.CLONE_REQUEST_SENT(botUsername), { parse_mode: 'HTML' });
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `🆕 <b>New Clone Request</b>\n\nBot: @${botUsername}\nOwner: <code>${user_id}</code>`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_clone:${ref}` }, { text: '❌ Reject', callback_data: `reject_clone:${ref}` }]] } });
            return true;
        }

        if (state.type === 'gbroadcast_collect') {
            await env.KV.put(state.id, JSON.stringify({ from_chat_id: chatId, message_id: msg.message_id }), { expirationTtl: 3600 });
            await env.KV.delete(key);
            await copyMessage(bot_token, chatId, chatId, msg.message_id, { reply_markup: { inline_keyboard: [[{ text: '🚀 Launch Global', callback_data: `confirm_gbroadcast:${state.id}` }, { text: '❌ Cancel', callback_data: `cancel_${state.id}` }]] } });
            return true;
        }
    } catch (err) { await logError(env, ctx, err, "handleSetupState"); }
    return false;
}

async function handleBroadcastState(msg, env, ctx, state) {
    const { bot_token, admin_id, bot_id } = ctx;
    const bid = `b:${bot_id}:${Date.now()}`;
    await env.KV.put(bid, JSON.stringify({ from_chat_id: msg.chat.id, message_id: msg.message_id }), { expirationTtl: 3600 });
    await env.KV.delete(`state:${bot_id}:broadcast:${admin_id}`);

    // If super admin on main bot, always use global confirm
    const isMainAdmin = ctx.is_super_bot && bot_id === 0;
    const cb = (isMainAdmin && state.type === 'pending') ? `confirm_gbroadcast:${bid}` :
        (state.type === 'pending' ? `confirm_broadcast:${bid}` : `confirm_cbroadcast:${bid}`);

    await sendMessage(bot_token, admin_id, "✨ <b>Broadcast Preview:</b>", { parse_mode: 'HTML' });
    await copyMessage(bot_token, admin_id, msg.chat.id, msg.message_id, { reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: cb }, { text: '❌ Cancel', callback_data: `cancel_${bid}` }]] } });
    return true;
}

async function handleReplyFlow(msg, env, ctx) {
    const { bot_token, admin_id, bot_id } = ctx;
    const ref = msg.reply_to_message.message_id;
    const m = await queryDBFirst(env, 'SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?', [ref, bot_id]);
    const targetId = m?.user_id || msg.reply_to_message.forward_from?.id;

    if (!targetId || targetId.toString() === admin_id) return false;

    // SECURITY: Blocked enforcement. Admin cannot reply to blocked users.
    const blocked = await queryDBFirst(env, 'SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?', [targetId, bot_id]);
    if (blocked) {
        await sendMessage(bot_token, admin_id, `❌ Cannot reply: User <code>${targetId}</code> is blocked on this bot.`, { parse_mode: 'HTML' });
        return true;
    }

    const res = await sendMedia(bot_token, targetId, msg, m?.user_msg_id ? { reply_to_message_id: m.user_msg_id } : {});
    if (res.ok) {
        const name = msg.reply_to_message.forward_from?.first_name || 'User';
        await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(name, targetId), { parse_mode: 'HTML', auto_delete: true, ctx });
        await env.KV.put(`reply_target:${bot_id}:${admin_id}`, targetId.toString(), { expirationTtl: 86400 });
    } else {
        await logError(env, ctx, new Error(res.description), "ReplyFlowDeliver");
        await sendMessage(bot_token, admin_id, `❌ <b>Failed to deliver reply:</b> ${res.description}`, { parse_mode: 'HTML' });
    }
    return true;
}

async function handleUserMessage(msg, env, ctx) {
    const { bot_token, admin_id, bot_id, user_id } = ctx;
    console.log(`[UserMsg] From: ${user_id}, To Admin: ${admin_id}, BotID: ${bot_id}`);

    // SECURITY: Blocked enforcement.
    const blocked = await queryDBFirst(env, 'SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?', [user_id, bot_id]);
    if (blocked) return; // Silent discard for blocked users (don't waste resources)

    // SECURITY: Per-user rate limiting (5 msgs per 30s) - Timestamp-based sliding window
    const rlKey = `rate:${bot_id}:${user_id}`;
    let timestamps = [];
    const rlData = await env.KV.get(rlKey);
    try { if (rlData) timestamps = JSON.parse(rlData); } catch (e) { timestamps = []; }

    const nowMs = Date.now();
    timestamps = timestamps.filter(t => nowMs - t < 30000);

    if (timestamps.length >= 5) {
        if (timestamps.length === 5) await sendMessage(bot_token, user_id, MESSAGES.RATE_LIMIT, { parse_mode: 'HTML' });
        // Don't add to list if already limited, just keep existing timestamps to maintain window
        return;
    }
    timestamps.push(nowMs);
    await env.KV.put(rlKey, JSON.stringify(timestamps), { expirationTtl: 60 });

    const fullCommand = msg.text?.trim() || '';
    const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];

    // Centralized User Registration
    await upsertUser(env, bot_id, user_id, msg.from);

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
                return await sendMessage(bot_token, user_id, "❌ <b>Limit Reached!</b>\nYou already have your allowed number of bots. If you need another, please use /request to ask for permission.", { parse_mode: 'HTML' });
            }
            await env.KV.put(`state:${bot_id}:${user_id}`, JSON.stringify({ type: 'clone_collect' }), { expirationTtl: 600 });
            await sendMessage(bot_token, user_id, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: 'HTML' });
        } else {
            await sendMessage(bot_token, user_id, `To create your own bot, please visit: ${MAIN_BOT_USERNAME}`);
        }
        return;
    }

    if (command === '/request' && ctx.is_super_bot) {
        const clonesCountRes = await queryDBFirst(env, 'SELECT count(*) as c FROM clones WHERE owner_id = ? AND status != ?', [user_id, 'rejected']);
        const clonesCount = clonesCountRes?.c || 0;
        if (clonesCount === 0) return await sendMessage(bot_token, user_id, "You don't have any bots yet. Use /clone first!");

        await env.KV.put(`state:0:extra_req:${user_id}`, "1", { expirationTtl: 86400 * 7 });
        await sendMessage(bot_token, ctx.super_admin_id, MESSAGES.EXTRA_CLONE_ADMIN_NOTIFY(msg.from.first_name, user_id), { parse_mode: 'HTML' });
        await sendMessage(bot_token, user_id, "✅ <b>Request sent!</b> Please wait for the reply.", { parse_mode: 'HTML' });
        return;
    }

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
                `Want your own contact bot? Create one easily at ${MAIN_BOT_USERNAME}!`;
            await sendMessage(bot_token, user_id, helpText, { parse_mode: 'HTML' });
        }
        return;
    }

    try {
        const fwd = await forwardMessage(bot_token, admin_id, msg.chat.id, msg.message_id);
        console.log(`[UserMsg] Forward Status: ${fwd.ok}, Desc: ${fwd.description || 'none'}`);

        if (fwd.ok) {
            await env.KV.put(`reply_target:${bot_id}:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
            await queryDBRun(env, 'INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)', [fwd.result.message_id, user_id, msg.message_id, bot_id, Math.floor(Date.now() / 1000)]);

            const prevConfId = await env.KV.get(`state:${bot_id}:conf:${user_id}`);
            if (prevConfId) {
                try { await deleteMessage(bot_token, user_id, parseInt(prevConfId)); } catch (e) { /* ignore */ }
            }

            const conf = await sendMessage(bot_token, user_id, MESSAGES.CONFIRMATION, { auto_delete: true, ctx });
            if (conf.ok) await env.KV.put(`state:${bot_id}:conf:${user_id}`, conf.result.message_id.toString(), { expirationTtl: 86400 });
        } else {
            await logError(env, ctx, new Error(fwd.description), "UserMsgForward");
        }
    } catch (e) {
        console.error(`[UserMsg Error] ${e.message}`);
        await logError(env, ctx, e, "UserMsgBatch");
    }
}

// Utility
async function queryDB(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).all();
    } catch (e) {
        console.error(`[D1 Error] ${e.message}`, { sql, params });
        return { results: [], success: false, error: e.message };
    }
}

async function queryDBFirst(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).first();
    } catch (e) {
        console.error(`[D1 First Error] ${e.message}`, { sql, params });
        return null;
    }
}

async function queryDBRun(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).run();
    } catch (e) {
        console.error(`[D1 Run Error] ${e.message}`, { sql, params });
        return { success: false, error: e.message };
    }
}

async function upsertUser(env, bot_id, user_id, from) {
    if (!from) return;
    const now = Math.floor(Date.now() / 1000);
    await queryDBRun(env, 'INSERT INTO users (user_id, username, first_name, bot_id, last_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_active=excluded.last_active',
        [user_id, from.username || '', from.first_name || '', bot_id, now]);
}

async function scheduled(event, env, ctx) {
    const cutoff = Math.floor(Date.now() / 1000) - 1296000; // 15 days messages
    await queryDBRun(env, 'DELETE FROM messages WHERE created_at < ?', [cutoff]);

    // Cleanup users inactive for 90+ days
    const userCutoff = Math.floor(Date.now() / 1000) - 7776000;
    await queryDBRun(env, 'DELETE FROM users WHERE last_active < ?', [userCutoff]);
}

function escapeMarkdown(text) {
    if (!text) return '';
    const chars = '_*[\]()~`>#+\-=|{}.!\\';
    let result = '';
    for (const char of String(text)) {
        if (chars.includes(char)) result += '\\' + char;
        else result += char;
    }
    return result;
}

async function forwardMessage(token, to, from, mid) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/forwardMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}

async function deleteMessage(token, cid, mid) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: cid, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}

async function answerCallbackQuery(token, qid, text) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: qid, text }) }) || { ok: false, description: "Telegram API Failure" };
}

async function sendWelcome(env, ctx, targetId) {
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
            if (item.type === 'text') await sendMessage(bot_token, targetId, item.content, { reply_markup: kb });
            else await sendMedia(bot_token, targetId, { [item.type]: item.file_id, caption: item.caption }, { reply_markup: kb });
        }
    } else {
        await sendMessage(bot_token, targetId, MESSAGES.START_GREETING, { reply_markup: buildKeyboard(buttons) });
    }
}

async function getChat(token, chatId) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/getChat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }) }) || { ok: false, description: "Telegram API Failure" };
}
