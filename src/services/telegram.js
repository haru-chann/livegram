export async function safeTelegramCall(url, payload) {
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
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
                console.warn(JSON.stringify({ level: "warn", event: "429_retry", url, retryAfter, attempt: retries + 1 }));
                await new Promise(r => setTimeout(r, (retryAfter * 1000) + 500));
                retries++;
                continue;
            }
            return data;
        } catch (err) {
            console.error(JSON.stringify({ level: "error", event: "telegram_api_error", error: err.message, url }));
            if (retries >= maxRetries) return null;
            await new Promise(r => setTimeout(r, 1000));
            retries++;
        }
    }
    return null;
}

export async function sendMessage(token, chatId, text, options = {}) {
    const parse_mode = options.parse_mode === undefined ? 'HTML' : options.parse_mode;
    const body = {
        chat_id: (chatId && typeof chatId === 'object' && chatId.id) ? chatId.id : chatId,
        text: text,
        ...options
    };
    if (body.entities || body.caption_entities) {
        delete body.parse_mode;
    } else if (parse_mode) {
        body.parse_mode = parse_mode;
    }

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
            await new Promise(r => setTimeout(r, 3000));
            try { await deleteMessage(token, targetId, msgId); } catch (e) { }
        })());
    }
    return data || { ok: false, description: "Telegram API Failure" };
}

export async function sendMedia(token, chatId, msg, options = {}) {
    let endpoint, body;
    const parse_mode = options.parse_mode === undefined ? 'HTML' : options.parse_mode;
    const bodyBase = { chat_id: chatId, parse_mode: parse_mode, ...options };

    if (msg.caption && !msg.sticker) {
        bodyBase.caption = msg.caption;
        if (msg.caption_entities) bodyBase.caption_entities = msg.caption_entities;
    } else {
        delete bodyBase.caption;
    }

    if (msg.entities) bodyBase.entities = msg.entities;
    if (bodyBase.entities || bodyBase.caption_entities) delete bodyBase.parse_mode;

    if (msg.text) {
        endpoint = `sendMessage`;
        body = { ...bodyBase, text: msg.text };
    } else if (msg.sticker) {
        endpoint = `sendSticker`;
        const { caption, parse_mode, ...stickerBody } = bodyBase;
        body = { ...stickerBody, sticker: typeof msg.sticker === 'string' ? msg.sticker : msg.sticker.file_id };
    } else if (msg.photo && (typeof msg.photo === 'string' || msg.photo.length > 0)) {
        endpoint = `sendPhoto`;
        const val = typeof msg.photo === 'string' ? msg.photo : msg.photo[msg.photo.length - 1].file_id;
        body = { ...bodyBase, photo: val };
    } else if (msg.animation && (typeof msg.animation === 'string' || msg.animation.file_id)) {
        endpoint = `sendAnimation`;
        const val = typeof msg.animation === 'string' ? msg.animation : msg.animation.file_id;
        body = { ...bodyBase, animation: val };
    } else if (msg.video_note) {
        endpoint = `sendVideoNote`;
        const { caption, parse_mode, ...noteBody } = bodyBase;
        const val = typeof msg.video_note === 'string' ? msg.video_note : msg.video_note.file_id;
        body = { ...noteBody, video_note: val };
    } else if (msg.voice) {
        endpoint = `sendVoice`;
        const val = typeof msg.voice === 'string' ? msg.voice : msg.voice.file_id;
        body = { ...bodyBase, voice: val };
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

    if (!endpoint || !body) return { ok: false, description: "Unsupported media type or empty payload" };
    
    const url = `https://api.telegram.org/bot${token}/${endpoint}`;

    let data = await safeTelegramCall(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (data && !data.ok && data.description?.includes("can't parse entities") && body.parse_mode === 'HTML') {
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

export async function forwardMessage(token, to, from, mid) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/forwardMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}

export async function forwardMessages(token, to, from, mids) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/forwardMessages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_ids: mids }) }) || { ok: false, description: "Telegram API Failure" };
}

export async function deleteMessage(token, cid, mid) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: cid, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}

export async function editMessageText(token, chatId, messageId, text, options = {}) {
    const body = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        ...options
    };
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }) || { ok: false, description: "Telegram API Failure" };
}

export async function sendChatAction(token, chatId, action) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action })
    }) || { ok: false, description: "Telegram API Failure" };
}

export async function answerCallbackQuery(token, qid, text) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: qid, text }) }) || { ok: false, description: "Telegram API Failure" };
}

export async function setWebhook(token, url, secretToken = null) {
    const body = { url };
    if (secretToken) body.secret_token = secretToken;

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    try {
        return await res.json();
    } catch (e) {
        const text = await res.text();
        console.error(`[setWebhook Error] ${text}`);
        return { ok: false, description: text.substring(0, 100) };
    }
}

export async function setMyCommands(token, isSuperBot = false) {
    const defaultCommands = [
        { command: 'start', description: '🚀 Start Bot' },
        { command: 'clone', description: '🤖 Create Clone' },
        { command: 'help', description: '📖 Commands & Help' },
        { command: 'cancel', description: '❌ Stop Action' }
    ];

    let adminCommands = [
        ...defaultCommands,
        { command: 'broadcast', description: '📢 Message All' },
        { command: 'send', description: '✉️ Direct Message (ID text)' },
        { command: 'say', description: '🗣️ Bot Speak' },
        { command: 'userlist', description: '👥 List Users' },
        { command: 'setwelcome', description: '👋 Set Welcome' },
        { command: 'delwelcome', description: '🗑️ Remove Welcome' },
        { command: 'setbuttons', description: '🔘 Set Buttons' },
        { command: 'delbuttons', description: '🗑️ Remove Buttons' },
        { command: 'setchannel', description: '📺 Link Channel' },
        { command: 'delchannel', description: '🗑️ Remove Channel' },
        { command: 'cancel', description: '❌ Stop Action' }
    ];

    if (isSuperBot) {
        adminCommands = [
            ...adminCommands,
            { command: 'status', description: '⚙️ System Status' },
            { command: 'req', description: '⏳ Pending Requests' },
            { command: 'clones', description: '🤖 Active Clones' }
        ];
    }

    try {
        await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands: defaultCommands, scope: { type: 'default' } })
        });
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

export function buildKeyboard(buttonConfig) {
    if (!buttonConfig || !buttonConfig.length) return undefined;
    const grid = [];
    for (let i = 0; i < buttonConfig.length; i += 2) grid.push(buttonConfig.slice(i, i + 2));
    return { inline_keyboard: grid };
}

export async function getChat(token, chatId) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/getChat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId }) }) || { ok: false, description: "Telegram API Failure" };
}
