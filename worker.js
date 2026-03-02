const MESSAGES = {
    START_GREETING: "Hey there! You can contact us using this bot, just send your message and we will get back to you as soon as possible.",
    CANCELLED_ALL: "❌ All active processes (setup/broadcast) have been cancelled.",
    NO_ACTIVE_CANCEL: "No active setup or broadcast to cancel.",
    RATE_LIMIT: "⚠️ Please wait before sending more messages.",
    NO_LAST_TARGET: "❌ No last target found. Reply to a user first to set one.",
    QUICK_REPLY_EMPTY: "❌ Please provide a message after !.",
    QUICK_REPLY_SENT: (targetId) => `✅ Message sent to user \`${targetId}\``,
    STEP_1_WELCOME: "Step 1: Send the first message (Text, Photo, Sticker, GIF, etc.)",
    STEP_2_WELCOME: "Step 2: Send the second message (Text, Photo, Sticker, GIF, etc.)",
    WELCOME_SAVE_CONFIRM: "Confirm saving this sequence?",
    WELCOME_UNSUPPORTED: "Unsupported media type for welcome message. Please send text, sticker, photo, GIF, video, or document.",
    BUTTONS_UPDATED: (count) => `✅ ${count} buttons updated successfully!`,
    BUTTONS_INVALID: "❌ Invalid format. Please send buttons in `Label | Link` format, one per line.",
    CHANNEL_LINKED: (id) => `✅ Channel linked successfully! ID: \`${id}\`\nMake sure the bot is an admin in that channel.`,
    CHANNEL_INVALID: "❌ Invalid channel. Please forward a message from the channel or send the correct ID.",
    CLONE_TOKEN_INVALID: "❌ Invalid bot token format. It should look like `12345:6789ABCDEF`.",
    CLONE_REQUEST_SENT: (username) => `✅ Request sent! Your bot @${escapeMarkdown(username)} is now pending approval from the Super Admin.`,
    CLONE_PENDING_TITLE: "⏳ *Pending Clone Requests:*\n\n",
    ACTIVE_CLONES_TITLE: "🚀 *Active Clones:*\n\n",
    REQ_INVALID: "❌ Invalid request number.",
    CLONE_DEL_INVALID: "❌ Invalid clone number.",
    OWNER_BROADCAST_START: "📢 *Owner Broadcast Mode*\n\nSend me the message you want to broadcast to EVERY clone owner.",
    GLOBAL_BROADCAST_START: "📢 *Global Broadcast Mode*\n\nSend me the message you want to broadcast to EVERY user in EVERY cloned bot.",
    BROADCAST_PROMPT: "Please send the message or media you want to broadcast. You can also *forward* a message from a channel here.",
    WELCOME_PROMPT: "How many welcome messages do you want? (1 or 2)",
    BUTTONS_PROMPT: "Please send your buttons. You can use any format, e.g.:\n`Join Channel | @mychannel`\n`Support | t.me/user`",
    CHANNEL_PROMPT: "Please forward a message FROM the channel you want to link, or send the Channel ID (starting with -100).",
    RESET_DEFAULT: "✅ Welcome message and buttons have been reset to default.",
    NO_BUTTONS: "No buttons to delete.",
    BUTTON_DELETE_SELECT: "Select a button to delete:",
    BLOCKED_USER: "You have been blocked from using this bot.",
    USER_BLOCKED_SUCCESS: (name) => `✅ User ${name} blocked.`,
    UNBLOCK_USAGE: "Please provide a username (e.g., @username) or user ID, or reply to a forwarded message. Usage: /unblock <username/user_id>",
    USER_NOT_FOUND: (val) => `User ${val} not found.`,
    USER_UNBLOCKED_SUCCESS: (name) => `✅ User ${name} unblocked.`,
    USER_NOT_BLOCKED: (name) => `User ${name} was not blocked on this bot.`,
    CHANNEL_REMOVED: "✅ Linked channel removed.",
    STATUS_TITLE: "ℹ️ *Bot Status*",
    STATUS_FOOTER: "_Command menu synchronized for this bot_",
    REPLIED_SUCCESS: (link) => `✅ Replied to ${link}`,
    USER_UNREACHABLE: (id, desc) => `User ${id} unreachable: ${desc}`,
    BROADCAST_REPORT: (success, fail) => `Broadcast sent to ${success} users, failed for ${fail} users.`,
    FORWARD_REPORT: (success, fail) => `📢 *Auto-Forward Report*\n✅ Sent to ${success} users\n❌ Failed for ${fail} users`
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

    if (ctx?.super_admin_id && env.BOT_TOKEN) {
        try {
            const report = `⚠️ *System Error* [${escapeMarkdown(context)}]\n` +
                `• Bot ID: \`${ctx.bot_id}\`\n` +
                `• User ID: \`${ctx.user_id}\`\n\n` +
                `\`${escapeMarkdown(errorMsg)}\``;
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, report, { parse_mode: 'MarkdownV2' });
        } catch (e) {
            console.error("Failed to send error report:", e.message);
        }
    }
}

export default {
    async fetch(request, env) {
        if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        const url = new URL(request.url);
        const path = url.pathname;
        const superAdminId = env.ADMIN_ID?.toString().trim();

        let ctx = {
            bot_id: 0,
            bot_token: env.BOT_TOKEN,
            admin_id: superAdminId,
            super_admin_id: superAdminId,
            is_super_bot: true,
            request_url: request.url
        };

        if (path.startsWith('/handle/')) {
            const secretRef = path.split('/')[2];
            const clone = await env.D1.prepare('SELECT * FROM clones WHERE secret_ref = ? AND status = ?').bind(secretRef, 'active').first();
            if (!clone) return new Response('Forbidden', { status: 403 });
            ctx = {
                bot_id: clone.id,
                bot_token: clone.token,
                admin_id: clone.owner_id.toString(),
                super_admin_id: superAdminId,
                is_super_bot: false,
                request_url: request.url
            };
        }

        try {
            const update = await request.json();
            ctx.user_id = update.message?.from?.id || update.callback_query?.from?.id || update.channel_post?.from?.id || 0;

            if (update.message) {
                const channelId = await env.KV.get(`bot:${ctx.bot_id}:config:channel_id`);
                if (channelId && update.message.chat.id.toString() === channelId && !update.message.from?.is_bot) await handleChannelPost(update.message, env, ctx);
                else await handleMessage(update.message, env, ctx);
            } else if (update.callback_query) {
                await handleCallbackQuery(update.callback_query, env, ctx);
            } else if (update.channel_post) {
                await handleChannelPost(update.channel_post, env, ctx);
            }
            return new Response('OK', { status: 200 });
        } catch (err) {
            await logError(env, ctx, err, "WebhookHandler");
            return new Response('Internal Server Error', { status: 500 });
        }
    },
    async scheduled(event, env, ctx) {
        await scheduled(event, env, ctx);
    }
};

async function handleMessage(msg, env, ctx) {
    const { bot_id, admin_id, user_id, bot_token, super_admin_id } = ctx;
    const text = msg.text || '';
    const isAdmin = user_id.toString() === admin_id || user_id.toString() === super_admin_id;

    if (isAdmin) {
        const setupStr = await env.KV.get(`bot:${bot_id}:setup:${admin_id}`);
        if (setupStr && await handleSetupState(msg, env, ctx, JSON.parse(setupStr))) return;

        const broadStr = await env.KV.get(`bot:${bot_id}:broadcast:${admin_id}`);
        if (broadStr && await handleBroadcastState(msg, env, ctx, JSON.parse(broadStr))) return;
    }

    if (text.startsWith('/')) {
        const fullCommand = text.trim();
        const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];
        if (await handleAdminCommands(msg, env, ctx, { command, fullCommand })) return;
    }

    if (isAdmin && (text.startsWith('!') || text.startsWith('.') || (msg.caption && (msg.caption.startsWith('!') || msg.caption.startsWith('.'))))) {
        const targetId = await env.KV.get(`bot:${bot_id}:last_target:${admin_id}`);
        if (!targetId) return await sendMessage(bot_token, msg.chat.id, MESSAGES.NO_LAST_TARGET);

        const content = (text || msg.caption || '').substring(1).trim();
        if (!content && !msg.photo && !msg.sticker && !msg.video && !msg.animation && !msg.document) return await sendMessage(bot_token, msg.chat.id, MESSAGES.QUICK_REPLY_EMPTY);

        const quickMsg = { ...msg };
        if (msg.text) quickMsg.text = content;
        if (msg.caption) quickMsg.caption = content;

        const res = await (await sendMedia(bot_token, targetId, quickMsg)).json();
        if (res.ok) await sendMessage(bot_token, msg.chat.id, MESSAGES.QUICK_REPLY_SENT(targetId), { parse_mode: 'MarkdownV2', auto_escape: false });
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
            const state = JSON.parse(await env.KV.get(`bot:${bot_id}:setup:${admin_id}`) || '{}');
            if (state.type === 'welcome_collect') {
                await env.KV.put(`bot:${bot_id}:config:welcome`, JSON.stringify(state.messages));
                await env.KV.delete(`bot:${bot_id}:setup:${admin_id}`);
                await sendMessage(bot_token, admin_id, '✅ Welcome messages updated!');
            }
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data === 'cancel_welcome') {
            await env.KV.delete(`bot:${bot_id}:setup:${admin_id}`);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.startsWith('delete_btn:')) {
            const index = parseInt(data.split(':')[1], 10);
            const buttons = JSON.parse(await env.KV.get(`bot:${bot_id}:config:buttons`) || '[]');
            if (buttons[index]) {
                const removed = buttons.splice(index, 1)[0];
                await env.KV.put(`bot:${bot_id}:config:buttons`, JSON.stringify(buttons));
                await answerCallbackQuery(bot_token, query.id, `Deleted ${removed.text}`);
                if (buttons.length) await fetch(`https://api.telegram.org/bot${bot_token}/editMessageReplyMarkup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: buildKeyboard(buttons) }) });
                else await deleteMessage(bot_token, chatId, messageId);
            }
        } else if (data.startsWith('confirm_gbroadcast:')) {
            const sid = data.split(':')[1];
            const bdata = JSON.parse(await env.KV.get(sid) || 'null');
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runGlobalBroadcast(env, bdata, ctx);
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'MarkdownV2', auto_escape: false });
                await env.KV.delete(sid);
            }
        } else if (data.startsWith('confirm_broadcast:')) {
            const bid = data.split(':')[1];
            const bdata = JSON.parse(await env.KV.get(bid) || 'null');
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runBroadcast(env, bot_id, bot_token, bdata, ctx);
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'MarkdownV2', auto_escape: false });
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('confirm_cbroadcast:')) {
            const bid = data.split(':')[1];
            const bdata = JSON.parse(await env.KV.get(bid) || 'null');
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const results = await runCloneBroadcast(env, bdata);
                await sendMessage(bot_token, admin_id, `Broadcast to ${results.success} owners complete.`);
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('approve_clone:')) {
            await handleCloneAction(null, data.split(':')[1], 'approve', env, ctx);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.startsWith('reject_clone:')) {
            await handleCloneAction(null, data.split(':')[1], 'reject', env, ctx);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.includes('cancel_')) {
            const bid = data.split(':')[1];
            if (bid) await env.KV.delete(bid);
            await deleteMessage(bot_token, chatId, messageId);
        }
    } catch (err) { await logError(env, ctx, err, "handleCallbackQuery"); }
}

async function handleChannelPost(post, env, ctx) {
    const { bot_token, bot_id, admin_id } = ctx;
    const channelId = await env.KV.get(`bot:${bot_id}:config:channel_id`);
    if (!channelId || post.chat.id.toString() !== channelId) return;

    let success = 0, fail = 0;
    let offset = 0;
    const limit = 500;

    while (true) {
        const users = (await env.D1.prepare(`
            SELECT u.user_id 
            FROM users u 
            LEFT JOIN blocked_users b ON u.user_id = b.user_id AND b.bot_id = ? 
            WHERE b.user_id IS NULL AND u.bot_id = ?
            LIMIT ? OFFSET ?
        `).bind(bot_id, bot_id, limit, offset).all()).results;

        if (!users.length) break;

        for (const u of users) {
            try {
                const res = await (await forwardMessage(bot_token, u.user_id, post.chat.id, post.message_id)).json();
                if (res.ok) {
                    success++;
                } else {
                    fail++;
                    if (res.description !== "Forbidden: bot was blocked by the user") {
                        await logError(env, { ...ctx, user_id: u.user_id }, new Error(res.description), "ChannelPostForward");
                    }
                }
            } catch (err) {
                fail++;
                await logError(env, { ...ctx, user_id: u.user_id }, err, "ChannelPostTarget");
            }
            if ((success + fail) % 30 === 0) await new Promise(r => setTimeout(r, 1000));
        }

        if (users.length < limit) break;
        offset += limit;
        await new Promise(r => setTimeout(r, 500));
    }

    if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(success, fail), { parse_mode: 'MarkdownV2', auto_escape: false });
}

// Higher-level Broadcast Helpers
async function runBroadcast(env, botId, token, bdata, ctx) {
    let success = 0, fail = 0;
    let offset = 0;
    const limit = 500;

    while (true) {
        // SECURITY: Paginated fetch to prevent memory exhaustion and Worker timeouts.
        const users = (await env.D1.prepare(`
            SELECT u.user_id 
            FROM users u 
            LEFT JOIN blocked_users bl ON u.user_id = bl.user_id AND bl.bot_id = ? 
            WHERE bl.user_id IS NULL AND u.bot_id = ? 
            LIMIT ? OFFSET ?
        `).bind(botId, botId, limit, offset).all()).results;

        if (!users.length) break;

        for (const u of users) {
            try {
                const res = await copyMessage(token, u.user_id, bdata.from_chat_id, bdata.message_id);
                const resData = await res.json();
                if (resData.ok) {
                    success++;
                } else {
                    fail++;
                    // Log structured error for each failed delivery (except blocked by user)
                    if (resData.description !== "Forbidden: bot was blocked by the user") {
                        await logError(env, { ...ctx, user_id: u.user_id }, new Error(resData.description), "BroadcastDelivery");
                    }
                }
            } catch (err) {
                fail++;
                await logError(env, { ...ctx, user_id: u.user_id }, err, "BroadcastTarget");
            }

            // SECURITY: Rate limit conscious delay (30 msgs/sec limit for bots)
            if ((success + fail) % 30 === 0) await new Promise(r => setTimeout(r, 1000));
        }

        if (users.length < limit) break;
        offset += limit;

        // Safety delay between large batches
        await new Promise(r => setTimeout(r, 500));
    }
    return { success, fail };
}

async function runGlobalBroadcast(env, bdata, ctx) {
    const bots = [{ id: 0, token: env.BOT_TOKEN }];
    const clones = (await env.D1.prepare('SELECT id, token FROM clones WHERE status = ?').bind('active').all()).results;
    bots.push(...clones);

    const botIds = bots.map(b => b.id);
    const placeholders = botIds.map(() => '?').join(',');

    let success = 0, fail = 0;
    let offset = 0;
    const limit = 500;

    while (true) {
        // SECURITY: Paginated fetch to prevent worker memory/timeout issues.
        const { results: allUsers } = await env.D1.prepare(`
            SELECT u.user_id, u.bot_id 
            FROM users u 
            LEFT JOIN blocked_users bl ON u.user_id = bl.user_id AND bl.bot_id = u.bot_id 
            WHERE bl.user_id IS NULL AND u.bot_id IN (${placeholders})
            LIMIT ? OFFSET ?
        `).bind(...botIds, limit, offset).all();

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
                    const res = await copyMessage(b.token, userId, bdata.from_chat_id, bdata.message_id);
                    const resData = await res.json();
                    if (resData.ok) {
                        success++;
                    } else {
                        fail++;
                        if (resData.description !== "Forbidden: bot was blocked by the user") {
                            await logError(env, { ...ctx, user_id: userId, bot_id: b.id }, new Error(resData.description), "GlobalBroadcastDelivery");
                        }
                    }
                } catch (err) {
                    fail++;
                    await logError(env, { ...ctx, user_id: userId, bot_id: b.id }, err, "GlobalBroadcastTarget");
                }
                if ((success + fail) % 30 === 0) await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (allUsers.length < limit) break;
        offset += limit;
        await new Promise(r => setTimeout(r, 500));
    }
    return { success, fail };
}

async function runCloneBroadcast(env, bdata) {
    const owners = (await env.D1.prepare('SELECT DISTINCT owner_id FROM clones WHERE status = ?').bind('active').all()).results;
    let success = 0, fail = 0;
    for (const o of owners) {
        try {
            const res = await copyMessage(env.BOT_TOKEN, o.owner_id, bdata.from_chat_id, bdata.message_id);
            if ((await res.json()).ok) success++; else fail++;
        } catch { fail++; }
    }
    return { success, fail };
}

// Telegram API Helpers
async function sendMessage(token, chatId, text, options = {}) {
    const shouldEscape = options.auto_escape ?? true;
    const finalChatId = (chatId && typeof chatId === 'object' && chatId.id) ? chatId.id : chatId;

    // Determine if we should parse as MarkdownV2
    const parseMode = options.parse_mode !== undefined ? options.parse_mode : 'MarkdownV2';

    let finalText = text;
    if (shouldEscape && parseMode === 'MarkdownV2') {
        finalText = escapeMarkdown(text);
    }

    const body = {
        chat_id: finalChatId,
        text: finalText,
        ...options
    };
    if (parseMode) body.parse_mode = parseMode;
    else delete body.parse_mode;

    let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    let data;
    try {
        data = await res.clone().json();
    } catch (e) {
        if (!res.ok) throw new Error(`Telegram API returned non-JSON error (${res.status}): ${res.statusText}`);
        return res; // OK but not JSON? Rare but let's be safe
    }

    if (!data.ok && data.description?.includes("can't parse entities")) {
        // Fallback: strip all escaping and send as plain text
        console.warn(`MarkdownV2 parsing failed, falling back to plain text for: ${text.substring(0, 50)}...`);
        const bodyFallback = { ...body, parse_mode: undefined };
        bodyFallback.text = text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
        res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyFallback)
        });
    }
    return res;
}

async function sendMedia(token, chatId, msg, options = {}) {
    let endpoint, body;
    const bodyBase = { chat_id: chatId, ...options };

    // Format caption if present and if media supports it
    if (msg.caption && !msg.sticker) {
        bodyBase.caption = escapeMarkdown(msg.caption);
        bodyBase.parse_mode = 'MarkdownV2';
    } else {
        delete bodyBase.caption;
        delete bodyBase.parse_mode;
    }

    if (msg.text) {
        endpoint = `sendMessage`;
        body = { ...bodyBase, text: escapeMarkdown(msg.text), parse_mode: 'MarkdownV2' };
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

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            let errorDesc = response.statusText;
            try {
                const errorData = await response.json();
                errorDesc = errorData.description || errorDesc;
            } catch (e) { /* non-json error */ }
            throw new Error(`Telegram API error: ${errorDesc}`);
        }
    } catch (err) {
        if (err.message.includes("can't parse entities") && body.parse_mode === 'MarkdownV2') {
            console.warn(`MarkdownV2 parsing failed for media, falling back to plain text. Error: ${err.message}`);
            // Clean text for plain fallback
            const cleanCaption = msg.caption ? msg.caption.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1') : undefined;
            const cleanText = msg.text ? msg.text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1') : undefined;

            const fallbackBody = { ...body, parse_mode: undefined };
            if (msg.text) fallbackBody.text = cleanText;
            if (msg.caption) fallbackBody.caption = cleanCaption;

            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fallbackBody)
            });

            if (!response.ok) {
                let errorDesc = response.statusText;
                try {
                    const errorData = await response.json();
                    errorDesc = errorData.description || errorDesc;
                } catch (e) { /* non-json error */ }
                throw new Error(`Telegram API error (fallback): ${errorDesc}`);
            }
        } else {
            throw err;
        }
    }
    return response;
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
                await setMyCommands(clone.token);
                await env.D1.prepare('UPDATE clones SET status = ? WHERE id = ?').bind('active', clone.id).run();
                await sendMessage(mainToken, clone.owner_id, `✅ Your bot @${escapeMarkdown(clone.bot_username)} has been approved and activated!`);
                await sendMessage(mainToken, ctx.super_admin_id, `✅ Activated @${escapeMarkdown(clone.bot_username)}`);
            } else {
                const whError = whRes.description || "Webhook setup failed";
                await sendMessage(mainToken, ctx.super_admin_id, `❌ Failed to activate @${escapeMarkdown(clone.bot_username)}: ${escapeMarkdown(whError)}\n(Clone status remains pending)`);
                throw new Error(`Activation failed for @${clone.bot_username}: ${whError}`);
            }
        } else if (action === 'reject') {
            await env.D1.prepare('DELETE FROM clones WHERE id = ?').bind(clone.id).run();
            await sendMessage(mainToken, clone.owner_id, `❌ Your bot @${escapeMarkdown(clone.bot_username)} was rejected. Please check your token and try again.`);
            await sendMessage(mainToken, ctx.super_admin_id, `❌ Rejected @${escapeMarkdown(clone.bot_username)}`);
        } else if (action === 'delete') {
            await env.D1.prepare('DELETE FROM clones WHERE id = ?').bind(clone.id).run();
            try {
                await fetch(`https://api.telegram.org/bot${clone.token}/deleteWebhook`);
            } catch (e) {
                log(ctx, "Webhook deletion cleanup failed", { error: e.message });
            }
            await sendMessage(mainToken, ctx.super_admin_id, `🗑️ Deleted @${escapeMarkdown(clone.bot_username)}`);
        }
    } catch (err) {
        await logError(env, ctx, err, "handleCloneAction");
    }
}

async function setWebhook(token, url) {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(url)}`);
    return await res.json();
}

async function setMyCommands(token) {
    const commands = [
        { command: 'start', description: 'Start the bot' },
        { command: 'clone', description: 'Clone your own bot' },
        { command: 'help', description: 'Get help' }
    ];
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands })
    });
    return await res.json();
}

function buildKeyboard(buttonConfig) {
    if (!buttonConfig || !buttonConfig.length) return undefined;
    const grid = [];
    for (let i = 0; i < buttonConfig.length; i += 2) grid.push(buttonConfig.slice(i, i + 2));
    return { inline_keyboard: grid };
}

async function copyMessage(token, to, fromChat, msgId, options = {}) {
    return await fetch(`https://api.telegram.org/bot${token}/copyMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: to, from_chat_id: fromChat, message_id: msgId, ...options })
    });
}


// --- Modular Handlers ---

async function handleAdminCommands(msg, env, ctx, { command, fullCommand }) {
    const { bot_token, admin_id, bot_id, user_id, is_super_bot, super_admin_id } = ctx;
    const chatId = msg.chat.id;
    const isAdmin = user_id.toString() === admin_id || user_id.toString() === super_admin_id;
    if (!isAdmin) return false;

    const setupKey = `bot:${bot_id}:setup:${admin_id}`;
    const broadcastKey = `bot:${bot_id}:broadcast:${admin_id}`;

    try {
        if (command === '/start' || command === '/help') {
            const helpLines = [
                `👋 *Telegram Bot Manager*`,
                ``,
                `• /start - Initialize bot`,
                `• /help - Show this menu`,
                `• /clone - Request a bot clone`,
                `• /cancel - Stop current action`
            ];

            if (isAdmin) {
                helpLines.push(
                    ``, `🛡️ *Admin Only*`,
                    `• /broadcast - Send message to all users`,
                    `• /setwelcome - Customize welcome greeting`,
                    `• /setbuttons - Customize start buttons`,
                    `• /setchannel - Link channel for auto-forwarding`,
                    `• /delchannel - Remove linked channel`,
                    `• /delwelcome - Reset welcome message`,
                    `• /delbuttons - Remove specific buttons`,
                    `• /userlist - List bot users`,
                    `• /block - (reply) Block a user`,
                    `• /unblock - Unblock a user`
                );
            }

            if (is_super_bot) {
                helpLines.push(
                    ``, `👑 *Super Admin Only*`,
                    `• /gbroadcast - Global broadcast to ALL clones`,
                    `• /cbroadcast - Message all clone owners`,
                    `• /status - Server diagnostics`,
                    `• /req - View pending clone requests`,
                    `• /clones - Manage active clones`
                );
            }

            // We use auto_escape: false here because we WANT the * and • to be processed by MarkdownV2
            await sendMessage(bot_token, chatId, helpLines.join('\n'), { parse_mode: 'MarkdownV2', auto_escape: false });
            return true;
        }

        if (command === '/cancel') {
            await env.KV.delete(setupKey);
            await env.KV.delete(broadcastKey);
            await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
            return true;
        }

        if (command === '/status' && is_super_bot) {
            const status = `ℹ️ *Bot Status*\n\n• Bot ID: \`${bot_id}\`\n• Admin: \`${admin_id}\`\n• Super Admin: \`${super_admin_id}\``;
            await setMyCommands(bot_token);
            await sendMessage(bot_token, chatId, status, { parse_mode: 'MarkdownV2', auto_escape: false });
            return true;
        }

        if (command === '/clone') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'clone_collect' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, "Please send your Bot Token from @BotFather.");
            return true;
        }

        if (command === '/userlist') {
            const users = (await env.D1.prepare('SELECT user_id, username, first_name FROM users WHERE bot_id = ? LIMIT 50').bind(bot_id).all()).results;
            if (!users.length) return await sendMessage(bot_token, chatId, 'No users yet.');
            let list = '👥 *Users:*\n\n' + users.map(u => `• [${escapeMarkdown(u.first_name || 'User')}](tg://user?id=${u.user_id})${u.username ? ` (@${escapeMarkdown(u.username)})` : ''}`).join('\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'MarkdownV2', auto_escape: false });
            return true;
        }

        if (command === '/broadcast') {
            await env.KV.put(broadcastKey, JSON.stringify({ type: 'pending' }), { expirationTtl: 300 });
            await sendMessage(bot_token, chatId, MESSAGES.BROADCAST_PROMPT, { parse_mode: 'MarkdownV2' });
            return true;
        }

        if (command === '/setwelcome') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'welcome_count' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PROMPT);
            return true;
        }

        if (command === '/setbuttons') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'buttons' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_PROMPT, { parse_mode: 'MarkdownV2' });
            return true;
        }

        if (command === '/setchannel') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'channel' }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_PROMPT);
            return true;
        }

        if (command === '/delwelcome') {
            await env.KV.delete(`bot:${bot_id}:config:welcome`);
            await sendMessage(bot_token, chatId, "Welcome message reset.");
            return true;
        }

        if (command === '/delchannel') {
            await env.KV.delete(`bot:${bot_id}:config:channel_id`);
            await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_REMOVED);
            return true;
        }

        if (command === '/delbuttons') {
            const btns = JSON.parse(await env.KV.get(`bot:${bot_id}:config:buttons`) || '[]');
            if (!btns.length) return await sendMessage(bot_token, chatId, MESSAGES.NO_BUTTONS);
            const kb = btns.map((b, i) => [{ text: `🗑️ ${b.text}`, callback_data: `delete_btn:${i}` }]);
            await sendMessage(bot_token, chatId, MESSAGES.BUTTON_DELETE_SELECT, { reply_markup: { inline_keyboard: kb } });
            return true;
        }

        if (is_super_bot && command === '/req') {
            const reqs = (await env.D1.prepare('SELECT * FROM clones WHERE status = ?').bind('pending').all()).results;
            if (!reqs.length) return await sendMessage(bot_token, chatId, "No pending requests.");
            let list = "⏳ *Pending Requests:*\n\n" + reqs.map((r, i) => `${i + 1}. @${escapeMarkdown(r.bot_username)} (Owner: \`${r.owner_id}\`)\n   /approve_${i + 1} | /reject_${i + 1}`).join('\n\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'MarkdownV2', auto_escape: false });
            return true;
        }

        if (is_super_bot && command === '/clones') {
            const clones = (await env.D1.prepare('SELECT * FROM clones WHERE status = ?').bind('active').all()).results;
            if (!clones.length) return await sendMessage(bot_token, chatId, "No active clones.");
            let list = "🚀 *Active Clones:*\n\n" + clones.map((c, i) => `${i + 1}. @${escapeMarkdown(c.bot_username)} (Owner: \`${c.owner_id}\`)\n   /delclone_${i + 1}`).join('\n\n');
            await sendMessage(bot_token, chatId, list, { parse_mode: 'MarkdownV2', auto_escape: false });
            return true;
        }

        if (is_super_bot && command === '/cbroadcast') {
            await env.KV.put(broadcastKey, JSON.stringify({ type: 'pending_owner' }), { expirationTtl: 300 });
            await sendMessage(bot_token, chatId, MESSAGES.OWNER_BROADCAST_START, { parse_mode: 'MarkdownV2' });
            return true;
        }

        if (is_super_bot && command === '/gbroadcast') {
            await env.KV.put(setupKey, JSON.stringify({ type: 'gbroadcast_collect', id: `gb:${Date.now()}` }), { expirationTtl: 600 });
            await sendMessage(bot_token, chatId, MESSAGES.GLOBAL_BROADCAST_START, { parse_mode: 'MarkdownV2' });
            return true;
        }

        // Sub-commands
        if (is_super_bot && (command.startsWith('/approve_') || command.startsWith('/reject_'))) {
            const idx = parseInt(command.split('_')[1], 10) - 1;
            const action = command.startsWith('/approve') ? 'approve' : 'reject';
            const reqs = (await env.D1.prepare('SELECT * FROM clones WHERE status = ? ORDER BY id ASC').bind('pending').all()).results;
            if (reqs[idx]) await handleCloneAction(reqs[idx], null, null, action, env, ctx);
            else await sendMessage(bot_token, chatId, MESSAGES.REQ_INVALID);
            return true;
        }

        if (is_super_bot && command.startsWith('/delclone_')) {
            const idx = parseInt(command.split('_')[1], 10) - 1;
            const clones = (await env.D1.prepare('SELECT * FROM clones WHERE status = ? ORDER BY id ASC').bind('active').all()).results;
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
    const key = `bot:${bot_id}:setup:${admin_id}`;

    try {
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
                await sendMessage(bot_token, chatId, 'Previewing...');
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
            if (btns.length) {
                await env.KV.put(`bot:${bot_id}:config:buttons`, JSON.stringify(btns));
                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_UPDATED(btns.length));
            } else await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_INVALID);
            return true;
        }

        if (state.type === 'channel') {
            const cid = msg.forward_from_chat?.id?.toString() || (text.startsWith('-100') ? text.trim() : null);
            if (cid) {
                await env.KV.put(`bot:${bot_id}:config:channel_id`, cid);
                await env.KV.delete(key);
                await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_LINKED(cid), { parse_mode: 'MarkdownV2', auto_escape: false });
            } else await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_INVALID);
            return true;
        }

        if (state.type === 'clone_collect' && /^\d+:[\w-]+$/.test(text.trim())) {
            const token = text.trim();

            // SECURITY: Pre-flight uniqueness checks (Token and Username)
            const exists = await env.D1.prepare('SELECT bot_username FROM clones WHERE token = ?').bind(token).first();
            if (exists) {
                await env.KV.delete(key);
                return await sendMessage(bot_token, chatId, `❌ This bot @${escapeMarkdown(exists.bot_username)} is already registered in our system.`);
            }

            const meRes = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
            if (!meRes.ok) throw new Error(meRes.description || "Invalid bot token");

            const userExists = await env.D1.prepare('SELECT id FROM clones WHERE bot_username = ?').bind(meRes.result.username).first();
            if (userExists) {
                await env.KV.delete(key);
                return await sendMessage(bot_token, chatId, `❌ The username @${escapeMarkdown(meRes.result.username)} is already taken as a clone. If this is your bot, please contact support.`);
            }

            const ref = Math.random().toString(36).substring(7);
            await env.D1.prepare('INSERT INTO clones (token, owner_id, bot_username, secret_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(token, user_id, meRes.result.username, ref, 'pending', Math.floor(Date.now() / 1000)).run();
            await env.KV.delete(key);
            await sendMessage(bot_token, chatId, MESSAGES.CLONE_REQUEST_SENT(meRes.result.username), { parse_mode: 'MarkdownV2' });
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `🆕 *New Clone Request*\n\nBot: @${escapeMarkdown(meRes.result.username)}\nOwner: \`${user_id}\``, { parse_mode: 'MarkdownV2', auto_escape: false, reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_clone:${ref}` }, { text: '❌ Reject', callback_data: `reject_clone:${ref}` }]] } });
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
    await env.KV.delete(`bot:${bot_id}:broadcast:${admin_id}`);

    const cb = state.type === 'pending' ? `confirm_broadcast:${bid}` : `confirm_cbroadcast:${bid}`;
    await copyMessage(bot_token, admin_id, msg.chat.id, msg.message_id, { reply_markup: { inline_keyboard: [[{ text: '✅ Confirm', callback_data: cb }, { text: '❌ Cancel', callback_data: `cancel_${bid}` }]] } });
    return true;
}

async function handleReplyFlow(msg, env, ctx) {
    const { bot_token, admin_id, bot_id } = ctx;
    const ref = msg.reply_to_message.message_id;
    const m = await env.D1.prepare('SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(ref, bot_id).first();
    const targetId = m?.user_id || msg.reply_to_message.forward_from?.id;

    if (!targetId || targetId.toString() === admin_id) return false;

    // SECURITY: Blocked enforcement. Admin cannot reply to blocked users.
    const blocked = await env.D1.prepare('SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?').bind(targetId, bot_id).first();
    if (blocked) {
        await sendMessage(bot_token, admin_id, `❌ Cannot reply: User \`${targetId}\` is blocked on this bot.`, { parse_mode: 'MarkdownV2', auto_escape: false });
        return true;
    }

    const res = await (await sendMedia(bot_token, targetId, msg, m?.user_msg_id ? { reply_to_message_id: m.user_msg_id } : {})).json();
    if (res.ok) {
        const link = `[${escapeMarkdown(msg.reply_to_message.forward_from?.first_name || 'User')}](tg://user?id=${targetId})`;
        await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(link), { parse_mode: 'MarkdownV2', auto_escape: false });
        await env.KV.put(`bot:${bot_id}:last_target:${admin_id}`, targetId.toString(), { expirationTtl: 86400 });
    } else {
        await logError(env, ctx, new Error(res.description), "ReplyFlowDeliver");
        await sendMessage(bot_token, admin_id, `❌ Failed to deliver reply: ${escapeMarkdown(res.description)}`);
    }
    return true;
}

async function handleUserMessage(msg, env, ctx) {
    const { bot_token, admin_id, bot_id, user_id } = ctx;

    // SECURITY: Blocked enforcement.
    const blocked = await env.D1.prepare('SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?').bind(user_id, bot_id).first();
    if (blocked) return; // Silent discard for blocked users (don't waste resources)

    // SECURITY: Per-user rate limiting (10 msgs per 30s)
    const rlKey = `rl:${bot_id}:${user_id}:${Math.floor(Date.now() / 30000)}`;
    const count = parseInt(await env.KV.get(rlKey) || '0');
    if (count >= 10) {
        if (count === 10) await sendMessage(bot_token, user_id, MESSAGES.RATE_LIMIT);
        await env.KV.put(rlKey, (count + 1).toString(), { expirationTtl: 60 });
        return;
    }
    await env.KV.put(rlKey, (count + 1).toString(), { expirationTtl: 60 });

    if (msg.text === '/start') {
        const welcome = JSON.parse(await env.KV.get(`bot:${bot_id}:config:welcome`) || '[]');
        const buttons = JSON.parse(await env.KV.get(`bot:${bot_id}:config:buttons`) || '[]');
        if (welcome.length) {
            for (let i = 0; i < welcome.length; i++) {
                const item = welcome[i];
                const kb = (i === welcome.length - 1) ? buildKeyboard(buttons) : undefined;
                if (item.type === 'text') await sendMessage(bot_token, user_id, item.content, { reply_markup: kb });
                else await sendMedia(bot_token, user_id, { [item.type]: item.file_id, caption: item.caption }, { reply_markup: kb });
            }
        } else await sendMessage(bot_token, user_id, MESSAGES.START_GREETING, { reply_markup: buildKeyboard(buttons) });
        return;
    }

    const fwd = await (await forwardMessage(bot_token, admin_id, msg.chat.id, msg.message_id)).json();
    if (fwd.ok) {
        await env.KV.put(`bot:${bot_id}:last_target:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
        await env.D1.batch([
            env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(fwd.result.message_id, user_id, msg.message_id, bot_id, Math.floor(Date.now() / 1000)),
            env.D1.prepare('INSERT INTO users (user_id, username, first_name, bot_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name').bind(user_id, msg.from.username || '', msg.from.first_name || 'User', bot_id)
        ]);

        const conf = await (await sendMessage(bot_token, user_id, 'ˢᵉⁿᵗ ✅')).json();
        if (conf.ok) await env.KV.put(`bot:${bot_id}:confirmation:${user_id}`, conf.result.message_id.toString(), { expirationTtl: 86400 });
    } else {
        // Only update user profile if forwarding failed (so we still know they exist)
        await env.D1.prepare('INSERT INTO users (user_id, username, first_name, bot_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name').bind(user_id, msg.from.username || '', msg.from.first_name || 'User', bot_id).run();
        await logError(env, ctx, new Error(fwd.description), "UserMsgForward");
    }
}

// Utility
async function scheduled(event, env, ctx) {
    const cutoff = Math.floor(Date.now() / 1000) - 1296000;
    await env.D1.prepare('DELETE FROM messages WHERE created_at < ?').bind(cutoff).run();
}

function escapeMarkdown(text) {
    if (!text) return '';
    // Characters that must be escaped in MarkdownV2
    // Added \ to the list and ensured we don't double escape existing escapes
    return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

async function forwardMessage(token, to, from, mid) {
    return await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_id: mid }) });
}

async function deleteMessage(token, cid, mid) {
    return await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: cid, message_id: mid }) });
}

async function answerCallbackQuery(token, qid, text) {
    return await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: qid, text }) });
}

async function getChat(token, chatId) {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }) });
    return await res.json();
}
