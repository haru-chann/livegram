export default {
    async fetch(request, env) {
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        const url = new URL(request.url);
        const path = url.pathname;
        const superAdminId = env.ADMIN_ID?.toString().trim();

        let ctx = {
            bot_id: 0,
            bot_token: env.BOT_TOKEN,
            admin_id: superAdminId,
            super_admin_id: superAdminId,
            welcome_sticker_id: 'CAACAgUAAxkBAAEO65loctd5hHKIfBaAHWtWs6VUBg4WPwACkxMAAgUsmVc01NXwsbyu3zYE',
            is_super_bot: true
        };

        // Routing for Cloned Bots
        if (path.startsWith('/handle/')) {
            const secretRef = path.split('/')[2];
            try {
                const clone = await env.D1.prepare('SELECT * FROM clones WHERE secret_ref = ? AND status = ?').bind(secretRef, 'active').first();
                if (clone) {
                    ctx = {
                        bot_id: clone.id,
                        bot_token: clone.token,
                        admin_id: clone.owner_id.toString(),
                        super_admin_id: superAdminId,
                        welcome_sticker_id: ctx.welcome_sticker_id,
                        is_super_bot: false
                    };
                } else {
                    return new Response('Forbidden', { status: 403 });
                }
            } catch (err) {
                console.error(`D1 Routing Error: ${err.message}`);
                return new Response('Error', { status: 500 });
            }
        }

        try {
            const update = await request.json();
            if (update.message) {
                // Support forwarding from Supergroups if linked
                const channelId = await env.KV.get(`bot:${ctx.bot_id}:config:channel_id`);
                if (channelId && update.message.chat.id.toString() === channelId && !update.message.from.is_bot) {
                    await handleChannelPost(update.message, env, ctx);
                } else {
                    await handleMessage(update.message, env, ctx);
                }
            } else if (update.callback_query) {
                await handleCallbackQuery(update.callback_query, env, ctx);
            } else if (update.channel_post || update.edited_channel_post) {
                await handleChannelPost(update.channel_post || update.edited_channel_post, env, ctx);
            }

            return new Response('OK', { status: 200 });
        } catch (err) {
            console.error(`Handler Error: ${err.message}`);
            await sendErrorToAdmin(env, ctx, `Handler Error: ${err.message}`);
            return new Response('OK', { status: 200 });
        }
    }
};

function formatUsername(username) {
    if (!username) return null;
    const clean = username.startsWith('@') ? username.substring(1) : username;
    return `@${escapeMarkdown(clean)}`;
}

async function handleMessage(msg, env, ctx) {
    const startTime = Date.now();
    const botToken = ctx.bot_token;
    const adminId = ctx.admin_id;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text || '';
    const isSuperAdmin = userId.toString() === ctx.super_admin_id;
    const isAdmin = userId.toString() === adminId || isSuperAdmin;
    const username = msg.from.username ? `@${msg.from.username}` : null;
    const firstName = msg.from.first_name || 'User';

    // Unified Fetch (KV + D1)
    const confirmationKey = `bot:${ctx.bot_id}:confirmation:${userId}`;
    const rateKey = `bot:${ctx.bot_id}:rate:${userId}`;
    const setupKey = isAdmin ? `bot:${ctx.bot_id}:setup:${adminId}` : null;
    const broadcastKey = isAdmin ? `bot:${ctx.bot_id}:broadcast:${adminId}` : null;

    const [rateDataStr, confirmationMsgId, blockedCheck, setupStateStr, broadcastState] = await Promise.all([
        env.KV.get(rateKey),
        !isAdmin ? env.KV.get(confirmationKey) : Promise.resolve(null),
        !isAdmin ? env.D1.prepare('SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?').bind(userId, ctx.bot_id).first() : Promise.resolve(null),
        isAdmin ? env.KV.get(setupKey) : Promise.resolve(null),
        isAdmin ? env.KV.get(broadcastKey) : Promise.resolve(null)
    ]);

    // Universal Cancel (Admin only)
    if (isAdmin && text.toLowerCase() === '/cancel') {
        const keysToDelete = [];
        if (setupStateStr) keysToDelete.push(setupKey);
        if (broadcastState) keysToDelete.push(broadcastKey);

        if (keysToDelete.length > 0) {
            await Promise.all(keysToDelete.map(k => env.KV.delete(k)));
            await sendMessage(botToken, chatId, '❌ All active processes \\(setup/broadcast\\) have been cancelled\\.');
        } else {
            await sendMessage(botToken, chatId, 'No active setup or broadcast to cancel\\.');
        }
        return;
    }

    // Delete previous confirmation message if exists (non-admin only)
    if (!isAdmin && confirmationMsgId) {
        try {
            await deleteMessage(botToken, chatId, parseInt(confirmationMsgId, 10));
        } catch (err) {
            console.error(`Failed to delete confirmation ${confirmationMsgId}: ${err.message}`);
        }
        await env.KV.delete(confirmationKey);
    }

    // Block check (D1)
    if (!isAdmin && blockedCheck && text !== '/start') {
        return;
    }

    // Rate limiting (KV, 60s TTL)
    if (!isAdmin) {
        const rateData = JSON.parse(rateDataStr || '{"count":0,"timestamp":0}');
        const now = Math.floor(Date.now() / 1000);
        if (now - rateData.timestamp < 60) {
            rateData.count++;
        } else {
            rateData.count = 1;
            rateData.timestamp = now;
        }
        if (rateData.count > 10) {
            await sendMessage(botToken, chatId, '⚠️ Please wait before sending more messages\\.');
            return;
        }
        await env.KV.put(rateKey, JSON.stringify(rateData), { expirationTtl: 60 });
    }

    // Quick-Reply Shortcut (!.) Handler (Admin only)
    if (isAdmin) {
        const shortcutPrefix = '!.';
        const msgText = msg.text || msg.caption || '';
        if (msgText.startsWith(shortcutPrefix)) {
            const lastTargetKey = `bot:${ctx.bot_id}:last_target:${adminId}`;
            const lastTargetId = await env.KV.get(lastTargetKey);

            if (!lastTargetId) {
                await sendMessage(botToken, chatId, '❌ No last target found\\. Reply to a user first to set one\\.');
                return;
            }

            const cleanContent = msgText.substring(shortcutPrefix.length).trim();
            if (!cleanContent && !msg.photo && !msg.sticker && !msg.video && !msg.animation && !msg.document) {
                await sendMessage(botToken, chatId, '❌ Please provide a message after \\!\\.');
                return;
            }

            try {
                const targetId = parseInt(lastTargetId, 10);
                // Prepare message object for sending
                const quickMsg = { ...msg };
                if (msg.text) quickMsg.text = cleanContent;
                if (msg.caption) quickMsg.caption = cleanContent;

                const response = await sendMedia(botToken, targetId, quickMsg);
                const result = await response.json();

                if (result.ok) {
                    await sendMessage(botToken, chatId, `✅ Message sent to user \\\`${targetId}\\\``, { parse_mode: 'MarkdownV2' });
                } else {
                    await sendErrorToAdmin(env, ctx, `Quick-reply failed: ${result.description}`);
                }
            } catch (err) {
                await sendErrorToAdmin(env, ctx, `Quick-reply error: ${err.message}`);
            }
            return;
        }
    }

    // State-based Setup Handler (Admin only)
    if (isAdmin && setupStateStr) {
        const setupState = JSON.parse(setupStateStr);

        if (setupState) {

            if (setupState.type === 'welcome_count') {
                const count = parseInt(text, 10);
                if (count === 1 || count === 2) {
                    setupState.step = 1;
                    setupState.targetCount = count;
                    setupState.messages = [];
                    setupState.type = 'welcome_collect';
                    await env.KV.put(setupKey, JSON.stringify(setupState), { expirationTtl: 600 });
                    await sendMessage(botToken, chatId, `Step 1: Send the first message \\(Text, Photo, Sticker, GIF, etc\\.\\)`);
                } else {
                    await sendMessage(botToken, chatId, 'Please send 1 or 2\\.');
                }
                return;
            }

            if (setupState.type === 'welcome_collect') {
                let msgData;
                if (msg.text) {
                    msgData = { type: 'text', content: msg.text };
                } else if (msg.sticker) {
                    msgData = { type: 'sticker', file_id: msg.sticker.file_id };
                } else if (msg.photo) {
                    msgData = { type: 'photo', file_id: msg.photo[msg.photo.length - 1].file_id, caption: msg.caption };
                } else if (msg.animation) {
                    msgData = { type: 'animation', file_id: msg.animation.file_id, caption: msg.caption };
                } else if (msg.video) {
                    msgData = { type: 'video', file_id: msg.video.file_id, caption: msg.caption };
                } else if (msg.document) {
                    msgData = { type: 'document', file_id: msg.document.file_id, caption: msg.caption };
                }

                if (msgData) {
                    setupState.messages.push(msgData);
                    if (setupState.messages.length < setupState.targetCount) {
                        setupState.step++;
                        await env.KV.put(setupKey, JSON.stringify(setupState), { expirationTtl: 600 });
                        await sendMessage(botToken, chatId, `Step 2: Send the second message \\(Text, Photo, Sticker, GIF, etc\\.\\)`);
                    } else {
                        await env.KV.put(setupKey, JSON.stringify(setupState), { expirationTtl: 600 });

                        // Full Preview Flow
                        await sendMessage(botToken, chatId, '✨ *Previewing your new welcome sequence:*', { parse_mode: 'MarkdownV2' });
                        const buttonConfig = JSON.parse(await env.KV.get(`bot:${ctx.bot_id}:config:buttons`) || 'null');

                        for (let i = 0; i < setupState.messages.length; i++) {
                            const item = setupState.messages[i];
                            const isLast = i === setupState.messages.length - 1;
                            const reply_markup = isLast ? buildKeyboard(buttonConfig) : undefined;

                            if (item.type === 'text') {
                                await sendMessage(botToken, chatId, item.content, { reply_markup });
                            } else {
                                const msgForMedia = { [item.type]: item.file_id, caption: item.caption };
                                await sendMedia(botToken, chatId, msgForMedia, { reply_markup });
                            }
                        }

                        await sendMessage(botToken, chatId, 'Confirm saving this sequence?', {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✅ Save', callback_data: 'save_welcome' },
                                        { text: '❌ Cancel', callback_data: 'cancel_welcome' }
                                    ]
                                ]
                            }
                        });
                    }
                } else {
                    await sendMessage(botToken, chatId, 'Unsupported media type for welcome message\\. Please send text, sticker, photo, GIF, video, or document\\.');
                }
                return;
            }

            if (setupState.type === 'buttons') {
                const buttons = [];
                const lines = text.split('\n');

                const smartFixUrl = (url) => {
                    url = url.trim();
                    if (!url) return '';
                    if (url.startsWith('@')) return `https://t.me/${url.substring(1)}`;
                    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('tg://')) return url;
                    // Check if it's a simple username/word
                    if (/^[a-zA-Z0-9_]{5,}$/.test(url)) return `https://t.me/${url}`;
                    // Default to https prefix if missing protocol
                    if (url.includes('.') && !url.includes(' ')) return `https://${url}`;
                    return url; // Return as is, Telegram might still reject but we tried
                };

                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts.length >= 2) {
                        const btnText = parts[0].trim();
                        const btnUrl = smartFixUrl(parts.slice(1).join('|'));
                        if (btnText && btnUrl) {
                            buttons.push({ text: btnText, url: btnUrl });
                        }
                    } else if (line.trim()) {
                        const item = line.trim();
                        const fixedUrl = smartFixUrl(item);
                        buttons.push({ text: item, url: fixedUrl });
                    }
                }

                if (buttons.length > 0) {
                    await env.KV.put(`bot:${ctx.bot_id}:config:buttons`, JSON.stringify(buttons));
                    await env.KV.delete(setupKey);
                    await sendMessage(botToken, chatId, `✅ ${buttons.length} buttons updated successfully\\!`);
                } else {
                    await sendMessage(botToken, chatId, '❌ Invalid format\\. Please send buttons in \\\`Label | Link\\\` format, one per line\\.');
                }
                return;
            }

            if (setupState.type === 'gbroadcast_collect') {
                const broadcastData = {
                    from_chat_id: chatId,
                    message_id: msg.message_id
                };
                await env.KV.put(setupState.id, JSON.stringify(broadcastData), { expirationTtl: 3600 });
                await env.KV.delete(setupKey);

                await sendMessage(botToken, chatId, '📋 *Global Broadcast Preview:*', { parse_mode: 'MarkdownV2' });
                await copyMessage(botToken, chatId, chatId, msg.message_id, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🚀 Confirm Global Send', callback_data: `confirm_gbroadcast:${setupState.id}` },
                                { text: '❌ Cancel', callback_data: `cancel_gbroadcast:${setupState.id}` }
                            ]
                        ]
                    }
                });
                return;
            }

            if (setupState.type === 'channel') {
                let channelId = null;
                if (msg.forward_from_chat) {
                    channelId = msg.forward_from_chat.id.toString();
                } else if (text.startsWith('-100')) {
                    channelId = text.trim();
                }

                if (channelId) {
                    await env.KV.put(`bot:${ctx.bot_id}:config:channel_id`, channelId);
                    await env.KV.delete(setupKey);
                    await sendMessage(botToken, chatId, `✅ Channel linked successfully\\! ID: \\\`${channelId}\\\`\\nMake sure the bot is an admin in that channel\\.`, { parse_mode: 'MarkdownV2' });
                } else {
                    await sendMessage(botToken, chatId, '❌ Invalid channel\\. Please forward a message from the channel or send the correct ID\\.');
                }
                return;
            }

            if (setupState.type === 'clone_collect') {
                const token = text.trim();
                if (!/^\d+:[\w-]+$/.test(token)) {
                    await sendMessage(botToken, chatId, '❌ Invalid bot token format\\. It should look like \\\`12345:6789ABCDEF\\\`\\.');
                    return;
                }

                try {
                    const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
                    const meData = await meResponse.json();
                    if (!meData.ok) throw new Error(meData.description || 'Invalid token');
                    const botInfo = meData.result;

                    const secretRef = Math.random().toString(36).substring(2, 15);
                    await env.D1.prepare('INSERT INTO clones (token, owner_id, bot_username, secret_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                        .bind(token, userId, botInfo.username, secretRef, 'pending', Math.floor(Date.now() / 1000))
                        .run();

                    await env.KV.delete(setupKey || `bot:${ctx.bot_id}:setup:${userId}`);
                    await sendMessage(botToken, chatId, `✅ Request sent\\! Your bot @${escapeMarkdown(botInfo.username)} is now pending approval from the Super Admin\\.`, { parse_mode: 'MarkdownV2' });

                    // Notify Super Admin on Main Bot
                    const superAdminMsg = `🆕 *New Clone Request\\!*\n\n👤 *User:* [${escapeMarkdown(firstName)}](tg://user?id=${userId})\n🤖 *Bot:* @${escapeMarkdown(botInfo.username)}\n🔑 *Token:* \\\`${escapeMarkdown(token)}\\\`\n\nApprove this bot?`;
                    await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, superAdminMsg, {
                        parse_mode: 'MarkdownV2',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Approve', callback_data: `approve_clone:${secretRef}` },
                                    { text: '❌ Reject', callback_data: `reject_clone:${secretRef}` }
                                ]
                            ]
                        }
                    });
                } catch (err) {
                    await sendMessage(botToken, chatId, `❌ Error verifying token: ${escapeMarkdown(err.message)}\\. Please make sure the token is correct\\.`, { parse_mode: 'MarkdownV2' });
                }
                return;
            }
        }
    }

    // Commands handle
    if (text.startsWith('/')) {
        const fullCommand = text.trim();
        const command = fullCommand.split(/\s+/)[0].toLowerCase().split('@')[0];

        if (command === '/clone') {
            await env.KV.put(setupKey || `bot:${ctx.bot_id}:setup:${userId}`, JSON.stringify({ type: 'clone_collect' }), { expirationTtl: 600 });
            const message = "To connect a bot, you should follow these two steps:\\n\\n1\\. Open @BotFather and create a new bot\\.\\n2\\. You\\'ll get a token \\(e\\.g\\. 12345:6789ABCDEF\\) — copy\\-paste it to this chat\\.\\n\\nWarning\\! Don\\'t connect bots already used by other services\\.";
            await sendMessage(botToken, chatId, message);
            return;
        }

        if (isSuperAdmin && ctx.bot_id === 0 && command === '/req') {
            const { results: pending } = await env.D1.prepare('SELECT * FROM clones WHERE status = ? ORDER BY id ASC').bind('pending').all();
            if (!pending.length) {
                await sendMessage(botToken, chatId, 'No pending clone requests\\.');
                return;
            }
            let text = '⏳ *Pending Clone Requests:*\n\n';
            for (let i = 0; i < pending.length; i++) {
                const req = pending[i];
                const index = i + 1;
                const ownerInfo = req.bot_username ? `@${escapeMarkdown(req.bot_username)}` : `[${escapeMarkdown(firstName)}](tg://user?id=${req.owner_id})`;
                text += `${index}\\. ${ownerInfo} \\(Owner: \\\`${req.owner_id}\\\`\\)\\n   /approve\\_${index}  |  /reject\\_${index}\\n\\n`;
            }
            await sendMessage(botToken, chatId, text, { parse_mode: 'MarkdownV2' });
            return;
        }

        if (isSuperAdmin && ctx.bot_id === 0 && command === '/clones') {
            try {
                const { results } = await env.D1.prepare('SELECT id, token, owner_id, bot_username FROM clones WHERE status = ? ORDER BY id ASC').bind('active').all();
                if (!results.length) {
                    await sendMessage(botToken, chatId, 'No active bots found\\.');
                    return;
                }
                const clonesList = results.map((c, i) => `• @${escapeMarkdown(c.bot_username)} \\(Owner: \\\`${c.owner_id}\\\`\\)\\n  ID: ${i + 1} | /delclone\\_${i + 1}`).join('\n\n');
                await sendMessage(botToken, chatId, `🚀 *Active Clones:*\n\n${clonesList}`, { parse_mode: 'MarkdownV2' });
            } catch (err) {
                await sendErrorToAdmin(env, ctx, `Error fetching active clones: ${err.message}`);
            }
            return;
        }

        if (isSuperAdmin && ctx.bot_id === 0 && command.startsWith('/approve_')) {
            const index = parseInt(command.replace('/approve_', ''), 10);
            const { results: pending } = await env.D1.prepare('SELECT secret_ref FROM clones WHERE status = ? ORDER BY id ASC').bind('pending').all();
            if (pending[index - 1]) {
                await handleCloneAction(null, pending[index - 1].secret_ref, 'approve', env, ctx);
            } else {
                await sendMessage(botToken, chatId, '❌ Invalid request number.');
            }
            return;
        }

        if (isSuperAdmin && ctx.bot_id === 0 && command.startsWith('/reject_')) {
            const index = parseInt(command.replace('/reject_', ''), 10);
            const { results: pending } = await env.D1.prepare('SELECT secret_ref FROM clones WHERE status = ? ORDER BY id ASC').bind('pending').all();
            if (pending[index - 1]) {
                await handleCloneAction(null, pending[index - 1].secret_ref, 'reject', env, ctx);
            } else {
                await sendMessage(botToken, chatId, '❌ Invalid request number.');
            }
            return;
        }

        if (isSuperAdmin && ctx.bot_id === 0 && command.startsWith('/delclone_')) {
            const index = parseInt(command.replace('/delclone_', ''), 10);
            const { results: activeClones } = await env.D1.prepare('SELECT id FROM clones WHERE status = ? ORDER BY id ASC').bind('active').all();
            if (activeClones[index - 1]) {
                await handleCloneAction(activeClones[index - 1].id, null, 'delete', env, ctx);
            } else {
                await sendMessage(botToken, chatId, '❌ Invalid clone number\\.');
            }
            return;
        }

        if (command === '/start') {
            const welcomeConfig = JSON.parse(await env.KV.get(`bot:${ctx.bot_id}:config:welcome`) || 'null');
            const buttonConfig = JSON.parse(await env.KV.get(`bot:${ctx.bot_id}:config:buttons`) || 'null');

            if (!welcomeConfig) {
                const greeting = "Hey there\\! You can contact us using this bot, just send your message and we will get back to you as soon as possible\\.";
                await sendMessage(botToken, chatId, greeting, {
                    reply_markup: buildKeyboard(buttonConfig)
                });
            } else {
                // Multi-message welcome
                for (let i = 0; i < welcomeConfig.length; i++) {
                    const item = welcomeConfig[i];
                    const isLast = i === welcomeConfig.length - 1;
                    const reply_markup = isLast ? buildKeyboard(buttonConfig) : undefined;

                    if (item.type === 'text') {
                        await sendMessage(botToken, chatId, item.content, { reply_markup });
                    } else {
                        const msgForMedia = { [item.type]: item.file_id, caption: item.caption };
                        await sendMedia(botToken, chatId, msgForMedia, { reply_markup });
                    }
                }
            }
            console.log(`Start command took ${Date.now() - startTime}ms`);
        } else if (command === '/help' || command === '/cmd' || command === '/cmds') {
            // Check if user owns any clone (for better /help response)
            const cloneOwnership = await env.D1.prepare('SELECT COUNT(*) as count FROM clones WHERE owner_id = ? AND status = ?').bind(userId, 'active').first();
            const hasClone = cloneOwnership.count > 0;

            if (!isAdmin && !hasClone) {
                await sendMessage(botToken, chatId, "You don\\'t have a clone\\.\\n\\nFor help contact owner @thv\\_haru\\.");
                return;
            }

            const helpText = [
                `📖 *Available Commands*`,
                ``,
                `👤 *Public*`,
                `• /start \\- Start the bot`,
                `• /clone \\- Request your own bot clone`,
                `• /help \\- Get help & contact info`,
                ``,
                isAdmin ? `\\n🛡️ *Admin Only*` : '',
                isAdmin ? `• /broadcast \\- Send message to all users` : '',
                isAdmin ? `• /setwelcome \\- Customize welcome greeting` : '',
                isAdmin ? `• /setbuttons \\- Customize start buttons` : '',
                isAdmin ? `• /setchannel \\- Link channel for auto-forwarding` : '',
                isAdmin ? `• /delchannel \\- Remove linked channel` : '',
                isAdmin ? `• /delwelcome \\- Reset welcome message` : '',
                isAdmin ? `• /delbuttons \\- Remove specific buttons` : '',
                isAdmin ? `• /userlist \\- List bot users` : '',
                isAdmin ? `• /block \\- \\(reply\\) Block a user` : '',
                isAdmin ? `• /unblock \\- Unblock a user` : '',
                isAdmin ? `• /cancel \\- Cancel current setup` : '',
                ``,
                isSuperAdmin && ctx.bot_id === 0 ? `\\n👑 *Super Admin Only*` : '',
                isSuperAdmin && ctx.bot_id === 0 ? `• /gbroadcast \\- Global broadcast to ALL clones` : '',
                isSuperAdmin && ctx.bot_id === 0 ? `• /cbroadcast \\- Message all clone owners` : '',
                isSuperAdmin && ctx.bot_id === 0 ? `• /status \\- Server diagnostics` : '',
                isSuperAdmin && ctx.bot_id === 0 ? `• /req \\- View pending clone requests` : '',
                isSuperAdmin && ctx.bot_id === 0 ? `• /clones \\- Manage active clones` : '',
                ``,
                `For further help contact owner @thv\\_haru`
            ].filter(Boolean).join('\n');
            await sendMessage(botToken, chatId, helpText, { parse_mode: 'MarkdownV2' });
        } else if (isSuperAdmin && ctx.bot_id === 0 && command === '/status') {
            const channelId = await env.KV.get(`bot:${ctx.bot_id}:config:channel_id`);
            let channelDisplay = '\\\`NONE\\\`';
            if (channelId) {
                try {
                    const chat = await getChat(botToken, channelId);
                    const title = escapeMarkdown(chat.title || 'Channel');
                    const link = chat.username ? `https://t.me/${chat.username}` : `https://t.me/c/${channelId.replace('-100', '')}`;
                    channelDisplay = `[${title}](${link}) (\\\`${channelId}\\\`)`;
                } catch (e) {
                    channelDisplay = `\\\`${channelId}\\\` \\(Unable to fetch info\\)`;
                }
            }
            const statusText = [
                `ℹ️ *Bot Status*`,
                ``,
                `• Bot ID: \`${ctx.bot_id}\``,
                `• Your ID: \`${userId}\``,
                `• Channel: ${channelDisplay}`,
                `• Admin: \`${adminId}\``,
                `• Super Admin: \`${ctx.super_admin_id}\``,
                ``,
                `_Command menu synchronized for this bot_`
            ].join('\n');
            await setMyCommands(botToken);
            await sendMessage(botToken, chatId, statusText, { parse_mode: 'MarkdownV2', disable_web_page_preview: true });
            return;
        } else if (isAdmin && command === '/userlist') {
            await sendUserList(botToken, chatId, env.D1_DB, ctx.bot_id);
        } else if (isAdmin && command === '/debug_messages') {
            await debugMessages(botToken, chatId, env.D1_DB, ctx.bot_id);
        } else if (isAdmin && command === '/block' && msg.reply_to_message?.message_id) {
            let targetId;

            // Try to get user_id from messages table
            const { results } = await env.D1.prepare('SELECT user_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(msg.reply_to_message.message_id, ctx.bot_id).all();
            if (results.length) {
                targetId = results[0].user_id;
            } else if (msg.reply_to_message.forward_from?.id) {
                targetId = msg.reply_to_message.forward_from.id;
            } else {
                await sendErrorToAdmin(botToken, adminId, `Cannot block: no user_id found for admin_msg_id=${msg.reply_to_message.message_id} and missing forward_from data`);
                return;
            }

            // Validate user exists and get name
            const { results: userResults } = await env.D1.prepare('SELECT user_id, username, first_name FROM users WHERE user_id = ? AND bot_id = ?').bind(targetId, ctx.bot_id).all();
            if (!userResults.length) {
                await sendErrorToAdmin(botToken, adminId, `Cannot block: user ${targetId} not found in users table for this bot`);
                return;
            }
            targetName = formatUsername(userResults[0].username) || userResults[0].first_name;

            if (targetId.toString() === adminId) {
                await sendErrorToAdmin(botToken, adminId, `Cannot block admin (user_id=${adminId})`);
                return;
            }

            try {
                await env.D1.prepare('INSERT OR IGNORE INTO blocked_users (user_id, bot_id) VALUES (?, ?)').bind(targetId, ctx.bot_id).run();
                await Promise.all([
                    sendMessage(botToken, targetId, 'You have been blocked from using this bot\\.'),
                    sendMessage(botToken, adminId, `✅ User ${targetName} blocked\\.`),
                    env.KV.put(`bot:${ctx.bot_id}:last_target:${adminId}`, targetId.toString(), { expirationTtl: 86400 })
                ]);
                console.log(`D1 INSERT blocked_users, user_id=${targetId} (${Date.now() - startTime}ms)`);
            } catch (err) {
                console.error(`Block error for user ${targetId}: ${err.message}`);
                await sendErrorToAdmin(botToken, adminId, `Failed to block user ${targetId} (${targetName}): ${err.message}`);
            }
        } else if (isAdmin && command === '/unblock') {
            let targetId;
            let targetName;

            if (msg.reply_to_message?.message_id) {
                const { results } = await env.D1.prepare('SELECT user_id FROM messages WHERE admin_msg_id = ?').bind(msg.reply_to_message.message_id).all();
                if (results.length) {
                    targetId = results[0].user_id;
                } else if (msg.reply_to_message.forward_from?.id) {
                    targetId = msg.reply_to_message.forward_from.id;
                } else {
                    await sendErrorToAdmin(botToken, adminId, `Cannot unblock: no user_id found for admin_msg_id=${msg.reply_to_message.message_id} and missing forward_from data`);
                    return;
                }
            } else {
                const unblockArg = fullCommand.replace('/unblock', '').trim();
                if (!unblockArg) {
                    await sendMessage(botToken, chatId, 'Please provide a username \\(e\\.g\\., @username\\) or user ID, or reply to a forwarded message\\. Usage: /unblock <username/user\\_id>');
                    return;
                }
                if (unblockArg.startsWith('@')) {
                    const usernameToFind = unblockArg.substring(1); // Remove '@'
                    const { results } = await env.D1.prepare('SELECT user_id, username, first_name FROM users WHERE username = ?').bind(usernameToFind).all();
                    if (!results.length) {
                        await sendMessage(botToken, chatId, `User @${escapeMarkdown(usernameToFind)} not found\\.`);
                        return;
                    }
                    targetId = results[0].user_id;
                    targetName = formatUsername(results[0].username) || results[0].first_name;
                } else {
                    targetId = parseInt(unblockArg, 10);
                    if (isNaN(targetId)) {
                        await sendMessage(botToken, chatId, 'Invalid user ID\\. Please provide a valid number or username\\.');
                        return;
                    }
                }
            }

            // Validate user exists if not already set
            if (!targetName) {
                const { results: userResults } = await env.D1.prepare('SELECT user_id, username, first_name FROM users WHERE user_id = ?').bind(targetId).all();
                if (!userResults.length) {
                    await sendMessage(botToken, chatId, `User with ID ${targetId} not found\\.`);
                    return;
                }
                targetName = formatUsername(userResults[0].username) || userResults[0].first_name;
            }

            if (targetId.toString() === adminId) {
                await sendErrorToAdmin(botToken, adminId, `Cannot unblock admin (user_id=${adminId})`);
                return;
            }

            try {
                const { success } = await env.D1.prepare('DELETE FROM blocked_users WHERE user_id = ? AND bot_id = ?').bind(targetId, ctx.bot_id).run();
                if (success) {
                    await sendMessage(botToken, chatId, `✅ User ${targetName} unblocked\\.`);
                    // Track last target for shortcut (!.)
                    await env.KV.put(`bot:${ctx.bot_id}:last_target:${adminId}`, targetId.toString(), { expirationTtl: 86400 });
                    console.log(`D1 DELETE blocked_users, user_id=${targetId} bot_id=${ctx.bot_id} (${Date.now() - startTime}ms)`);
                } else {
                    await sendMessage(botToken, chatId, `User ${targetName} was not blocked on this bot\\.`);
                }
            } catch (err) {
                console.error(`Unblock error for user ${targetId}: ${err.message}`);
                await sendErrorToAdmin(botToken, adminId, `Failed to unblock user ${targetId} (${targetName}): ${err.message}`);
            }
        } else if (isAdmin && command === '/delchannel') {
            await env.KV.delete(`bot:${ctx.bot_id}:config:channel_id`);
            await sendMessage(botToken, chatId, '✅ Linked channel removed\\.');
            return;
        } else if (isSuperAdmin && ctx.bot_id === 0 && command === '/cbroadcast') {
            await env.KV.put(`bot:${ctx.bot_id}:broadcast:${adminId}`, JSON.stringify({ type: 'pending' }), { expirationTtl: 300 });
            await sendMessage(botToken, chatId, '📢 *Owner Broadcast Mode*\n\nSend me the message you want to broadcast to EVERY clone owner\\.', { parse_mode: 'MarkdownV2' });
            return;
        } else if (isSuperAdmin && ctx.bot_id === 0 && command === '/gbroadcast') {
            const setupId = `gbroadcast:${Date.now()}`;
            await env.KV.put(`bot:${ctx.bot_id}:setup:${userId}`, JSON.stringify({ type: 'gbroadcast_collect', id: setupId }), { expirationTtl: 600 });
            await sendMessage(botToken, chatId, '📢 *Global Broadcast Mode*\n\nSend me the message you want to broadcast to EVERY user in EVERY cloned bot\\.', { parse_mode: 'MarkdownV2' });
            return;
        } else if (isAdmin && command === '/broadcast') {
            await env.KV.put(`bot:${ctx.bot_id}:broadcast:${adminId}`, JSON.stringify({ type: 'pending' }), { expirationTtl: 300 });
            await sendMessage(botToken, adminId, 'Please send the message or media you want to broadcast\\. You can also *forward* a message from a channel here\\.', { parse_mode: 'MarkdownV2' });
            console.log(`KV PUT bot:${ctx.bot_id}:broadcast:${adminId} (${Date.now() - startTime}ms)`);
        } else if (isAdmin && command === '/setwelcome') {
            await env.KV.put(`bot:${ctx.bot_id}:setup:${adminId}`, JSON.stringify({ type: 'welcome_count' }), { expirationTtl: 600 });
            await sendMessage(botToken, adminId, 'How many welcome messages do you want? \\(1 or 2\\)');
        } else if (isAdmin && command === '/setbuttons') {
            await env.KV.put(`bot:${ctx.bot_id}:setup:${adminId}`, JSON.stringify({ type: 'buttons' }), { expirationTtl: 600 });
            const help = 'Please send your buttons. You can use any format, e.g.:\n`Join Channel | @mychannel`\n`Support | t.me/user`';
            await sendMessage(botToken, adminId, help, { parse_mode: 'MarkdownV2' });
        } else if (isAdmin && command === '/setchannel') {
            await env.KV.put(`bot:${ctx.bot_id}:setup:${adminId}`, JSON.stringify({ type: 'channel' }), { expirationTtl: 600 });
            await sendMessage(botToken, adminId, 'Please forward a message FROM the channel you want to link, or send the Channel ID \\(starting with \\-100\\)\\.');
        } else if (isAdmin && command === '/delwelcome') {
            await Promise.all([
                env.KV.delete(`bot:${ctx.bot_id}:config:welcome`),
                env.KV.delete(`bot:${ctx.bot_id}:config:buttons`)
            ]);
            await sendMessage(botToken, adminId, '✅ Welcome message and buttons have been reset to default\\.');
        } else if (isAdmin && command === '/delbuttons') {
            const buttons = JSON.parse(await env.KV.get(`bot:${ctx.bot_id}:config:buttons`) || '[]');
            if (!buttons.length) {
                await sendMessage(botToken, adminId, 'No buttons to delete\\.');
                return;
            }
            const keyboard = [];
            for (let i = 0; i < buttons.length; i++) {
                keyboard.push([{ text: `🗑️ ${buttons[i].text}`, callback_data: `delete_btn:${i}` }]);
            }
            await sendMessage(botToken, adminId, 'Select a button to delete:', {
                reply_markup: { inline_keyboard: keyboard }
            });
        } else if (isAdmin) {
            // Handle other slash commands if needed or just ignore
        }
        return;
    }

    // Admin reply handler
    if (isAdmin && msg.reply_to_message && msg.reply_to_message.message_id) {
        const refId = msg.reply_to_message.message_id;
        let userId, userMsgId, targetName;

        // Try to get user details from database using admin_msg_id
        let results = [];
        try {
            const query = await env.D1.prepare('SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(refId, ctx.bot_id).all();
            results = query.results;
            console.log(`D1 SELECT messages for admin_msg_id=${refId} bot_id=${ctx.bot_id} (${Date.now() - startTime}ms)`);
        } catch (err) {
            console.error(`Database query error for admin_msg_id=${refId}: ${err.message}`);
            await sendErrorToAdmin(botToken, adminId, `Database query error for admin_msg_id=${refId}: ${err.message}`);
            return;
        }

        if (results.length) {
            userId = results[0].user_id;
            userMsgId = parseInt(results[0].user_msg_id, 10);
        } else if (msg.reply_to_message.forward_from?.id) {
            // Fallback: use forward_from.id if available
            userId = msg.reply_to_message.forward_from.id;
            const fallbackQuery = await env.D1.prepare('SELECT user_msg_id FROM messages WHERE user_id = ? AND bot_id = ? ORDER BY created_at DESC LIMIT 1').bind(userId, ctx.bot_id).all();
            if (fallbackQuery.results.length) {
                userMsgId = parseInt(fallbackQuery.results[0].user_msg_id, 10);
                console.log(`Fallback D1 SELECT messages for user_id=${userId} bot_id=${ctx.bot_id} (${Date.now() - startTime}ms)`);
            } else {
                userMsgId = null;
                console.warn(`No database entry for admin_msg_id=${refId} or user_id=${userId}`);
            }
        } else {
            await sendErrorToAdmin(env, ctx, `Cannot reply: no database entry for admin_msg_id=${refId} and missing forward_from data, type=${msg.text ? 'text' : 'media'}`);
            return;
        }

        // Validate user exists in users table
        const { results: userResults } = await env.D1.prepare('SELECT user_id, username, first_name FROM users WHERE user_id = ? AND bot_id = ?').bind(userId, ctx.bot_id).all();
        if (!userResults.length) {
            await sendErrorToAdmin(env, ctx, `User ${userId} not found in users table for bot ${ctx.bot_id}`);
            return;
        }
        targetName = formatUsername(userResults[0].username) || userResults[0].first_name;

        // Check if user is blocked
        const { results: blockedResults } = await env.D1.prepare('SELECT user_id FROM blocked_users WHERE user_id = ? AND bot_id = ?').bind(userId, ctx.bot_id).all();
        if (blockedResults.length) {
            await sendErrorToAdmin(env, ctx, `Cannot reply to blocked user ${userId} (${targetName}), admin_msg_id=${refId}`);
            return;
        }

        if (!userId || (userMsgId && isNaN(userMsgId))) {
            await sendErrorToAdmin(botToken, adminId, `Invalid data for reply: user_id=${userId}, user_msg_id=${userMsgId}, admin_msg_id=${refId}, message_type=${msg.text ? 'text' : msg.sticker ? 'sticker' : msg.photo ? 'photo' : msg.animation ? 'animation' : msg.video ? 'video' : msg.document ? 'document' : 'unknown'}`);
            return;
        }

        if (userId.toString() === adminId) {
            await sendErrorToAdmin(botToken, adminId, `Cannot reply to self (admin_id=${adminId}), admin_msg_id=${refId}`);
            return;
        }

        let attempts = 0;
        const maxAttempts = 5;
        while (attempts < maxAttempts) {
            try {
                // Verify user is reachable
                const testResponse = await sendMessage(botToken, userId, 'Test connectivity', { disable_notification: true, parse_mode: undefined });
                const testResult = await testResponse.json();
                if (!testResult.ok) {
                    throw new Error(`User ${userId} unreachable: ${testResult.description}`);
                }
                await deleteMessage(botToken, userId, testResult.result.message_id);

                const replyOpts = userMsgId ? { reply_to_message_id: userMsgId } : {};
                if (msg.caption) {
                    replyOpts.caption = escapeMarkdown(msg.caption);
                    replyOpts.parse_mode = 'MarkdownV2';
                }

                let response;
                try {
                    response = await sendMedia(botToken, userId, msg, replyOpts);
                } catch (err) {
                    if (err.message.includes("can't parse entities")) {
                        console.log(`MarkdownV2 parsing failed for user ${userId}, message_type=${msg.text ? 'text' : msg.sticker ? 'sticker' : msg.photo ? 'photo' : msg.animation ? 'animation' : msg.video ? 'video' : msg.document ? 'document' : 'unknown'}, text/caption="${msg.text || msg.caption || 'none'}"`);
                        replyOpts.parse_mode = undefined;
                        if (msg.caption) replyOpts.caption = msg.caption;
                        if (msg.text) msg.text = msg.text;
                        response = await sendMedia(botToken, userId, msg, replyOpts);
                    } else {
                        throw err;
                    }
                }

                const result = await response.json();
                if (!result.ok) {
                    throw new Error(`Telegram API error: ${result.description}`);
                }

                const displayName = [firstName, username].filter(Boolean).join(' ');
                const profileLink = `[${escapeMarkdown(userResults[0].first_name || 'User')}](tg://user?id=${userId})`;
                await sendMessage(botToken, adminId, `✅ Replied to ${profileLink}`, { parse_mode: 'MarkdownV2' });

                // Track last target for shortcut (!.)
                await env.KV.put(`bot:${ctx.bot_id}:last_target:${adminId}`, userId.toString(), { expirationTtl: 86400 });

                console.log(`Reply sent to user ${userId}, message_id=${result.result.message_id}, type=${msg.text ? 'text' : msg.sticker ? 'sticker' : msg.photo ? 'photo' : msg.animation ? 'animation' : msg.video ? 'video' : msg.document ? 'document' : 'unknown'}, admin_msg_id=${refId} (${Date.now() - startTime}ms)`);
                break;
            } catch (err) {
                attempts++;
                console.error(`Reply attempt ${attempts} failed for user ${userId} (${targetName}): ${err.message}, message_type=${msg.text ? 'text' : msg.sticker ? 'sticker' : msg.photo ? 'photo' : msg.animation ? 'animation' : msg.video ? 'video' : msg.document ? 'document' : 'unknown'}, admin_msg_id=${refId}`);
                if (attempts === maxAttempts) {
                    await sendErrorToAdmin(env, ctx, `Failed to send reply to user ${userId} after ${maxAttempts} attempts: ${err.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return;
    }

    // Broadcast message handler
    if (isAdmin && broadcastState === 'pending') {
        await env.KV.delete(broadcastKey);
        const broadcastId = `bot:${ctx.bot_id}:broadcast_data:${Date.now()}`;

        await env.KV.put(broadcastId, JSON.stringify({
            from_chat_id: chatId,
            message_id: msg.message_id
        }), { expirationTtl: 3600 });

        await copyMessage(botToken, adminId, chatId, msg.message_id, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm', callback_data: `confirm_broadcast:${broadcastId}` },
                        { text: '❌ Cancel', callback_data: `cancel_broadcast:${broadcastId}` }
                    ]
                ]
            }
        });
        console.log(`KV PUT ${broadcastId} (${Date.now() - startTime}ms)`);
        return;
    }

    // Normal user message → forward to admin
    if (!isAdmin) {
        const forwardPromise = (async () => {
            try {
                const fwd = await forwardMessage(botToken, adminId, chatId, msg.message_id);
                const res = await fwd.json();
                if (res.ok) {
                    const adminMsgId = res.result.message_id;
                    const { results } = await env.D1.prepare('SELECT user_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?').bind(adminMsgId, ctx.bot_id).all();
                    if (!results.length) {
                        await env.D1.prepare('INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(adminMsgId, userId, msg.message_id, ctx.bot_id, Math.floor(Date.now() / 1000)).run();
                        console.log(`D1 INSERT messages: admin_msg_id=${adminMsgId}, bot_id=${ctx.bot_id} (${Date.now() - startTime}ms)`);
                    } else {
                        console.warn(`Duplicate message entry for admin_msg_id=${adminMsgId}, skipping insert`);
                    }
                } else {
                    throw new Error(`Failed to forward message: ${res.description}`);
                }
            } catch (err) {
                await sendErrorToAdmin(env, ctx, `Forward error for user ${userId}: ${err.message}`);
            }
        })();

        const confirmationPromise = (async () => {
            try {
                const confirmationResponse = await sendMessage(botToken, chatId, 'ˢᵉⁿᵗ ✅');
                const confirmationResult = await confirmationResponse.json();
                if (confirmationResult.ok) {
                    const messageId = confirmationResult.result.message_id;
                    const confirmationKey = `bot:${ctx.bot_id}:confirmation:${userId}`;
                    await env.KV.put(confirmationKey, messageId.toString(), { expirationTtl: 86400 });
                    console.log(`Confirmation sent bot_id=${ctx.bot_id} (${Date.now() - startTime}ms)`);
                } else {
                    throw new Error(`Failed to send confirmation: ${confirmationResult.description}`);
                }
            } catch (err) {
                await sendErrorToAdmin(env, ctx, `Confirmation error for user ${userId}: ${err.message}`);
            }
        })();

        const userPromise = (async () => {
            // Normalize username: remove leading @ if present to keep it consistent in DB
            const cleanUsername = username ? (username.startsWith('@') ? username.substring(1) : username) : '';
            await env.D1.prepare('INSERT INTO users (user_id, username, first_name, bot_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name')
                .bind(userId, cleanUsername, firstName, ctx.bot_id)
                .run();
        })();

        await Promise.all([forwardPromise, confirmationPromise, userPromise]);
    }

    // Cleanup old messages (5% probability)
    if (Math.random() < 0.05) {
        const cutoff = Math.floor(Date.now() / 1000) - 1296000; // 15 days
        await env.D1.prepare('DELETE FROM messages WHERE created_at < ?').bind(cutoff).run();
        console.log(`D1 DELETE old messages (${Date.now() - startTime}ms)`);
    }

    console.log(`Message handling took ${Date.now() - startTime}ms`);
}

async function handleCallbackQuery(query, env, ctx) {
    const startTime = Date.now();
    const botToken = ctx.bot_token;
    const adminId = ctx.admin_id;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    if (query.from.id.toString() !== adminId && query.from.id.toString() !== ctx.super_admin_id) {
        await answerCallbackQuery(botToken, query.id, 'Only admin can manage this bot.');
        return;
    }

    if (data === 'save_welcome') {
        const setupKey = `bot:${ctx.bot_id}:setup:${adminId}`;
        const setupState = JSON.parse(await env.KV.get(setupKey) || 'null');
        if (setupState?.type === 'welcome_collect') {
            await env.KV.put(`bot:${ctx.bot_id}:config:welcome`, JSON.stringify(setupState.messages));
            await env.KV.delete(setupKey);
            await sendMessage(botToken, adminId, '✅ Welcome messages updated and live\\!');
            await answerCallbackQuery(botToken, query.id, 'Saved!');
        } else {
            await answerCallbackQuery(botToken, query.id, 'No setup in progress.');
        }
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data === 'cancel_welcome') {
        await env.KV.delete(`bot:${ctx.bot_id}:setup:${adminId}`);
        await sendMessage(botToken, adminId, '❌ Setup cancelled\\.');
        await answerCallbackQuery(botToken, query.id, 'Cancelled.');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('delete_btn:')) {
        const index = parseInt(data.split(':')[1], 10);
        const buttons = JSON.parse(await env.KV.get(`bot:${ctx.bot_id}:config:buttons`) || '[]');
        if (buttons[index]) {
            const removed = buttons.splice(index, 1);
            await env.KV.put(`bot:${ctx.bot_id}:config:buttons`, JSON.stringify(buttons));
            await answerCallbackQuery(botToken, query.id, `Deleted: ${removed[0].text}`);

            // Refresh the list or delete message
            if (buttons.length > 0) {
                const keyboard = [];
                for (let i = 0; i < buttons.length; i++) {
                    keyboard.push([{ text: `🗑️ ${buttons[i].text}`, callback_data: `delete_btn:${i}` }]);
                }
                await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: { inline_keyboard: keyboard }
                    })
                });
            } else {
                await deleteMessage(botToken, chatId, messageId);
                await sendMessage(botToken, adminId, 'All buttons deleted\\.');
            }
        }
        return;
    } else if (data.startsWith('confirm_gbroadcast:')) {
        const setupId = data.replace('confirm_gbroadcast:', '');
        const broadcastData = JSON.parse(await env.KV.get(setupId) || 'null');
        if (!broadcastData) {
            await answerCallbackQuery(botToken, query.id, 'Global broadcast data lost.');
            return;
        }

        const bots = [{ id: 0, token: env.BOT_TOKEN }];
        const { results: clones } = await env.D1.prepare('SELECT id, token FROM clones WHERE status = ?').bind('active').all();
        bots.push(...clones);

        let totalSuccess = 0;
        let totalFail = 0;

        for (const b of bots) {
            const { results: users } = await env.D1.prepare(`
                SELECT u.user_id 
                FROM users u 
                LEFT JOIN blocked_users bl ON u.user_id = bl.user_id AND bl.bot_id = ?
                WHERE bl.user_id IS NULL AND u.bot_id = ?
            `).bind(b.id, b.id).all();

            const batchSize = 8;
            for (let i = 0; i < users.length; i += batchSize) {
                const batch = users.slice(i, i + batchSize);
                await Promise.all(batch.map(async (user) => {
                    try {
                        const res = await copyMessage(b.token, user.user_id, broadcastData.from_chat_id, broadcastData.message_id);
                        const result = await res.json();
                        if (result.ok) totalSuccess++; else totalFail++;
                    } catch (e) {
                        totalFail++;
                    }
                }));
                await new Promise(r => setTimeout(r, 100)); // Rate limit buffer between batches
            }
        }

        await env.KV.delete(setupId);
        const report = `📊 *Global Broadcast Final Report*\n✅ Sent: ${totalSuccess}\n❌ Failed: ${totalFail}`;
        await sendMessage(botToken, adminId, report, { parse_mode: 'MarkdownV2' });
        await answerCallbackQuery(botToken, query.id, 'Global Send Completed!');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('cancel_gbroadcast:')) {
        const setupId = data.replace('cancel_gbroadcast:', '');
        await env.KV.delete(setupId);
        await sendMessage(botToken, adminId, '❌ Global broadcast cancelled\\.');
        await answerCallbackQuery(botToken, query.id, 'Cancelled.');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('confirm_cbroadcast:')) {
        const broadcastId = data.replace('confirm_cbroadcast:', '');
        const broadcast = JSON.parse(await env.KV.get(broadcastId) || 'null');
        if (!broadcast) {
            await answerCallbackQuery(botToken, query.id, 'Broadcast data lost.');
            return;
        }

        const { results: owners } = await env.D1.prepare('SELECT DISTINCT owner_id FROM clones').all();
        let successCount = 0;
        let failCount = 0;

        const batchSize = 8;
        for (let i = 0; i < owners.length; i += batchSize) {
            const batch = owners.slice(i, i + batchSize);
            await Promise.all(batch.map(async (owner) => {
                try {
                    const res = await copyMessage(env.BOT_TOKEN, owner.owner_id, broadcast.from_chat_id, broadcast.message_id);
                    const result = await res.json();
                    if (result.ok) successCount++; else failCount++;
                } catch (e) {
                    failCount++;
                }
            }));
            await new Promise(r => setTimeout(r, 200));
        }

        await env.KV.delete(broadcastId);
        await sendMessage(botToken, adminId, `📊 *Owner Broadcast Report*\n✅ Sent: ${successCount}\n❌ Failed: ${failCount}`, { parse_mode: 'MarkdownV2' });
        await answerCallbackQuery(botToken, query.id, 'Owners Notified!');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('cancel_cbroadcast:')) {
        const broadcastId = data.replace('cancel_cbroadcast:', '');
        await env.KV.delete(broadcastId);
        await sendMessage(botToken, adminId, '❌ Owner broadcast cancelled\\.');
        await answerCallbackQuery(botToken, query.id, 'Cancelled.');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('approve_clone:')) {
        const secretRef = data.split(':')[1];
        await handleCloneAction(null, secretRef, 'approve', env, ctx);
        await answerCallbackQuery(botToken, query.id, 'Approving...');
        await deleteMessage(botToken, chatId, messageId);
        return;
    } else if (data.startsWith('reject_clone:')) {
        const secretRef = data.split(':')[1];
        await handleCloneAction(null, secretRef, 'reject', env, ctx);
        await answerCallbackQuery(botToken, query.id, 'Rejected.');
        await deleteMessage(botToken, chatId, messageId);
        return;
    }

    if (data.startsWith('confirm_broadcast:')) {
        const broadcastId = data.replace('confirm_broadcast:', '');
        let broadcast;
        try {
            broadcast = JSON.parse(await env.KV.get(broadcastId));
        } catch (err) {
            await sendMessage(botToken, adminId, 'Broadcast message corrupted or not found\\.');
            await answerCallbackQuery(botToken, query.id, 'Broadcast failed.');
            await env.KV.delete(broadcastId);
            return;
        }

        if (!broadcast?.message_id || !broadcast?.from_chat_id) {
            await sendMessage(botToken, adminId, 'Invalid broadcast data\\.');
            await answerCallbackQuery(botToken, query.id, 'Broadcast failed.');
            await env.KV.delete(broadcastId);
            return;
        }

        // Efficient unified selection of active users for this bot
        const { results: activeUsers } = await env.D1.prepare(`
            SELECT u.user_id, u.username, u.first_name 
            FROM users u 
            LEFT JOIN blocked_users b ON u.user_id = b.user_id AND b.bot_id = ?
            WHERE b.user_id IS NULL AND u.bot_id = ?
        `).bind(ctx.bot_id, ctx.bot_id).all();

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        const batchSize = 8;
        for (let i = 0; i < activeUsers.length; i += batchSize) {
            const batch = activeUsers.slice(i, i + batchSize);
            await Promise.all(batch.map(async (user) => {
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    try {
                        const response = await copyMessage(botToken, user.user_id, broadcast.from_chat_id, broadcast.message_id);
                        const result = await response.json();
                        if (!result.ok) throw new Error(result.description);
                        successCount++;
                        break;
                    } catch (err) {
                        attempts++;
                        if (attempts === maxAttempts) {
                            failCount++;
                            errors.push(`User ${formatUsername(user.username) || user.first_name} (${user.user_id}): ${err.message}`);
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            }));
            await new Promise(r => setTimeout(r, 200)); // Batch throttle
        }

        await env.KV.delete(broadcastId);
        let report = `Broadcast sent to ${successCount} users, failed for ${failCount} users.`;
        if (failCount > 0) {
            report += `\nErrors:\n${errors.join('\n')}`;
        }
        await sendMessage(botToken, adminId, escapeMarkdown(report));
        await answerCallbackQuery(botToken, query.id, 'Broadcast completed.');
        await deleteMessage(botToken, chatId, messageId);
        console.log(`KV DELETE ${broadcastId}, Broadcast sent (${Date.now() - startTime}ms)`);
    } else if (data.startsWith('cancel_broadcast:')) {
        const broadcastId = data.replace('cancel_broadcast:', '');
        await env.KV.delete(broadcastId);
        await sendMessage(botToken, adminId, 'Broadcast cancelled\\.');
        await answerCallbackQuery(botToken, query.id, 'Broadcast cancelled.');
        await deleteMessage(botToken, chatId, messageId);
        console.log(`KV DELETE ${broadcastId}, Broadcast cancelled (${Date.now() - startTime}ms)`);
    }
}

async function handleChannelPost(post, env, ctx) {
    const startTime = Date.now();
    const botToken = ctx.bot_token;
    const adminId = ctx.admin_id;
    const channelId = await env.KV.get(`bot:${ctx.bot_id}:config:channel_id`);

    if (!channelId || post.chat.id.toString() !== channelId) {
        return;
    }

    // Auto-forward from linked channel with bot isolation
    const { results } = await env.D1.prepare(`
        SELECT u.user_id 
        FROM users u 
        LEFT JOIN blocked_users b ON u.user_id = b.user_id AND b.bot_id = ?
        WHERE b.user_id IS NULL AND u.bot_id = ?
    `).bind(ctx.bot_id, ctx.bot_id).all();

    let successCount = 0;
    let failCount = 0;

    for (const user of results) {
        try {
            await forwardMessage(botToken, user.user_id, post.chat.id, post.message_id);
            successCount++;
        } catch (err) {
            failCount++;
        }
        await new Promise(r => setTimeout(r, 50));
    }

    // Feedback to admin
    if (adminId) {
        const report = `📢 *Auto\\-Forward Report*\\n✅ Sent to ${successCount} users\\n❌ Failed for ${failCount} users`;
        await sendMessage(botToken, adminId, report, { parse_mode: 'MarkdownV2' });
    }
}

async function sendUserList(botToken, chatId, db, botId) {
    const startTime = Date.now();
    try {
        const { results } = await db.prepare('SELECT user_id, username, first_name FROM users WHERE bot_id = ? LIMIT 50').bind(botId).all();
        if (!results.length) {
            await sendMessage(botToken, chatId, 'No users yet\\.');
            return;
        }

        let list = '👥 *Contacted Users:*\n\n';
        for (let i = 0; i < results.length; i++) {
            const user = results[i];
            const name = escapeMarkdown(user.first_name || 'User');
            const profileLink = `[${name}](tg://user?id=${user.user_id})`;
            const usernameLink = user.username ? ` (@${escapeMarkdown(user.username)})` : '';
            const entry = `• ${profileLink}${usernameLink}\\n`;

            // Check for 4096 character limit
            if ((list.length + entry.length + 50) > 4096) {
                list += `\n... and others (Showing ${i} of ${results.length})`;
                break;
            }
            list += entry;
        }

        await sendMessage(botToken, chatId, list, { parse_mode: 'MarkdownV2' });
        console.log(`D1 SELECT users, Userlist took ${Date.now() - startTime}ms`);
    } catch (err) {
        console.error(`Userlist Error: ${err.message}`);
        await sendErrorToAdmin(botToken, chatId, `Failed to fetch user list: ${err.message}`);
    }
}

async function debugMessages(botToken, chatId, db, botId) {
    const startTime = Date.now();
    try {
        const { results } = await db.prepare('SELECT m.admin_msg_id, m.user_id, m.user_msg_id, m.created_at, u.username, u.first_name FROM messages m LEFT JOIN users u ON m.user_id = u.user_id AND u.bot_id = ? WHERE m.bot_id = ? ORDER BY m.created_at DESC LIMIT 20').bind(botId, botId).all();
        if (!results.length) {
            await sendMessage(botToken, chatId, 'No messages in database\\.');
            return;
        }

        let list = '📜 *Recent Messages \\(DB\\):*\n\n';
        for (let i = 0; i < results.length; i++) {
            const msgRec = results[i];
            const name = formatUsername(msgRec.username) || escapeMarkdown(msgRec.first_name || 'Unknown');
            const entry = `• \\\`${msgRec.admin_msg_id}\\\` from ${name} \\(\\\`${msgRec.user_id}\\\`\\)\\n  msg\\_id: \\\`${msgRec.user_msg_id}\\\` @ ${new Date(msgRec.created_at * 1000).toISOString().split('T')[0]}\\n\\n`;

            if ((list.length + entry.length + 50) > 4096) {
                list += `\n... additional messages truncated.`;
                break;
            }
            list += entry;
        }

        await sendMessage(botToken, chatId, list, { parse_mode: 'MarkdownV2' });
        console.log(`D1 SELECT messages, Debug messages took ${Date.now() - startTime}ms`);
    } catch (err) {
        console.error(`Debug Messages Error: ${err.message}`);
        await sendErrorToAdmin(botToken, chatId, `Failed to fetch messages: ${err.message}`);
    }
}

function buildKeyboard(buttonConfig) {
    if (!buttonConfig || !buttonConfig.length) return undefined;

    const grid = [];
    for (let i = 0; i < buttonConfig.length; i += 2) {
        grid.push(buttonConfig.slice(i, i + 2));
    }
    return { inline_keyboard: grid };
}

async function copyMessage(token, to, fromChat, msgId, options = {}) {
    const response = await fetch(`https://api.telegram.org/bot${token}/copyMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: to,
            from_chat_id: fromChat,
            message_id: msgId,
            ...options
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
    return response;
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
            const errorData = await response.json();
            throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
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
                const errorData = await response.json();
                throw new Error(`Telegram API error (fallback): ${errorData.description || response.statusText}`);
            }
        } else {
            throw err;
        }
    }
    return response;
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function sendMessage(token, chatId, text, options = {}) {
    let response;
    try {
        response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2', ...options })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
        }
    } catch (err) {
        if (err.message.includes("can't parse entities")) {
            console.warn(`MarkdownV2 parsing failed for text, falling back to plain text. Error: ${err.message}`);
            // Clean text for plain fallback: strip backslashes used for V2 escaping
            const cleanText = text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
            response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: cleanText, ...options, parse_mode: undefined })
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Telegram API error (plain text fallback): ${errorData.description || response.statusText}`);
            }
        } else {
            throw err;
        }
    }
    return response;
}

async function sendSticker(token, chatId, sticker, options = {}) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendSticker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, sticker, ...options })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
    return response;
}

async function forwardMessage(token, to, from, msgId) {
    const response = await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: to,
            from_chat_id: from,
            message_id: msgId
        })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
    return response;
}

async function deleteMessage(token, chatId, messageId) {
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
}

async function answerCallbackQuery(token, queryId, text) {
    const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: queryId, text })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
}

async function getChat(token, chatId) {
    const response = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId })
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }
    const data = await response.json();
    return data.result;
}

async function sendErrorToAdmin(env, ctx, error) {
    // Technical errors are strictly for the Super Admin
    // We use the Main Bot Token to ensure delivery even if a clone's token is invalid
    const mainToken = env.BOT_TOKEN;
    const superAdminId = ctx.super_admin_id;
    if (!superAdminId || !mainToken) return;

    await sendMessage(mainToken, superAdminId, `⚠️ *System Error*\n\n\`${escapeMarkdown(error)}\``, { parse_mode: 'MarkdownV2' });
}

async function handleCloneAction(cloneId, secretRef, action, env, ctx) {
    try {
        let clone;
        if (secretRef) {
            clone = await env.D1.prepare('SELECT * FROM clones WHERE secret_ref = ?').bind(secretRef).first();
        } else if (cloneId) {
            clone = await env.D1.prepare('SELECT * FROM clones WHERE id = ?').bind(cloneId).first();
        }

        if (!clone) {
            await sendMessage(ctx.bot_token, ctx.super_admin_id, '❌ Clone request/bot not found\\.');
            return;
        }

        if (action === 'approve') {
            await env.D1.prepare('UPDATE clones SET status = ? WHERE id = ?').bind('active', clone.id).run();

            // Set commands for the new bot
            await setMyCommands(clone.token);

            // Auto-discover Worker domain from main bot's webhook
            const mainWebhookRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`);
            const mainWebhook = await mainWebhookRes.json();
            const baseUrl = mainWebhook.ok && mainWebhook.result.url ? new URL(mainWebhook.result.url).origin : '';

            if (baseUrl) {
                const targetWebhook = `${baseUrl}/handle/${clone.secret_ref}`;
                const webhookRes = await setWebhook(clone.token, targetWebhook);

                if (webhookRes.ok) {
                    await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `✅ Bot @${escapeMarkdown(clone.bot_username)} approved and live\\!`);
                    await sendMessage(clone.token, clone.owner_id, "🎊 Congrats\\! Your bot has been approved and is now active\\. You can use /cmd to see available admin commands\\.");
                } else {
                    await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `✅ Bot @${escapeMarkdown(clone.bot_username)} approved, but Telegram rejected the webhook: ${escapeMarkdown(webhookRes.description)}\\. Please check the token\\.`, { parse_mode: 'MarkdownV2' });
                }
            } else {
                await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `✅ Bot @${escapeMarkdown(clone.bot_username)} approved, but failed to auto\\-discover base URL\\. Please set webhook manually to: \\\`${escapeMarkdown(clone.secret_ref)}\\\``, { parse_mode: 'MarkdownV2' });
            }
        } else if (action === 'reject') {
            await env.D1.prepare('DELETE FROM clones WHERE id = ?').bind(clone.id).run();
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `❌ Clone request for @${escapeMarkdown(clone.bot_username)} rejected\\.`);
            try {
                await sendMessage(clone.token, clone.owner_id, `Sorry, your request to clone the bot \\(@${escapeMarkdown(clone.bot_username)}\\) has been rejected by the Super Admin\\.`);
            } catch (e) { }
        } else if (action === 'delete') {
            await env.D1.prepare('DELETE FROM clones WHERE id = ?').bind(clone.id).run();
            try { await fetch(`https://api.telegram.org/bot${clone.token}/deleteWebhook`); } catch (e) { }
            await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `🗑️ Bot clone @${escapeMarkdown(clone.bot_username)} deleted\\.`);
            try {
                await sendMessage(clone.token, clone.owner_id, `Your bot clone \\(@${escapeMarkdown(clone.bot_username)}\\) has been deleted by the Super Admin\\.`);
            } catch (e) { }
        }
    } catch (err) {
        await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, `❌ Error in handleCloneAction: ${escapeMarkdown(err.message)}`);
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
