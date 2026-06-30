// src/utils/cache.js
var memoryCache = /* @__PURE__ */ new Map();
var configCache2 = /* @__PURE__ */ new Map();
var activityCache = /* @__PURE__ */ new Map();
function clearConfig(botId) {
  const id = botId.toString();
  configCache2.delete(`config:${id}:welcome`);
  configCache2.delete(`config:${id}:buttons`);
  configCache2.delete(`config:${id}:channel`);
  memoryCache.delete(`config:${id}:welcome`);
  memoryCache.delete(`config:${id}:buttons`);
  memoryCache.delete(`config:${id}:channel`);
}

// src/services/db.js
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
async function upsertUser(env, bot_id, user_id, from, return_statement = false) {
  if (!from) return null;
  const cacheKey = `${bot_id}:${user_id}`;
  const metaKey = `meta:${bot_id}:${user_id}`;
  const now = Math.floor(Date.now() / 1e3);
  const lastActive = activityCache.get(cacheKey);
  activityCache.set(metaKey, { first_name: from.first_name, username: from.username });
  const stmt = env.D1.prepare("INSERT INTO users (user_id, username, first_name, bot_id, last_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_active=excluded.last_active").bind(user_id, from.username || "", from.first_name || "", bot_id, now);
  if (return_statement) return stmt;
  if (lastActive && now - lastActive < 54e3) return null;
  try {
    await stmt.run();
    activityCache.set(cacheKey, now);
    if (activityCache.size > 1e4) activityCache.clear();
  } catch (e) {
    console.error(`[DB Error] upsertUser failed: ${e.message}`);
  }
}

// src/services/telegram.js
async function safeTelegramCall(url, payload) {
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
        await new Promise((r) => setTimeout(r, retryAfter * 1e3 + 500));
        retries++;
        continue;
      }
      return data;
    } catch (err) {
      console.error(JSON.stringify({ level: "error", event: "telegram_api_error", error: err.message, url }));
      if (retries >= maxRetries) return null;
      await new Promise((r) => setTimeout(r, 1e3));
      retries++;
    }
  }
  return null;
}
async function sendMessage(token, chatId, text, options = {}) {
  const parse_mode = options.parse_mode === void 0 ? "HTML" : options.parse_mode;
  const body = {
    chat_id: chatId && typeof chatId === "object" && chatId.id ? chatId.id : chatId,
    text,
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (autoDelete && data && data.ok && executionCtx) {
    const msgId = data.result.message_id;
    const targetId = body.chat_id;
    executionCtx.waitUntil((async () => {
      await new Promise((r) => setTimeout(r, 3e3));
      try {
        await deleteMessage(token, targetId, msgId);
      } catch (e) {
      }
    })());
  }
  return data || { ok: false, description: "Telegram API Failure" };
}
async function sendMedia(token, chatId, msg2, options = {}) {
  let endpoint, body;
  const parse_mode = options.parse_mode === void 0 ? "HTML" : options.parse_mode;
  const bodyBase = { chat_id: chatId, parse_mode, ...options };
  if (msg2.caption && !msg2.sticker) {
    bodyBase.caption = msg2.caption;
  } else {
    delete bodyBase.caption;
  }
  if (msg2.text) {
    endpoint = `sendMessage`;
    body = { ...bodyBase, text: msg2.text };
  } else if (msg2.sticker) {
    endpoint = `sendSticker`;
    const { caption, parse_mode: parse_mode2, ...stickerBody } = bodyBase;
    body = { ...stickerBody, sticker: typeof msg2.sticker === "string" ? msg2.sticker : msg2.sticker.file_id };
  } else if (msg2.photo && (typeof msg2.photo === "string" || msg2.photo.length > 0)) {
    endpoint = `sendPhoto`;
    const val = typeof msg2.photo === "string" ? msg2.photo : msg2.photo[msg2.photo.length - 1].file_id;
    body = { ...bodyBase, photo: val };
  } else if (msg2.animation && (typeof msg2.animation === "string" || msg2.animation.file_id)) {
    endpoint = `sendAnimation`;
    const val = typeof msg2.animation === "string" ? msg2.animation : msg2.animation.file_id;
    body = { ...bodyBase, animation: val };
  } else if (msg2.video_note) {
    endpoint = `sendVideoNote`;
    const { caption, parse_mode: parse_mode2, ...noteBody } = bodyBase;
    const val = typeof msg2.video_note === "string" ? msg2.video_note : msg2.video_note.file_id;
    body = { ...noteBody, video_note: val };
  } else if (msg2.voice) {
    endpoint = `sendVoice`;
    const val = typeof msg2.voice === "string" ? msg2.voice : msg2.voice.file_id;
    body = { ...bodyBase, voice: val };
  } else if (msg2.video) {
    endpoint = `sendVideo`;
    const val = typeof msg2.video === "string" ? msg2.video : msg2.video.file_id;
    body = { ...bodyBase, video: val };
  } else if (msg2.document) {
    endpoint = `sendDocument`;
    const val = typeof msg2.document === "string" ? msg2.document : msg2.document.file_id;
    body = { ...bodyBase, document: val };
  } else {
    throw new Error("Unsupported media type");
  }
  if (!endpoint || !body) return { ok: false, description: "Unsupported media type or empty payload" };
  const url = `https://api.telegram.org/bot${token}/${endpoint}`;
  let data = await safeTelegramCall(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (data && !data.ok && data.description?.includes("can't parse entities") && body.parse_mode === "HTML") {
    const cleanCaption = msg2.caption ? msg2.caption.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, "$1") : void 0;
    const cleanText = msg2.text ? msg2.text.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, "$1") : void 0;
    const fallbackBody = { ...body, parse_mode: void 0 };
    if (msg2.text) fallbackBody.text = cleanText;
    if (msg2.caption) fallbackBody.caption = cleanCaption;
    data = await safeTelegramCall(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallbackBody)
    });
  }
  return data || { ok: false, description: "Telegram API Failure" };
}
async function forwardMessage(token, to, from, mid) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/forwardMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}
async function forwardMessages2(token, to, from, mids) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/forwardMessages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: to, from_chat_id: from, message_ids: mids }) }) || { ok: false, description: "Telegram API Failure" };
}
async function deleteMessage(token, cid, mid) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/deleteMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cid, message_id: mid }) }) || { ok: false, description: "Telegram API Failure" };
}
async function editMessageText(token, chatId, messageId, text, options = {}) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...options
  };
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }) || { ok: false, description: "Telegram API Failure" };
}
async function sendChatAction(token, chatId, action) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action })
  }) || { ok: false, description: "Telegram API Failure" };
}
async function answerCallbackQuery(token, qid, text) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: qid, text }) }) || { ok: false, description: "Telegram API Failure" };
}
async function setWebhook(token, url, secretToken = null) {
  const body = { url };
  if (secretToken) body.secret_token = secretToken;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
async function setMyCommands(token, isSuperBot = false) {
  const defaultCommands = [
    { command: "start", description: "\u{1F680} Start Bot" },
    { command: "clone", description: "\u{1F916} Create Clone" },
    { command: "help", description: "\u{1F4D6} Commands & Help" },
    { command: "cancel", description: "\u274C Stop Action" }
  ];
  let adminCommands = [
    ...defaultCommands,
    { command: "broadcast", description: "\u{1F4E2} Message All" },
    { command: "send", description: "\u2709\uFE0F Direct Message (ID text)" },
    { command: "say", description: "\u{1F5E3}\uFE0F Bot Speak" },
    { command: "userlist", description: "\u{1F465} List Users" },
    { command: "setwelcome", description: "\u{1F44B} Set Welcome" },
    { command: "delwelcome", description: "\u{1F5D1}\uFE0F Remove Welcome" },
    { command: "setbuttons", description: "\u{1F518} Set Buttons" },
    { command: "delbuttons", description: "\u{1F5D1}\uFE0F Remove Buttons" },
    { command: "setchannel", description: "\u{1F4FA} Link Channel" },
    { command: "delchannel", description: "\u{1F5D1}\uFE0F Remove Channel" },
    { command: "cancel", description: "\u274C Stop Action" }
  ];
  if (isSuperBot) {
    adminCommands = [
      ...adminCommands,
      { command: "status", description: "\u2699\uFE0F System Status" },
      { command: "req", description: "\u23F3 Pending Requests" },
      { command: "clones", description: "\u{1F916} Active Clones" }
    ];
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: defaultCommands, scope: { type: "default" } })
    });
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: adminCommands, scope: { type: "all_chat_admins" } })
    });
    return { ok: true };
  } catch (e) {
    console.error(`[setMyCommands Error] ${e.message}`);
    return { ok: false, description: e.message };
  }
}
function buildKeyboard(buttonConfig) {
  if (!buttonConfig || !buttonConfig.length) return void 0;
  const grid = [];
  for (let i = 0; i < buttonConfig.length; i += 2) grid.push(buttonConfig.slice(i, i + 2));
  return { inline_keyboard: grid };
}

// src/utils/logger.js
function log(ctx, message, data = {}) {
  console.log(JSON.stringify({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    bot_id: ctx.bot_id || 0,
    user_id: ctx.user_id || 0,
    message,
    ...data
  }));
}
async function logError(env, ctx, error, context = "General") {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const data = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    bot_id: ctx?.bot_id || 0,
    user_id: ctx?.user_id || 0,
    context,
    error: errorMsg,
    stack: error instanceof Error ? error.stack : void 0
  };
  console.error(JSON.stringify(data));
  if (ctx?.super_admin_id && env.BOT_TOKEN) {
    const silentErrors = [
      "chat not found",
      "bot was blocked by the user",
      "user is deactivated",
      "can't parse entities",
      "message is not modified",
      "message to forward not found",
      "query is too old",
      "message is not found",
      "message to delete not found",
      "message can't be deleted",
      "user_id_invalid",
      "peer_id_invalid",
      "bot was kicked",
      "not enough rights",
      "message to be replied not found",
      "telegram api failure"
    ];
    if (silentErrors.some((se) => errorMsg.toLowerCase().includes(se))) return;
    try {
      const report = `\u26A0\uFE0F <b>System Error</b> [${context}]
\u2022 <b>Bot ID:</b> <code>${ctx.bot_id}</code>
\u2022 <b>User ID:</b> <code>${ctx.user_id}</code>

<code>${errorMsg}</code>`;
      await sendMessage(env.BOT_TOKEN, ctx.super_admin_id, report, { parse_mode: "HTML" });
    } catch (e) {
      console.error("Failed to send error report:", e.message);
    }
  }
}

// src/config.js
var MAIN_BOT_USERNAME = "@StellarModuleBot";
function escapeHTML(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeMarkdown(text) {
  if (!text) return "";
  const chars = "_*[]()~`>#+-=|{}.!\\";
  let result = "";
  for (const char of String(text)) {
    if (chars.includes(char)) result += "\\" + char;
    else result += char;
  }
  return result;
}
var MESSAGES = {
  START_GREETING: "Welcome. You can contact us using this bot. Please send your message below.",
  CANCELLED_ALL: "<blockquote><b>Process cancelled.</b></blockquote>",
  NO_ACTIVE_CANCEL: "<blockquote>Nothing to cancel.</blockquote>",
  RATE_LIMIT: "<blockquote><b>Rate Limit Exceeded</b>\nPlease wait a moment before sending more messages.</blockquote>",
  NO_LAST_TARGET: "<blockquote><b>No target found.</b>\nPlease reply to a user first to set a target.</blockquote>",
  QUICK_REPLY_EMPTY: "<blockquote>Please provide a message.</blockquote>",
  QUICK_REPLY_SENT: (name, targetId) => `<blockquote><b>Message Sent</b>
Delivered to <a href="tg://user?id=${String(targetId).trim()}">${escapeHTML(name)}</a>.</blockquote>`,
  STEP_1_WELCOME: "<blockquote><b>Step 1:</b> Send your first welcome message.</blockquote>",
  STEP_2_WELCOME: "<blockquote><b>Step 2:</b> Send your second welcome message.</blockquote>",
  WELCOME_SAVE_CONFIRM: "<blockquote>Confirm saving this sequence?</blockquote>",
  WELCOME_UNSUPPORTED: "<blockquote>Unsupported media type. Please send text, photo, video, document, or sticker.</blockquote>",
  BUTTONS_UPDATED: (count) => `<blockquote><b>Success</b>
${count} buttons have been updated.</blockquote>`,
  BUTTONS_INVALID: "<blockquote><b>Invalid Format</b>\nPlease send buttons as: <code>Label | Link</code></blockquote>",
  CHANNEL_LINKED: (id) => `<blockquote><b>Channel Linked</b>
ID: <code>${id}</code>
Ensure the bot has admin rights in the channel.</blockquote>`,
  CHANNEL_INVALID: "<blockquote><b>Invalid Channel</b>\nPlease forward a message from the channel.</blockquote>",
  CLONE_TOKEN_INVALID: "<blockquote><b>Invalid Token</b>\nPlease send a valid BotFather token.</blockquote>",
  CLONE_REQUEST_SENT: (username) => `<blockquote><b>Request Submitted</b>
Your bot @${username} is pending review.</blockquote>`,
  CLONE_PENDING_TITLE: "<b>Pending Clone Requests:</b>\n\n",
  ACTIVE_CLONES_TITLE: "<b>Active Clones:</b>\n\n",
  REQ_INVALID: "<blockquote><b>Invalid request number.</b></blockquote>",
  CLONE_DEL_INVALID: "<blockquote><b>Invalid clone number.</b></blockquote>",
  OWNER_BROADCAST_START: "<b>Owner Broadcast</b>\n<blockquote>Send the message to broadcast to all clone owners.</blockquote>",
  GLOBAL_BROADCAST_START: "<b>Global Broadcast</b>\n<blockquote>Send the message to broadcast to all users.</blockquote>",
  BROADCAST_PROMPT: "<blockquote>Please send or forward the message you wish to broadcast.</blockquote>",
  WELCOME_PROMPT: "<blockquote>How many welcome messages do you want? (1 or 2)</blockquote>",
  BUTTONS_PROMPT: "<blockquote>Send your buttons in this format:\n<code>Label | Link</code></blockquote>",
  CHANNEL_PROMPT: "<blockquote>Forward a message from your channel to link it.</blockquote>",
  RESET_DEFAULT: "<blockquote><b>Reset Complete</b>\nWelcome message and buttons are now default.</blockquote>",
  NO_BUTTONS: "<blockquote>No buttons available to delete.</blockquote>",
  BUTTON_DELETE_SELECT: "<blockquote>Select a button to delete:</blockquote>",
  BLOCKED_USER: "<blockquote>You have been blocked by the administrator.</blockquote>",
  USER_BLOCKED_SUCCESS: (name) => `<blockquote><b>User Blocked</b>
${name} has been blocked.</blockquote>`,
  BLOCK_USAGE: "<blockquote>Usage: <code>/block @username</code> or reply to a message.</blockquote>",
  UNBLOCK_USAGE: "<blockquote>Usage: <code>/unblock @username</code> or reply to a message.</blockquote>",
  USER_NOT_FOUND: (val) => `<blockquote>User <b>${val}</b> not found.</blockquote>`,
  USER_UNBLOCKED_SUCCESS: (name) => `<blockquote><b>User Unblocked</b>
${name} has been unblocked.</blockquote>`,
  USER_NOT_BLOCKED: (name) => `<blockquote>User <b>${name}</b> is not blocked.</blockquote>`,
  CHANNEL_REMOVED: "<blockquote><b>Channel Unlinked</b></blockquote>",
  STATUS_TITLE: "<b>System Status</b>",
  STATUS_FOOTER: "<i>Command menu is synchronized.</i>",
  REPLIED_SUCCESS: (name, id) => `<blockquote><b>Message Sent</b>
Delivered to <a href="tg://user?id=${String(id).trim()}">${escapeHTML(name)}</a>.</blockquote>`,
  USER_UNREACHABLE: (id, desc) => `<blockquote>Delivery failed for <code>${id}</code>: ${desc}</blockquote>`,
  BROADCAST_REPORT: (success, fail) => `<blockquote><b>Broadcast Report</b>
Delivered: <b>${success}</b>
Failed: <b>${fail}</b></blockquote>`,
  FORWARD_REPORT: (success, fail) => `<blockquote><b>Forward Report</b>
Delivered: <b>${success}</b>
Failed: <b>${fail}</b></blockquote>`,
  CONFIRMATION: "<blockquote>Sent.</blockquote>",
  WELCOME_PREVIEW: "<b>Welcome Sequence Preview:</b>",
  CLONE_INSTRUCTIONS: "<b>Bot Setup</b>\n<blockquote>1. Go to @BotFather and create a bot.\n2. Copy the token (e.g., <code>12345:ABCDEF</code>) and send it here.\n\n<i>Type /cancel to abort.</i></blockquote>",
  CANCEL_SUCCESS: "<blockquote><b>Process Cancelled</b></blockquote>",
  CLONE_DELETED_OWNER: (bot) => `<blockquote><b>Alert</b>
Your bot @${bot} has been removed by an administrator.</blockquote>`,
  EXTRA_CLONE_PROMPT: "<blockquote><b>Request Submitted</b>\nPlease wait for an administrator to review your extra bot request.</blockquote>",
  EXTRA_CLONE_ADMIN_NOTIFY: (name, id, username, botname) => `<b>Extra Bot Request</b>
<blockquote>User: <a href="tg://user?id=${id}">${escapeHTML(name)}</a> ${username ? `(@${username})` : ""}
ID: <code>${id}</code>
Existing Bot: ${botname ? `@${botname}` : "None"}</blockquote>
Do you want to approve this request?`,
  EXTRA_CLONE_APPROVED: "<blockquote><b>Request Approved</b>\nYou can now use /clone to set up an additional bot.</blockquote>",
  EXTRA_CLONE_REJECTED: "<blockquote><b>Request Declined</b>\nYour request for an extra bot was not approved.</blockquote>"
};

// src/services/broadcast.js
function getProgressBar(current, total) {
  const size = 10;
  if (total <= 0) return `\u{1F4E2} <b>Broadcasting...</b>

Progress: <code>0%</code> [<code>${"\u25A1".repeat(size)}</code>]
\u2705 Sent: <code>${current}</code> | \u{1F4C2} Total: <code>${total}</code>`;
  const progress = Math.min(Math.max(current / total, 0), 1);
  const filledSize = Math.round(progress * size);
  const emptySize = size - filledSize;
  const bar = "\u25A0".repeat(filledSize) + "\u25A1".repeat(emptySize);
  const percent = Math.round(progress * 100);
  return `\u{1F4E2} <b>Broadcasting...</b>

Progress: <code>${percent}%</code> [<code>${bar}</code>]
\u2705 Sent: <code>${current}</code> | \u{1F4C2} Total: <code>${total}</code>`;
}
async function copyMessage(token, to, fromChat, msgId, options = {}) {
  return await safeTelegramCall(`https://api.telegram.org/bot${token}/copyMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: to, from_chat_id: fromChat, message_id: msgId, ...options })
  }) || { ok: false, description: "Telegram API Failure" };
}
async function runBroadcast(env, botId, token, bdata, ctx, progress = {}) {
  let success = 0, fail = 0;
  const limit = 500;
  let last_id = 0;
  const { chatId: pChatId, messageId: pMsgId } = progress;
  const totalRes = await queryDBFirst(env, `SELECT count(*) as c FROM users WHERE bot_id = ?`, [botId]);
  const total = totalRes?.c || 0;
  const cursorKey = `broadcast:${botId}:cursor`;
  const savedCursorStr = await env.KV.get(cursorKey);
  if (savedCursorStr) {
    try {
      const saved = JSON.parse(savedCursorStr);
      if (saved.mid === bdata.message_id) {
        last_id = parseInt(saved.cid, 10) || 0;
      }
    } catch (e) {
      console.error(`[Broadcast Resume Error] ${e.message}`);
    }
  }
  console.log(JSON.stringify({ level: "info", event: "broadcast_start", bot_id: botId }));
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > 25e3) {
      await env.KV.put(cursorKey, JSON.stringify({ cid: last_id.toString(), mid: bdata.message_id }), { expirationTtl: 86400 });
      if (pChatId && pMsgId) await editMessageText(token, pChatId, pMsgId, `\u23F3 <b>Broadcast paused...</b>
It will continue in the next cycle.

${getProgressBar(success, total)}`);
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
        } else {
          fail++;
        }
        if (pChatId && pMsgId && (success + fail) % 50 === 0) {
          await editMessageText(token, pChatId, pMsgId, getProgressBar(success, total));
        }
      } catch (err) {
        fail++;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    last_id = users[users.length - 1].id;
    if (users.length < limit) break;
  }
  if (pChatId && pMsgId) await editMessageText(token, pChatId, pMsgId, `\u2705 <b>Broadcast Complete!</b>

${getProgressBar(success, total)}`);
  await env.KV.delete(cursorKey);
  return { success, fail };
}
async function runGlobalBroadcast(env, bdata, ctx, progress = {}) {
  const bots = [{ id: 0, token: env.BOT_TOKEN }];
  const clones = (await env.D1.prepare("SELECT id, token FROM clones WHERE status = ?").bind("active").all()).results;
  bots.push(...clones);
  const botIds = bots.map((b) => b.id);
  const placeholders = botIds.map(() => "?").join(",");
  const { chatId: pChatId, messageId: pMsgId } = progress;
  const totalRes = await queryDBFirst(env, `SELECT count(*) as c FROM users WHERE bot_id IN (${placeholders})`, botIds);
  const total = totalRes?.c || 0;
  let success = 0, fail = 0;
  const limit = 500;
  let last_id = 0;
  const cursorKey = `broadcast:global:cursor`;
  const savedCursorStr = await env.KV.get(cursorKey);
  if (savedCursorStr) {
    try {
      const saved = JSON.parse(savedCursorStr);
      if (saved.mid === bdata.message_id) {
        last_id = parseInt(saved.cid, 10) || 0;
      }
    } catch (e) {
      console.error(`[Global Broadcast Resume Error] ${e.message}`);
    }
  }
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > 25e3) {
      await env.KV.put(cursorKey, JSON.stringify({ cid: last_id.toString(), mid: bdata.message_id }), { expirationTtl: 86400 });
      if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `\u23F3 <b>Global Broadcast paused...</b>

${getProgressBar(success, total)}`);
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
          let resData;
          if (b.id === 0) {
            resData = await copyMessage(b.token, userId, bdata.from_chat_id, bdata.message_id);
          } else if (bdata.text) {
            resData = await sendMessage(b.token, userId, bdata.text);
          }
          if (resData && resData.ok) success++;
          else fail++;
          if (pChatId && pMsgId && (success + fail) % 50 === 0) {
            await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, getProgressBar(success, total));
          }
        } catch (err) {
          fail++;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    last_id = allUsers[allUsers.length - 1].id;
    if (allUsers.length < limit) break;
  }
  if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `\u2705 <b>Global Broadcast Complete!</b>

${getProgressBar(success, total)}`);
  await env.KV.delete(cursorKey);
  return { success, fail };
}
async function runCloneBroadcast(env, bdata, progress = {}) {
  const clonesRes = await queryDB(env, "SELECT token, owner_id, bot_username FROM clones WHERE status = ?", ["active"]);
  const clones = clonesRes.results;
  let success = 0, fail = 0;
  const total = clones.length;
  const { chatId: pChatId, messageId: pMsgId } = progress;
  for (const c of clones) {
    try {
      const resData = await copyMessage(c.token, c.owner_id, bdata.from_chat_id, bdata.message_id);
      if (resData && resData.ok) success++;
      else {
        if (bdata.text) {
          const textRes = await sendMessage(c.token, c.owner_id, bdata.text);
          if (textRes.ok) success++;
          else fail++;
        } else {
          fail++;
        }
      }
      if (pChatId && pMsgId && (success + fail) % 5 === 0) {
        await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, getProgressBar(success, total));
      }
    } catch (err) {
      fail++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `\u2705 <b>Clone Broadcast Complete!</b>

${getProgressBar(success, total)}`);
  return { success, fail };
}

// src/handlers/flow.js
async function getUserName(env, bot_id, user_id) {
  const userResults = await queryDBFirst(env, "SELECT first_name FROM users WHERE user_id = ? AND bot_id = ?", [user_id, bot_id]);
  return userResults?.first_name || "User";
}
async function sendWelcome(env, ctx, targetId) {
  const { bot_token, bot_id } = ctx;
  let welcome = [];
  let buttons = [];
  const welcomeStr = await env.KV.get(`config:${bot_id}:welcome`);
  const buttonsStr = await env.KV.get(`config:${bot_id}:buttons`);
  try {
    if (welcomeStr) welcome = JSON.parse(welcomeStr);
  } catch (e) {
    console.error(`[JSON Error] welcomeStr: "${welcomeStr}"`);
  }
  try {
    if (buttonsStr) buttons = JSON.parse(buttonsStr);
  } catch (e) {
    console.error(`[JSON Error] buttonsStr: "${buttonsStr}"`);
  }
  if (welcome.length) {
    for (let i = 0; i < welcome.length; i++) {
      const item = welcome[i];
      const kb = i === welcome.length - 1 ? buildKeyboard(buttons) : void 0;
      if (item.type === "text") await sendMessage(bot_token, targetId, item.content, { reply_markup: kb });
      else await sendMedia(bot_token, targetId, { [item.type]: item.file_id, caption: item.caption }, { reply_markup: kb });
    }
  } else {
    await sendMessage(bot_token, targetId, MESSAGES.START_GREETING, { reply_markup: buildKeyboard(buttons) });
  }
}
async function handleCloneAction(prefetchedClone, id, secretRef, action, env, ctx) {
  const mainToken = env.BOT_TOKEN;
  try {
    let clone = prefetchedClone;
    if (!clone) {
      if (id) clone = await queryDBFirst(env, "SELECT * FROM clones WHERE id = ?", [id]);
      else clone = await queryDBFirst(env, "SELECT * FROM clones WHERE secret_ref = ?", [secretRef]);
    }
    if (!clone) return;
    if (action === "approve") {
      const webhookUrl = `${new URL(ctx.request_url).origin}/handle/${clone.secret_ref}`;
      const webhookSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const whRes = await setWebhook(clone.token, webhookUrl, webhookSecret);
      if (whRes.ok) {
        await env.KV.put(`config:${clone.id}:webhook_secret`, webhookSecret);
        await setMyCommands(clone.token, false);
        await queryDBRun(env, "UPDATE clones SET status = ? WHERE id = ?", ["active", clone.id]);
        await sendMessage(mainToken, clone.owner_id, `<b>Congratulations!</b> Your bot @${clone.bot_username} has been approved and activated!

Use it to stay in touch with your audience!`, { parse_mode: "HTML" });
        await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Activated</b>
@${clone.bot_username} is now online.</blockquote>`, { parse_mode: "HTML" });
        await env.KV.delete(key);
        return true;
      } else {
        const whError = whRes ? await whRes.text() : "Unknown Error";
        await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Activation Failed</b>
@${escapeMarkdown(clone.bot_username)}: ${escapeMarkdown(whError)}
(Clone request deleted)</blockquote>`, { parse_mode: "HTML" });
        throw new Error(`Activation failed for @${clone.bot_username}: ${whError}`);
      }
    } else if (action === "reject") {
      await queryDBRun(env, "DELETE FROM clones WHERE id = ?", [clone.id]);
      await sendMessage(mainToken, clone.owner_id, `<blockquote><b>Request Rejected</b>
Your bot @${escapeMarkdown(clone.bot_username)} was rejected. Please check your token and try again.</blockquote>`, { parse_mode: "HTML" });
      await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Rejected</b>
@${escapeMarkdown(clone.bot_username)} has been rejected.</blockquote>`, { parse_mode: "HTML" });
    } else if (action === "delete") {
      await queryDBRun(env, "DELETE FROM clones WHERE id = ?", [clone.id]);
      try {
        await fetch(`https://api.telegram.org/bot${clone.token}/deleteWebhook`);
        await sendMessage(mainToken, clone.owner_id, MESSAGES.CLONE_DELETED_OWNER(clone.bot_username), { parse_mode: "HTML" });
      } catch (e) {
        log(ctx, "Cleanup/Notify failed on delete", { error: e.message });
      }
      await sendMessage(mainToken, ctx.super_admin_id, `<blockquote><b>Deleted @${clone.bot_username}</b></blockquote>`, { parse_mode: "HTML" });
    }
  } catch (err) {
    await logError(env, ctx, err, "handleCloneAction");
  }
}
async function handleSetupState(msg2, env, ctx, state) {
  const { bot_token, admin_id, bot_id, user_id } = ctx;
  const chatId = msg2.chat.id;
  const text = msg2.text || "";
  const key2 = `state:${bot_id}:${user_id}`;
  try {
    if (text.startsWith("/")) {
      if (text.toLowerCase().split("@")[0] === "/cancel") {
        await env.KV.delete(key2);
        memoryCache.delete(key2);
        await env.KV.delete(`state:${bot_id}:broadcast:${user_id}`);
        await sendMessage(bot_token, chatId, MESSAGES.CANCELLED_ALL);
        return true;
      }
      return false;
    }
    if (state.type === "welcome_count") {
      const n = parseInt(text, 10);
      if (n === 1 || n === 2) {
        state.type = "welcome_collect";
        state.targetCount = n;
        state.messages = [];
        await env.KV.put(key2, JSON.stringify(state), { expirationTtl: 600 });
        await sendMessage(bot_token, chatId, MESSAGES.STEP_1_WELCOME);
      } else await sendMessage(bot_token, chatId, "<blockquote>Please send 1 or 2.</blockquote>", { parse_mode: "HTML" });
      return true;
    }
    if (state.type === "welcome_collect") {
      let msgData;
      if (msg2.text) msgData = { type: "text", content: msg2.text };
      else if (msg2.sticker) msgData = { type: "sticker", file_id: msg2.sticker.file_id };
      else if (msg2.photo) msgData = { type: "photo", file_id: msg2.photo[msg2.photo.length - 1].file_id, caption: msg2.caption };
      else if (msg2.animation) msgData = { type: "animation", file_id: msg2.animation.file_id, caption: msg2.caption };
      else if (msg2.video) msgData = { type: "video", file_id: msg2.video.file_id, caption: msg2.caption };
      else if (msg2.document) msgData = { type: "document", file_id: msg2.document.file_id, caption: msg2.caption };
      if (!msgData) return await sendMessage(bot_token, chatId, MESSAGES.WELCOME_UNSUPPORTED);
      state.messages.push(msgData);
      if (state.messages.length < state.targetCount) {
        await env.KV.put(key2, JSON.stringify(state), { expirationTtl: 600 });
        await sendMessage(bot_token, chatId, MESSAGES.STEP_2_WELCOME);
      } else {
        await env.KV.put(key2, JSON.stringify(state), { expirationTtl: 600 });
        await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PREVIEW, { parse_mode: "HTML" });
        for (const m of state.messages) {
          try {
            if (m.type === "text") await sendMessage(bot_token, chatId, m.content);
            else await sendMedia(bot_token, chatId, { [m.type]: m.file_id, caption: m.caption });
          } catch (e) {
            console.error(`[Setup Preview Error] ${e.message}`, m);
          }
        }
        await sendMessage(bot_token, chatId, MESSAGES.WELCOME_SAVE_CONFIRM, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Save", callback_data: "save_welcome" }, { text: "Cancel", callback_data: "cancel_welcome" }]] } });
      }
      return true;
    }
    if (state.type === "buttons") {
      const btns = [];
      text.split("\n").filter((l) => l.trim()).forEach((l) => {
        const [label, url] = l.split("|").map((s) => s.trim());
        if (label && url) btns.push({ text: label, url: url.startsWith("@") ? `https://t.me/${url.substring(1)}` : url });
      });
      if (btns.length > 2) return await sendMessage(bot_token, chatId, "<blockquote><b>Limit Reached</b>\nYou can only add up to 2 buttons. Please contact the owner if you need more.</blockquote>", { parse_mode: "HTML" });
      if (btns.length) {
        await env.KV.put(`config:${bot_id}:buttons`, JSON.stringify(btns));
        await env.KV.delete(key2);
        clearConfig(bot_id);
        await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_UPDATED(btns.length));
      } else await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_INVALID);
      return true;
    }
    if (state.type === "channel") {
      if (text.toLowerCase() === "none") {
        await env.KV.delete(`config:${bot_id}:channel`);
        memoryCache.delete(`config:${bot_id}:channel`);
        await env.KV.delete(key2);
        await sendMessage(bot_token, chatId, "<blockquote><b>Channel removed</b></blockquote>", { parse_mode: "HTML" });
        return true;
      }
      const cid = msg2.forward_from_chat?.id?.toString() || (text.startsWith("-100") ? text.trim() : null);
      if (cid) {
        await env.KV.put(`config:${bot_id}:channel`, cid);
        await env.KV.delete(key2);
        clearConfig(bot_id);
        await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_LINKED(cid), { parse_mode: "HTML" });
      } else await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_INVALID);
      return true;
    }
    if (state.type === "clone_collect") {
      if (/^\d+:[\w-]+$/.test(text.trim())) {
        const token = text.trim();
        const exists = await queryDBFirst(env, "SELECT bot_username FROM clones WHERE token = ?", [token]);
        if (exists) {
          await env.KV.delete(key2);
          await sendMessage(bot_token, chatId, `<blockquote><b>Already Registered</b>
This bot @${exists.bot_username} is already in our system.</blockquote>`, { parse_mode: "HTML" });
          return true;
        }
        const meRes = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json().catch(() => ({ ok: false, description: "Network error or invalid response" }));
        if (!meRes.ok) throw new Error(meRes.description || "Invalid bot token");
        const botUsername = meRes.result.username;
        const userExists = await queryDBFirst(env, "SELECT id FROM clones WHERE bot_username = ?", [botUsername]);
        if (userExists) {
          await env.KV.delete(key2);
          await sendMessage(bot_token, chatId, `<blockquote><b>Username Taken</b>
The username @${botUsername} is already taken as a clone. If this is your bot, please contact support.</blockquote>`, { parse_mode: "HTML" });
          return true;
        }
        const ref = Math.random().toString(36).substring(7);
        const insert = await queryDBRun(env, "INSERT INTO clones (token, owner_id, bot_username, secret_ref, status, created_at) VALUES (?, ?, ?, ?, ?, ?)", [token, user_id, botUsername, ref, "pending", Math.floor(Date.now() / 1e3)]);
        if (!insert.success) {
          if (insert.error.includes("UNIQUE constraint failed: clones.token")) {
            await env.KV.delete(key2);
            await sendMessage(bot_token, chatId, "<b>Duplicate Token</b>\nThis bot token is already being used by another clone.", { parse_mode: "HTML" });
            return true;
          }
          throw new Error(insert.error);
        }
        await env.KV.delete(key2);
        await sendMessage(bot_token, chatId, MESSAGES.CLONE_REQUEST_SENT(botUsername), { parse_mode: "HTML" });
        const ownerName = msg2.from.first_name || "User";
        const notifyHtml = `<b>New Clone Request</b>
<blockquote>Bot: @${botUsername}
Owner: <a href="tg://user?id=${user_id}">${escapeHTML(ownerName)}</a> (<code>${user_id}</code>)</blockquote>`;
        const notifyOpts = { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `approve_clone:${ref}` }, { text: "Reject", callback_data: `reject_clone:${ref}` }]] } };
        const allAdmins = [.../* @__PURE__ */ new Set([ctx.super_admin_id, ...ctx.system_admins || []])];
        for (const adId of allAdmins) {
          await sendMessage(env.BOT_TOKEN, adId, notifyHtml, notifyOpts);
        }
        return true;
      } else {
        await sendMessage(bot_token, chatId, MESSAGES.CLONE_TOKEN_INVALID, { parse_mode: "HTML" });
        return true;
      }
    }
    if (state.type === "gbroadcast_collect") {
      await env.KV.put(state.id, JSON.stringify({ from_chat_id: chatId, message_id: msg2.message_id }), { expirationTtl: 3600 });
      await env.KV.delete(key2);
      await copyMessage(bot_token, chatId, chatId, msg2.message_id, { reply_markup: { inline_keyboard: [[{ text: "Launch Global", callback_data: `confirm_gbroadcast:${state.id}` }, { text: "Cancel", callback_data: `cancel_${state.id}` }]] } });
      return true;
    }
  } catch (err) {
    await logError(env, ctx, err, "handleSetupState");
  }
  return false;
}
async function handleBroadcastState(msg2, env, ctx, state) {
  const { bot_token, admin_id, bot_id } = ctx;
  const bid = `b:${bot_id}:${Date.now()}`;
  await env.KV.put(bid, JSON.stringify({ from_chat_id: msg2.chat.id, message_id: msg2.message_id, text: msg2.text || msg2.caption || "" }), { expirationTtl: 3600 });
  await env.KV.delete(`state:${bot_id}:broadcast:${admin_id}`);
  const isMainAdmin = ctx.is_super_bot && bot_id === 0;
  let cb = `confirm_broadcast:${bid}`;
  if (state.type === "global" && isMainAdmin) cb = `confirm_gbroadcast:${bid}`;
  else if (state.type === "owners" && isMainAdmin) cb = `confirm_cbroadcast:${bid}`;
  else if (state.type === "local") cb = `confirm_broadcast:${bid}`;
  await sendMessage(bot_token, admin_id, "<blockquote><b>Broadcast Preview:</b></blockquote>", { parse_mode: "HTML" });
  await copyMessage(bot_token, admin_id, msg2.chat.id, msg2.message_id, { reply_markup: { inline_keyboard: [[{ text: "\u2705 Confirm", callback_data: cb }, { text: "\u274C Cancel", callback_data: `cancel_${bid}` }]] } });
  return true;
}
async function handleReplyFlow(msg2, env, ctx) {
  const { bot_token, admin_id, bot_id } = ctx;
  const ref = msg2.reply_to_message.message_id;
  const text = msg2.text || msg2.caption || "";
  const isShortcut = text.startsWith("!") || text.startsWith(".");
  const isStandalone = text.startsWith("?");
  const isGroup = msg2.chat.type === "group" || msg2.chat.type === "supergroup";
  if (msg2.media_group_id) {
    const mgid = msg2.media_group_id;
    const mgKey = `reply_mg:${bot_id}:${mgid}`;
    const current = await env.KV.get(mgKey);
    let ids = current ? JSON.parse(current) : [];
    if (!ids.includes(msg2.message_id)) {
      ids.push(msg2.message_id);
      ids.sort((a, b) => a - b);
      await env.KV.put(mgKey, JSON.stringify(ids), { expirationTtl: 300 });
    }
    ctx.executionCtx.waitUntil((async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const lockKey = `${mgKey}:lock`;
        if (activityCache.has(lockKey)) return;
        activityCache.set(lockKey, "1");
        const isLocked = await env.KV.get(lockKey);
        if (isLocked) return;
        await env.KV.put(lockKey, "1", { expirationTtl: 60 });
        const finalIds = JSON.parse(await env.KV.get(mgKey) || "[]");
        if (!finalIds.length) return;
        const lookupRes = await caches.default.match(`https://map.local/${bot_id}/${ref}`);
        let m2 = null;
        if (lookupRes) m2 = await lookupRes.json();
        if (!m2) m2 = await queryDBFirst(env, "SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?", [ref, bot_id]);
        const targetId2 = m2?.user_id || msg2.reply_to_message.forward_from?.id;
        if (!targetId2 || targetId2.toString() === admin_id) return;
        const fwd = await forwardMessages(bot_token, targetId2, msg2.chat.id, finalIds);
        if (fwd.ok) {
          const name = await getUserName(env, bot_id, targetId2);
          const ctxMsg = { ...ctx, user_id: admin_id };
          if (!isGroup) {
            const confKey = `state:${bot_id}:reply_conf:${admin_id}`;
            const prevConfId = await env.KV.get(confKey);
            if (prevConfId) {
              try {
                await deleteMessage(bot_token, admin_id, parseInt(prevConfId));
              } catch (e) {
              }
            }
            const conf = await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(name, targetId2), { parse_mode: "HTML", auto_delete: true, ctx: ctxMsg });
            if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
          }
          await env.KV.put(`reply_target:${bot_id}:${admin_id}`, targetId2.toString(), { expirationTtl: 86400 });
        }
        await env.KV.delete(mgKey);
      } catch (e) {
        console.error(`[Reply MediaGroup Error] ${e.message}`);
      }
    })());
    return true;
  }
  const mapKey = `https://map.local/${bot_id}/${ref}`;
  const cacheRes = await caches.default.match(mapKey);
  let m = null;
  if (cacheRes) {
    try {
      m = await cacheRes.json();
    } catch (e) {
    }
  }
  if (!m) {
    m = await queryDBFirst(env, "SELECT user_id, user_msg_id FROM messages WHERE admin_msg_id = ? AND bot_id = ?", [ref, bot_id]);
  }
  const targetId = m?.user_id || msg2.reply_to_message.forward_from?.id;
  if (!targetId || targetId.toString() === admin_id) return false;
  const blocked = await queryDBFirst(env, "SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?", [targetId, bot_id]);
  if (blocked) {
    await sendMessage(bot_token, admin_id, `<blockquote><b>Cannot Reply</b>
User <code>${targetId}</code> is blocked on this bot.</blockquote>`, { parse_mode: "HTML" });
    return true;
  }
  await sendChatAction(bot_token, targetId, "typing");
  const finalTargetId = targetId;
  const replyToId = isStandalone ? null : m?.user_msg_id || null;
  if (isStandalone) {
    if (msg2.text && msg2.text.startsWith("?")) msg2.text = msg2.text.substring(1).trim();
    if (msg2.caption && msg2.caption.startsWith("?")) msg2.caption = msg2.caption.substring(1).trim();
    if (msg2.text === "") delete msg2.text;
    if (msg2.caption === "") delete msg2.caption;
  }
  let res = await sendMedia(bot_token, finalTargetId, msg2, replyToId ? { reply_to_message_id: replyToId } : {});
  if (!res.ok && res.description?.toLowerCase().includes("message to be replied not found")) {
    res = await sendMedia(bot_token, finalTargetId, msg2, {});
  }
  if (res.ok) {
    const name = await getUserName(env, bot_id, targetId);
    const ctxMsg = { ...ctx, user_id: admin_id };
    if (!isGroup) {
      const confKey = `state:${bot_id}:reply_conf:${admin_id}`;
      const prevConfId = await env.KV.get(confKey);
      if (prevConfId) {
        try {
          await deleteMessage(bot_token, admin_id, parseInt(prevConfId));
        } catch (e) {
        }
      }
      const conf = await sendMessage(bot_token, admin_id, MESSAGES.REPLIED_SUCCESS(name, targetId), { parse_mode: "HTML", auto_delete: true, ctx: ctxMsg });
      if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
    }
    await env.KV.put(`reply_target:${bot_id}:${ctx.user_id}`, targetId.toString(), { expirationTtl: 86400 });
  } else {
    await logError(env, ctx, new Error(res.description), "ReplyFlowDeliver");
    await sendMessage(bot_token, admin_id, `<blockquote><b>Failed to deliver reply</b>
${res.description}</blockquote>`, { parse_mode: "HTML" });
  }
  return true;
}

// src/handlers/admin.js
async function handleAdminCommands(msg2, env, ctx, { command, fullCommand }) {
  const { bot_token, admin_id, bot_id, user_id, is_super_bot, super_admin_id } = ctx;
  const chatId = msg2.chat.id;
  const isAdmin = user_id.toString() === admin_id || bot_id === 0 && ctx.is_system_admin;
  if (!isAdmin) return false;
  const setupKey = `state:${bot_id}:${user_id}`;
  const broadcastKey = `state:${bot_id}:broadcast:${user_id}`;
  try {
    if (command === "/start") {
      await sendWelcome(env, ctx, chatId);
      return true;
    }
    if (command === "/help" || command === "/cmd" || command === "/cmds") {
      const helpText = `<b>Command Menu</b>

<b>User Commands</b>
<blockquote>\u2022 /start - Start the bot
\u2022 /clone - Request your own bot clone</blockquote>
<b>Admin Commands</b>
<blockquote>\u2022 /broadcast - Send message to all users
\u2022 /send - Direct msg (ID text)
\u2022 /say - Bot speaks in current chat
\u2022 /userlist - List bot users
\u2022 /block - (reply) Block a user
\u2022 /unblock - Unblock a user
\u2022 /setwelcome - Customize welcome greeting
\u2022 /delwelcome - Remove welcome greeting
\u2022 /setbuttons - Customize start buttons
\u2022 /delbuttons - Remove start buttons
\u2022 /setchannel - Link channel for posts
\u2022 /cancel - Stop current process</blockquote>
<b>Reply Shortcuts</b>
<blockquote>\u2022 To reply, just send a message in this chat.
\u2022 <code>?</code> (reply) - standalone reply (does not quote user message)</blockquote>
` + (ctx.is_system_admin && ctx.is_super_bot ? `<b>Owner Commands</b>
<blockquote>\u2022 /status - Global system status
\u2022 /req - Pending requests
\u2022 /clones - Manage bots
\u2022 /cbroadcast - Message bot owners
\u2022 /syncwebhooks - Re-sync webhooks</blockquote>
` : "") + (user_id.toString() === super_admin_id && ctx.is_super_bot ? `<b>Super Admin Commands</b>
<blockquote>\u2022 /addadmin - Add system admin
\u2022 /deladmin - Remove system admin
\u2022 /adminlist - List system admins</blockquote>
` : "") + `<i>For further assistance contact the owner.</i>`;
      await sendMessage(bot_token, msg2.chat.id, helpText, { parse_mode: "HTML" });
      return true;
    }
    if (is_super_bot && user_id.toString() === super_admin_id) {
      if (command === "/addadmin") {
        const parts = fullCommand.split(/\s+/);
        const targetId = parts[1];
        if (!targetId) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/addadmin &lt;id&gt;</code></blockquote>", { parse_mode: "HTML" });
        if (!ctx.system_admins.includes(targetId)) {
          ctx.system_admins.push(targetId);
          await env.KV.put("config:0:admins", JSON.stringify(ctx.system_admins));
          configCache.set("system_admins", ctx.system_admins);
        }
        return await sendMessage(bot_token, chatId, `<blockquote><b>Admin Added</b>
<code>${targetId}</code> is now a system admin.</blockquote>`, { parse_mode: "HTML" });
      }
      if (command === "/deladmin") {
        const parts = fullCommand.split(/\s+/);
        const targetId = parts[1];
        if (!targetId) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/deladmin &lt;id&gt;</code></blockquote>", { parse_mode: "HTML" });
        const idx = ctx.system_admins.indexOf(targetId);
        if (idx > -1) {
          ctx.system_admins.splice(idx, 1);
          await env.KV.put("config:0:admins", JSON.stringify(ctx.system_admins));
          configCache.set("system_admins", ctx.system_admins);
        }
        return await sendMessage(bot_token, chatId, `<blockquote><b>Admin Removed</b>
<code>${targetId}</code> is no longer an admin.</blockquote>`, { parse_mode: "HTML" });
      }
      if (command === "/adminlist") {
        if (!ctx.system_admins.length) return await sendMessage(bot_token, chatId, "<blockquote>No additional system admins.</blockquote>", { parse_mode: "HTML" });
        let list = "<b>System Admins</b>\n\n";
        list += ctx.system_admins.map((id, i) => `<blockquote>${i + 1}. <a href="tg://user?id=${id}">${id}</a>
/deladmin ${id}</blockquote>`).join("\n");
        return await sendMessage(bot_token, chatId, list, { parse_mode: "HTML" });
      }
    }
    if (command === "/cancel") {
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
    if (command === "/status" && is_super_bot) {
      const clones = await queryDBFirst(env, "SELECT count(*) as c FROM clones WHERE status = ?", ["active"]);
      const mainUsers = await queryDBFirst(env, "SELECT count(*) as c FROM users WHERE bot_id = ?", [bot_id]);
      const globalUsers = await queryDBFirst(env, "SELECT count(*) as c FROM users");
      const status = `<b>${MESSAGES.STATUS_TITLE}</b>

<b>Active Clones:</b> <code>${clones?.c || 0}</code>
\u{1F465} <b>Current Bot Users:</b> <code>${mainUsers?.c || 0}</code>
\u{1F310} <b>Global Users:</b> <code>${globalUsers?.c || 0}</code>

\u2022 <b>Bot ID:</b> <code>${bot_id}</code>
\u2022 <b>Admin:</b> <code>${admin_id}</code>

` + MESSAGES.STATUS_FOOTER;
      await setMyCommands(bot_token, is_super_bot);
      await sendMessage(bot_token, chatId, status, { parse_mode: "HTML" });
      return true;
    }
    if (command === "/clone") {
      if (is_super_bot) {
        await env.KV.put(setupKey, JSON.stringify({ type: "clone_collect" }), { expirationTtl: 600 });
        await sendMessage(bot_token, chatId, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: "HTML" });
      } else {
        await sendMessage(bot_token, chatId, `<blockquote>To create your own bot, please visit: ${MAIN_BOT_USERNAME}</blockquote>`, { parse_mode: "HTML" });
      }
      return true;
    }
    if (command === "/userlist") {
      const usersRes = await queryDB(env, "SELECT user_id, username, first_name FROM users WHERE bot_id = ? LIMIT 50", [bot_id]);
      const users = usersRes.results;
      if (!users.length) return await sendMessage(bot_token, chatId, "<blockquote>No users yet.</blockquote>", { parse_mode: "HTML" });
      let list = "<b>\u{1F465} Users:</b>\n\n" + users.map((u) => {
        const name = u.first_name && u.first_name !== "User" ? u.first_name : "";
        const identifier = u.username ? `@${u.username}` : `<code>${u.user_id}</code>`;
        const displayName = name ? `<a href="tg://user?id=${u.user_id}">${escapeHTML(name)}</a>` : "";
        return displayName ? `\u2022 ${displayName} - ${identifier}` : `\u2022 ${identifier}`;
      }).join("\n");
      await sendMessage(bot_token, chatId, list, { parse_mode: "HTML" });
      return true;
    }
    if (command === "/broadcast") {
      memoryCache.delete(broadcastKey);
      const type = bot_id === 0 ? "global" : "local";
      await env.KV.put(broadcastKey, JSON.stringify({ type }), { expirationTtl: 300 });
      const prompt = bot_id === 0 ? "<blockquote><b>Global Broadcast Prompt</b>\nSend the message to EVERY user of EVERY bot in the system.</blockquote>" : MESSAGES.BROADCAST_PROMPT;
      await sendMessage(bot_token, chatId, prompt, { parse_mode: "HTML" });
      return true;
    }
    if (command === "/setchannel") {
      memoryCache.delete(setupKey);
      await env.KV.put(setupKey, JSON.stringify({ type: "channel" }), { expirationTtl: 600 });
      await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_PROMPT + "\n\n<i>Reply with <code>none</code> to remove the linked channel.</i>", { parse_mode: "HTML" });
      return true;
    }
    if (command === "/block") {
      let targetId = fullCommand.split(/\s+/)[1];
      if (!targetId && msg2.reply_to_message) {
        const ref = msg2.reply_to_message.message_id;
        const mapKey = `https://map.local/${bot_id}/${ref}`;
        const cacheRes = await caches.default.match(mapKey);
        let m = null;
        if (cacheRes) {
          try {
            m = await cacheRes.json();
          } catch (e) {
          }
        }
        targetId = m?.user_id || msg2.reply_to_message.forward_from?.id;
      }
      if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.BLOCK_USAGE, { parse_mode: "HTML" });
      const user = await queryDBFirst(env, "SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?", [targetId, targetId.replace("@", ""), bot_id]);
      if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: "HTML" });
      await queryDBRun(env, "INSERT INTO blocked_users (user_id, bot_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [user.user_id, bot_id, Math.floor(Date.now() / 1e3)]);
      memoryCache.delete(`blocked:${bot_id}:${user.user_id}`);
      await sendMessage(bot_token, chatId, MESSAGES.USER_BLOCKED_SUCCESS(user.first_name), { parse_mode: "HTML" });
      return true;
    }
    if (command === "/unblock") {
      let targetId = fullCommand.split(/\s+/)[1];
      if (!targetId && msg2.reply_to_message) {
        const ref = msg2.reply_to_message.message_id;
        const mapKey = `https://map.local/${bot_id}/${ref}`;
        const cacheRes = await caches.default.match(mapKey);
        let m = null;
        if (cacheRes) {
          try {
            m = await cacheRes.json();
          } catch (e) {
          }
        }
        targetId = m?.user_id || msg2.reply_to_message.forward_from?.id;
      }
      if (!targetId) return await sendMessage(bot_token, chatId, MESSAGES.UNBLOCK_USAGE, { parse_mode: "HTML" });
      const user = await queryDBFirst(env, "SELECT user_id, first_name FROM users WHERE (user_id = ? OR username = ?) AND bot_id = ?", [targetId, targetId.replace("@", ""), bot_id]);
      if (!user) return await sendMessage(bot_token, chatId, MESSAGES.USER_NOT_FOUND(targetId), { parse_mode: "HTML" });
      await queryDBRun(env, "DELETE FROM blocked_users WHERE user_id = ? AND bot_id = ?", [user.user_id, bot_id]);
      memoryCache.delete(`blocked:${bot_id}:${user.user_id}`);
      await sendMessage(bot_token, chatId, MESSAGES.USER_UNBLOCKED_SUCCESS(user.first_name), { parse_mode: "HTML" });
      return true;
    }
    if (command === "/setwelcome") {
      memoryCache.delete(setupKey);
      await env.KV.put(setupKey, JSON.stringify({ type: "welcome_count" }), { expirationTtl: 600 });
      await sendMessage(bot_token, chatId, MESSAGES.WELCOME_PROMPT);
      return true;
    }
    if (command === "/setbuttons") {
      memoryCache.delete(setupKey);
      await env.KV.put(setupKey, JSON.stringify({ type: "buttons" }), { expirationTtl: 600 });
      await sendMessage(bot_token, chatId, MESSAGES.BUTTONS_PROMPT, { parse_mode: "HTML" });
      return true;
    }
    if (command === "/delwelcome") {
      await env.KV.delete(`config:${bot_id}:welcome`);
      await sendMessage(bot_token, chatId, "<blockquote>Welcome message reset.</blockquote>", { parse_mode: "HTML" });
      clearConfig(bot_id);
      return true;
    }
    if (command === "/delchannel") {
      await env.KV.delete(`config:${bot_id}:channel`);
      await sendMessage(bot_token, chatId, MESSAGES.CHANNEL_REMOVED);
      clearConfig(bot_id);
      return true;
    }
    if (command === "/delbuttons") {
      let btns = [];
      const btnsStr = await env.KV.get(`config:${bot_id}:buttons`);
      try {
        if (btnsStr) btns = JSON.parse(btnsStr);
      } catch (e) {
        console.error(`[JSON Error] btnsStr Del: "${btnsStr}"`);
      }
      if (!btns.length) return await sendMessage(bot_token, chatId, MESSAGES.NO_BUTTONS);
      const kb = btns.map((b, i) => [{ text: `\u{1F5D1}\uFE0F ${b.text}`, callback_data: `delete_btn:${i}` }]);
      await sendMessage(bot_token, chatId, MESSAGES.BUTTON_DELETE_SELECT, { reply_markup: { inline_keyboard: kb } });
      return true;
    }
    if (is_super_bot && command === "/req") {
      const reqs = (await env.D1.prepare("SELECT c.*, u.first_name FROM clones c LEFT JOIN users u ON c.owner_id = u.user_id AND u.bot_id = 0 WHERE c.status = ? ORDER BY c.id ASC").bind("pending").all()).results;
      if (!reqs.length) return await sendMessage(bot_token, chatId, "<blockquote>No pending requests.</blockquote>", { parse_mode: "HTML" });
      for (const r of reqs) {
        const name = r.first_name || "User";
        await sendMessage(bot_token, chatId, `<b>New Clone Request</b>
<blockquote>Bot: @${r.bot_username}
Owner: <a href="tg://user?id=${r.owner_id}">${escapeHTML(name)}</a> (<code>${r.owner_id}</code>)</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: `approve_clone:${r.secret_ref}` }, { text: "Reject", callback_data: `reject_clone:${r.secret_ref}` }]] } });
      }
      return true;
    }
    if (is_super_bot && command === "/clones") {
      const clonesRes = await queryDB(env, `
                SELECT c.bot_username, c.owner_id, u.first_name, u.username 
                FROM clones c 
                LEFT JOIN users u ON c.owner_id = u.user_id AND u.bot_id = 0 
                WHERE c.status = ? 
                ORDER BY c.id ASC
            `, ["active"]);
      const clones = clonesRes.results;
      if (!clones.length) return await sendMessage(bot_token, chatId, "<blockquote>No active clones.</blockquote>", { parse_mode: "HTML" });
      let list = "<b>Active Clones</b>\n\n";
      list += clones.map((c, i) => {
        const name = c.first_name || "User";
        const clickableName = `<a href="tg://user?id=${c.owner_id}">${escapeHTML(name)}</a>`;
        const uname = c.username ? ` (@${c.username})` : ` [<code>${c.owner_id}</code>]`;
        return `<blockquote>${i + 1}. @${c.bot_username}
Owner: ${clickableName}${uname}
/delclone_${i + 1}</blockquote>`;
      }).join("\n");
      await sendMessage(bot_token, chatId, list, { parse_mode: "HTML" });
      return true;
    }
    if (is_super_bot && command === "/cbroadcast") {
      memoryCache.delete(broadcastKey);
      await env.KV.put(broadcastKey, JSON.stringify({ type: "owners" }), { expirationTtl: 300 });
      await sendMessage(bot_token, chatId, MESSAGES.OWNER_BROADCAST_START, { parse_mode: "HTML" });
      return true;
    }
    if (is_super_bot && command === "/syncwebhooks") {
      const clonesRes = await queryDB(env, "SELECT * FROM clones WHERE status = ?", ["active"]);
      const clones = clonesRes.results || [];
      if (!clones.length) return await sendMessage(bot_token, chatId, "<blockquote>No active clones found.</blockquote>", { parse_mode: "HTML" });
      let success = 0, fail = 0;
      const workerUrl = new URL(ctx.request_url).origin;
      await sendMessage(bot_token, chatId, `<blockquote><b>Syncing ${clones.length} webhooks...</b>
Target: <code>${workerUrl}</code></blockquote>`, { parse_mode: "HTML" });
      for (const clone of clones) {
        const webhookUrl = `${workerUrl}/handle/${clone.secret_ref}`;
        const webhookSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        try {
          const whRes = await fetch(`https://api.telegram.org/bot${clone.token}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${webhookSecret}`).then((r) => r.json());
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
      await sendMessage(bot_token, chatId, `<blockquote><b>Sync Complete</b>
Success: <code>${success}</code>
Failed: <code>${fail}</code></blockquote>`, { parse_mode: "HTML" });
      return true;
    }
    if (is_super_bot && (command.startsWith("/approve_") || command.startsWith("/reject_"))) {
      const idx = parseInt(command.split("_")[1], 10) - 1;
      const action = command.startsWith("/approve") ? "approve" : "reject";
      const reqsRes = await queryDB(env, "SELECT * FROM clones WHERE status = ? ORDER BY id ASC", ["pending"]);
      const reqs = reqsRes.results;
      if (reqs[idx]) await handleCloneAction(reqs[idx], null, null, action, env, ctx);
      else await sendMessage(bot_token, chatId, MESSAGES.REQ_INVALID);
      return true;
    }
    if (is_super_bot && command.startsWith("/delclone_")) {
      const idx = parseInt(command.split("_")[1], 10) - 1;
      const clonesRes = await queryDB(env, "SELECT * FROM clones WHERE status = ? ORDER BY id ASC", ["active"]);
      const clones = clonesRes.results;
      if (clones[idx]) await handleCloneAction(clones[idx], null, null, "delete", env, ctx);
      else await sendMessage(bot_token, chatId, MESSAGES.CLONE_DEL_INVALID);
      return true;
    }
    if (command === "/say") {
      const content = fullCommand.substring(command.length).trim();
      if (!content) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/say &lt;text&gt;</code></blockquote>", { parse_mode: "HTML" });
      await sendMessage(bot_token, chatId, content, { parse_mode: "HTML" });
      try {
        await deleteMessage(bot_token, chatId, msg2.message_id);
      } catch (e) {
      }
      return true;
    }
    if (command === "/send") {
      const parts = fullCommand.split(/\s+/);
      const targetId = parts[1];
      const content = fullCommand.substring(command.length + targetId?.length + 1).trim();
      if (!targetId || !content) return await sendMessage(bot_token, chatId, "<blockquote>Usage: <code>/send &lt;id&gt; &lt;text&gt;</code></blockquote>", { parse_mode: "HTML" });
      const res = await sendMessage(bot_token, targetId, content, { parse_mode: "HTML" });
      if (res.ok) {
        await sendMessage(bot_token, chatId, `<blockquote><b>Message Sent</b>
Delivered to <code>${targetId}</code></blockquote>`, { parse_mode: "HTML" });
      } else {
        await sendMessage(bot_token, chatId, `<blockquote><b>Failed</b>
${res.description}</blockquote>`, { parse_mode: "HTML" });
      }
      return true;
    }
  } catch (err) {
    await logError(env, ctx, err, "handleAdminCommands");
    return true;
  }
  return false;
}

// src/handlers/message.js
async function handleMessage(msg2, env, ctx) {
  const { bot_id, admin_id, user_id, bot_token, super_admin_id } = ctx;
  const text = msg2.text || "";
  const isAdmin = user_id.toString() === admin_id;
  const isGroup = msg2.chat.type === "group" || msg2.chat.type === "supergroup";
  const fullCommand = text.trim();
  const command = fullCommand.split(/\s+/)[0].toLowerCase().split("@")[0];
  const stateKey = `state:${bot_id}:${user_id}`;
  if (!isAdmin) {
    const cache = caches.default;
    const rateKey = `https://rate-limit.local/${bot_id}/${user_id}`;
    const rateRes = await cache.match(rateKey);
    let rlData = { count: 0, ts: Date.now() };
    if (rateRes) {
      try {
        rlData = await rateRes.json();
      } catch (e) {
      }
    }
    const now = Date.now();
    if (now - rlData.ts > 3e4) {
      rlData = { count: 1, ts: now };
    } else {
      rlData.count++;
    }
    if (rlData.count >= 5) {
      if (rlData.count === 5) await sendMessage(bot_token, user_id, MESSAGES.RATE_LIMIT, { parse_mode: "HTML" });
      ctx.executionCtx.waitUntil(cache.put(rateKey, new Response(JSON.stringify(rlData), { headers: { "Cache-Control": "max-age=60" } })));
      return;
    }
    ctx.executionCtx.waitUntil(cache.put(rateKey, new Response(JSON.stringify(rlData), { headers: { "Cache-Control": "max-age=60" } })));
  }
  if (isGroup && !isAdmin) {
    const botName = ctx.bot_username?.toLowerCase();
    let isMentioned = false;
    const entities = msg2.entities || msg2.caption_entities || [];
    const combinedText = (text || msg2.caption || "").toLowerCase();
    for (const entity of entities) {
      if (entity.type === "mention") {
        const mention = combinedText.substring(entity.offset, entity.offset + entity.length);
        if (botName && mention === `@${botName}`) {
          isMentioned = true;
          break;
        }
      }
    }
    const isShortcutRequest = text.startsWith("?") || msg2.caption && msg2.caption.startsWith("?");
    const isReplyToBot = botName && msg2.reply_to_message?.from?.username?.toLowerCase() === botName;
    if (!isMentioned && !isShortcutRequest && !isReplyToBot) return;
  }
  if (text.startsWith("/")) {
    if (isAdmin && bot_id === 0) {
      const hasSecret = await env.KV.get("config:0:webhook_secret");
      if (!hasSecret) {
        const newSecret = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        const webhookUrl = new URL(ctx.request_url).origin;
        const whRes = await setWebhook(bot_token, webhookUrl, newSecret);
        if (whRes.ok) await env.KV.put("config:0:webhook_secret", newSecret);
      }
    }
    if (isAdmin) memoryCache.delete(stateKey);
    if (await handleAdminCommands(msg2, env, ctx, { command, fullCommand })) return;
  }
  let setupStr = await env.KV.get(stateKey);
  if (setupStr) {
    try {
      const setupData = JSON.parse(setupStr);
      if (await handleSetupState(msg2, env, ctx, setupData)) return;
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
        if (await handleBroadcastState(msg2, env, ctx, broadData)) return;
      } catch (e) {
        console.error(`[JSON Error] broadStr: "${broadStr}" - ${e.message}`);
        await env.KV.delete(`state:${bot_id}:broadcast:${admin_id}`);
      }
    }
  }
  if (isAdmin && !text.startsWith("/") && !msg2.reply_to_message && !isGroup) {
    let targetId = await env.KV.get(`reply_target:${bot_id}:${user_id}`);
    if (!targetId) return await sendMessage(bot_token, msg2.chat.id, MESSAGES.NO_LAST_TARGET);
    await sendChatAction(bot_token, targetId, "typing");
    const quickMsg = { ...msg2 };
    try {
      let res = await sendMedia(bot_token, targetId, quickMsg);
      if (res.ok) {
        const name = await getUserName2(env, bot_id, targetId);
        const confKey = `state:${bot_id}:reply_conf:${user_id}`;
        const prevConfId = await env.KV.get(confKey);
        if (prevConfId) {
          try {
            await deleteMessage(bot_token, msg2.chat.id, parseInt(prevConfId));
          } catch (e) {
          }
        }
        const ctxMsg = { ...ctx, user_id: admin_id };
        const conf = await sendMessage(bot_token, msg2.chat.id, MESSAGES.QUICK_REPLY_SENT(name, targetId), { parse_mode: "HTML", auto_delete: true, ctx: ctxMsg });
        if (conf?.ok) await env.KV.put(confKey, conf.result.message_id.toString(), { expirationTtl: 3600 });
      }
    } catch (e) {
      console.error(`[ImplicitReply Error] ${e.message}`);
      await logError(env, ctx, e, "ImplicitReply");
    }
    return;
  }
  if (isAdmin && msg2.reply_to_message && await handleReplyFlow(msg2, env, ctx)) return;
  await handleUserMessage(msg2, env, ctx);
}
async function handleUserMessage(msg2, env, ctx) {
  const { bot_token, admin_id, bot_id, user_id, super_admin_id } = ctx;
  const blockKey = `blocked:${bot_id}:${user_id}`;
  let isBlocked = memoryCache.get(blockKey);
  if (isBlocked === void 0) {
    const blocked = await queryDBFirst(env, "SELECT 1 FROM blocked_users WHERE user_id = ? AND bot_id = ?", [user_id, bot_id]);
    isBlocked = !!blocked;
    memoryCache.set(blockKey, isBlocked);
  }
  if (isBlocked) return;
  const fullCommand = msg2.text?.trim() || "";
  const command = fullCommand.split(/\s+/)[0].toLowerCase().split("@")[0];
  const stateKey = `state:${bot_id}:${user_id}`;
  ctx.executionCtx.waitUntil(upsertUser(env, bot_id, user_id, msg2.from));
  if (command === "/start") {
    await sendWelcome(env, ctx, user_id);
    return;
  }
  if (command === "/clone") {
    if (ctx.is_super_bot) {
      const clonesCountRes = await queryDBFirst(env, "SELECT count(*) as c FROM clones WHERE owner_id = ? AND status != ?", [user_id, "rejected"]);
      const clonesCount = clonesCountRes?.c || 0;
      const user = await queryDBFirst(env, "SELECT extra_clones FROM users WHERE user_id = ? AND bot_id = 0", [user_id]);
      const limit = 1 + (user?.extra_clones || 0);
      if (clonesCount >= limit && user_id.toString() !== ctx.super_admin_id) {
        return await sendMessage(bot_token, user_id, "<blockquote><b>Limit Reached</b>\nYou already have your allowed number of bots. If you need another, please use /request to ask for permission.</blockquote>", { parse_mode: "HTML" });
      }
      const stateData = JSON.stringify({ type: "clone_collect" });
      await env.KV.put(stateKey, stateData, { expirationTtl: 600 });
      memoryCache.set(stateKey, stateData);
      await sendMessage(bot_token, user_id, MESSAGES.CLONE_INSTRUCTIONS, { parse_mode: "HTML" });
    } else {
      await sendMessage(bot_token, user_id, `<blockquote>To create your own bot, please visit: @StellarModuleBot</blockquote>`, { parse_mode: "HTML" });
    }
    return;
  }
  if (command === "/help") {
    if (ctx.is_super_bot) {
      const helpText = `<b>\u{1F4D6} Help & Info</b>

This is the main bot to create your own contact bot.

\u2022 Use /start to see what I can do
\u2022 Use /clone to create your own bot

<i>For further help contact the owner @thv_haru</i>`;
      await sendMessage(bot_token, user_id, helpText, { parse_mode: "HTML" });
    } else {
      const helpText = `<b>\u{1F4D6} Help & Info</b>

This is a contact bot. You can send your messages here to reach the owner.

Want your own contact bot? Create one easily at @StellarModuleBot!`;
      await sendMessage(bot_token, user_id, helpText, { parse_mode: "HTML" });
    }
    return;
  }
  try {
    let replyParams = {};
    if (msg2.reply_to_message) {
      const mapKey = `https://map.local/${bot_id}/${msg2.reply_to_message.message_id}`;
      const cacheRes = await caches.default.match(mapKey);
      let m = null;
      if (cacheRes) {
        try {
          m = await cacheRes.json();
        } catch (e) {
        }
      }
      if (!m) {
        m = await queryDBFirst(env, "SELECT admin_msg_id FROM messages WHERE user_msg_id = ? AND bot_id = ?", [msg2.reply_to_message.message_id, bot_id]);
      }
      if (m && m.admin_msg_id) {
        replyParams.reply_to_message_id = m.admin_msg_id;
      }
    }
    if (msg2.media_group_id) {
      const mgid = msg2.media_group_id;
      const key2 = `mg:${bot_id}:${mgid}`;
      const current = await env.KV.get(key2);
      let ids = current ? JSON.parse(current) : [];
      if (!ids.includes(msg2.message_id)) {
        ids.push(msg2.message_id);
        ids.sort((a, b) => a - b);
        await env.KV.put(key2, JSON.stringify(ids), { expirationTtl: 300 });
      }
      ctx.executionCtx.waitUntil((async () => {
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const lockKey = `${key2}:lock`;
          const isLocked = await env.KV.get(lockKey);
          if (isLocked) return;
          await env.KV.put(lockKey, "1", { expirationTtl: 60 });
          const finalIds = JSON.parse(await env.KV.get(key2) || "[]");
          if (!finalIds.length) return;
          const fwd2 = await forwardMessages2(bot_token, admin_id, msg2.chat.id, finalIds);
          if (fwd2.ok) {
            await env.KV.put(`reply_target:${bot_id}:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
            if (super_admin_id && admin_id !== super_admin_id) {
              await env.KV.put(`reply_target:${bot_id}:${super_admin_id}`, user_id.toString(), { expirationTtl: 86400 });
            }
            const results = Array.isArray(fwd2.result) ? fwd2.result : [fwd2.result];
            const batch = [];
            if (msg2.chat.type === "private") {
              const userStmt = await upsertUser(env, bot_id, user_id, msg2.from, true);
              if (userStmt) batch.push(userStmt);
            }
            for (let i = 0; i < finalIds.length; i++) {
              const adminMid = results[i]?.message_id;
              if (adminMid) {
                const mapData = JSON.stringify({ user_id, user_msg_id: finalIds[i], admin_msg_id: adminMid });
                if (msg2.chat.type === "private") {
                  batch.push(env.D1.prepare("INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(adminMid, user_id, finalIds[i], bot_id, Math.floor(Date.now() / 1e3)));
                } else {
                  const mapKey1 = `https://map.local/${bot_id}/${adminMid}`;
                  const mapKey2 = `https://map.local/${bot_id}/${finalIds[i]}`;
                  ctx.executionCtx.waitUntil(caches.default.put(mapKey1, new Response(mapData, { headers: { "Cache-Control": "max-age=172800" } })));
                  ctx.executionCtx.waitUntil(caches.default.put(mapKey2, new Response(mapData, { headers: { "Cache-Control": "max-age=172800" } })));
                  batch.push(env.D1.prepare("INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(adminMid, msg2.chat.id, finalIds[i], bot_id, Math.floor(Date.now() / 1e3)));
                }
              }
            }
            if (batch.length > 0) {
              ctx.executionCtx.waitUntil(env.D1.batch(batch));
            }
            const prevConfId = await env.KV.get(`state:${bot_id}:conf:${user_id}`);
            if (prevConfId) {
              try {
                await deleteMessage(bot_token, user_id, parseInt(prevConfId));
              } catch (e) {
              }
            }
            const conf = await sendMessage(bot_token, user_id, MESSAGES.CONFIRMATION, { auto_delete: true, ctx });
            if (conf.ok) await env.KV.put(`state:${bot_id}:conf:${user_id}`, conf.result.message_id.toString(), { expirationTtl: 86400 });
          }
          await env.KV.delete(key2);
        } catch (err) {
          console.error(`[MediaGroup Background Error] ${err.message}`);
          await logError(env, ctx, err, "MediaGroupBackground");
        }
      })());
      return;
    }
    const fwd = await forwardMessage(bot_token, admin_id, msg2.chat.id, msg2.message_id);
    if (fwd && fwd.ok) {
      await env.KV.put(`reply_target:${bot_id}:${admin_id}`, user_id.toString(), { expirationTtl: 86400 });
      if (super_admin_id && admin_id !== super_admin_id) {
        await env.KV.put(`reply_target:${bot_id}:${super_admin_id}`, user_id.toString(), { expirationTtl: 86400 });
      }
      const mapData = JSON.stringify({ user_id, user_msg_id: msg2.message_id, admin_msg_id: fwd.result.message_id });
      if (msg2.chat.type === "private") {
        const batch = [];
        const userStmt = await upsertUser(env, bot_id, user_id, msg2.from, true);
        if (userStmt) batch.push(userStmt);
        batch.push(env.D1.prepare("INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(fwd.result.message_id, user_id, msg2.message_id, bot_id, Math.floor(Date.now() / 1e3)));
        ctx.executionCtx.waitUntil(env.D1.batch(batch));
      } else {
        const mapKey1 = `https://map.local/${bot_id}/${fwd.result.message_id}`;
        const mapKey2 = `https://map.local/${bot_id}/${msg2.message_id}`;
        ctx.executionCtx.waitUntil(caches.default.put(mapKey1, new Response(mapData, { headers: { "Cache-Control": "max-age=172800" } })));
        ctx.executionCtx.waitUntil(caches.default.put(mapKey2, new Response(mapData, { headers: { "Cache-Control": "max-age=172800" } })));
        ctx.executionCtx.waitUntil(env.D1.prepare("INSERT INTO messages (admin_msg_id, user_id, user_msg_id, bot_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(fwd.result.message_id, msg2.chat.id, msg2.message_id, bot_id, Math.floor(Date.now() / 1e3)).run());
      }
      const prevConfId = await env.KV.get(`state:${bot_id}:conf:${user_id}`);
      if (prevConfId) {
        try {
          await deleteMessage(bot_token, user_id, parseInt(prevConfId));
        } catch (e) {
        }
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
async function handleChannelPost(post, env, ctx) {
  const { bot_token, bot_id, admin_id } = ctx;
  const confKey = `config:${bot_id}:channel`;
  let channelId = configCache2.get(confKey);
  if (!channelId) {
    channelId = await env.KV.get(confKey);
    if (channelId) configCache2.set(confKey, channelId);
  }
  if (!channelId || post.chat.id.toString() !== channelId) {
    console.log(`[Channel Skip] Bot: ${bot_id}, Chat: ${post.chat.id}, Target: ${channelId}`);
    return;
  }
  if (bot_id === 0) {
    const results = await runGlobalBroadcast(env, { from_chat_id: post.chat.id, message_id: post.message_id }, ctx);
    if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(results.success, results.fail), { parse_mode: "HTML" });
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
    if (Date.now() - startTime > 25e3) {
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
      await new Promise((r) => setTimeout(r, 25));
    }
    last_id = users[users.length - 1].id;
    if (users.length < limit) break;
  }
  await env.KV.delete(cursorKey);
  if (admin_id) await sendMessage(bot_token, admin_id, MESSAGES.FORWARD_REPORT(success, fail), { parse_mode: "HTML" });
}
async function getUserName2(env, bot_id, user_id) {
  const userResults = await queryDBFirst(env, "SELECT first_name FROM users WHERE user_id = ? AND bot_id = ?", [user_id, bot_id]);
  return userResults?.first_name || "User";
}

// src/handlers/callback.js
async function handleCallbackQuery(query, env, ctx) {
  const { bot_token, admin_id, bot_id, super_admin_id } = ctx;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;
  const isAuthorized = query.from.id.toString() === admin_id || query.from.id.toString() === super_admin_id || bot_id === 0 && ctx.is_system_admin;
  if (!isAuthorized) {
    return await answerCallbackQuery(bot_token, query.id, "Only admin can manage this bot.");
  }
  try {
    if (data === "save_welcome") {
      const stateKey = `state:${bot_id}:${admin_id}`;
      const stateStr = await env.KV.get(stateKey);
      const state = JSON.parse(stateStr || "{}");
      if (state.type === "welcome_collect") {
        if (!state.messages || state.messages.length === 0) {
          await answerCallbackQuery(bot_token, query.id, "You must provide at least one message.", true);
          return;
        }
        const welcomeKey = `config:${bot_id}:welcome`;
        const welcomeStr = JSON.stringify(state.messages);
        await env.KV.put(welcomeKey, welcomeStr);
        await env.KV.delete(stateKey);
        clearConfig(bot_id);
        await sendMessage(bot_token, admin_id, "<blockquote><b>Success</b>\nWelcome messages updated.</blockquote>", { parse_mode: "HTML" });
      }
      await deleteMessage(bot_token, chatId, messageId);
    } else if (data === "cancel_welcome") {
      await env.KV.delete(`state:${bot_id}:${admin_id}`);
      await deleteMessage(bot_token, chatId, messageId);
    } else if (data.startsWith("delete_btn:")) {
      const index = parseInt(data.split(":")[1], 10);
      const btnKey = `config:${bot_id}:buttons`;
      let btnsStr = configCache2.get(btnKey);
      if (btnsStr === void 0) {
        btnsStr = await env.KV.get(btnKey);
      }
      let buttons = [];
      try {
        if (btnsStr) buttons = JSON.parse(btnsStr);
      } catch (e) {
      }
      if (buttons[index]) {
        const removed = buttons.splice(index, 1)[0];
        const newStr = JSON.stringify(buttons);
        await env.KV.put(btnKey, newStr);
        clearConfig(bot_id);
        await answerCallbackQuery(bot_token, query.id, `Deleted ${removed.text}`);
        if (buttons.length) await safeTelegramCall(`https://api.telegram.org/bot${bot_token}/editMessageReplyMarkup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons.map((b, i) => [{ text: `\u{1F5D1}\uFE0F ${b.text}`, callback_data: `delete_btn:${i}` }]) } }) });
        else await deleteMessage(bot_token, chatId, messageId);
      }
    } else if (data.startsWith("confirm_gbroadcast:")) {
      const sid = data.substring(data.indexOf(":") + 1);
      const bdataStr = await env.KV.get(sid);
      let bdata = null;
      try {
        if (bdataStr) bdata = JSON.parse(bdataStr);
      } catch (e) {
      }
      if (bdata) {
        await deleteMessage(bot_token, chatId, messageId);
        const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Global Broadcast...</b></blockquote>", { parse_mode: "HTML" });
        const results = await runGlobalBroadcast(env, bdata, ctx, { chatId: admin_id, messageId: pMsg.result?.message_id });
        await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: "HTML" });
        await env.KV.delete(sid);
      }
    } else if (data.startsWith("confirm_broadcast:")) {
      const bid = data.substring(data.indexOf(":") + 1);
      const bdataStr = await env.KV.get(bid);
      let bdata = null;
      try {
        if (bdataStr) bdata = JSON.parse(bdataStr);
      } catch (e) {
      }
      if (bdata) {
        await deleteMessage(bot_token, chatId, messageId);
        const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Broadcast...</b></blockquote>", { parse_mode: "HTML" });
        const results = await runBroadcast(env, bot_id, bot_token, bdata, ctx, { chatId: admin_id, messageId: pMsg.result?.message_id });
        await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: "HTML" });
        await env.KV.delete(bid);
      }
    } else if (data.startsWith("confirm_cbroadcast:")) {
      const bid = data.substring(data.indexOf(":") + 1);
      const bdataStr = await env.KV.get(bid);
      let bdata = null;
      try {
        if (bdataStr) bdata = JSON.parse(bdataStr);
      } catch (e) {
      }
      if (bdata) {
        await deleteMessage(bot_token, chatId, messageId);
        const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Owner Broadcast...</b></blockquote>", { parse_mode: "HTML" });
        const results = await runCloneBroadcast(env, bdata, { chatId: admin_id, messageId: pMsg.result?.message_id });
        await sendMessage(bot_token, admin_id, `<blockquote><b>Owner Broadcast Result</b>
Sent to: <b>${results.success}</b>
Failed: <b>${results.fail}</b></blockquote>`, { parse_mode: "HTML" });
        await env.KV.delete(bid);
      }
    } else if (data.startsWith("approve_clone:")) {
      const secretRef = data.substring(data.indexOf(":") + 1);
      const clone = await queryDBFirst(env, "SELECT * FROM clones WHERE secret_ref = ?", [secretRef]);
      if (!clone || clone.status !== "pending") return await editMessageText(bot_token, chatId, messageId, msg.text + "\n\n<b>Already processed</b>", { parse_mode: "HTML" });
      await handleCloneAction(clone, null, null, "approve", env, ctx);
      await editMessageText(bot_token, chatId, messageId, msg.text + "\n\n<b>Approved</b>", { parse_mode: "HTML" });
    } else if (data.startsWith("reject_clone:")) {
      const secretRef = data.substring(data.indexOf(":") + 1);
      const clone = await queryDBFirst(env, "SELECT * FROM clones WHERE secret_ref = ?", [secretRef]);
      if (!clone || clone.status !== "pending") return await editMessageText(bot_token, chatId, messageId, msg.text + "\n\n<b>Already processed</b>", { parse_mode: "HTML" });
      await handleCloneAction(clone, null, null, "reject", env, ctx);
      await editMessageText(bot_token, chatId, messageId, msg.text + "\n\n<b>Rejected</b>", { parse_mode: "HTML" });
    } else if (data.includes("cancel_")) {
      const bid = data.substring(data.indexOf("_") + 1);
      if (bid) await env.KV.delete(bid);
      await deleteMessage(bot_token, chatId, messageId);
    }
  } catch (err) {
    await logError(env, ctx, err, "handleCallbackQuery");
  }
}

// src/index.js
var index_default = {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const publicHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    const workerUrl = env.WORKER_URL ? env.WORKER_URL.replace(/\/$/, "") : `https://${publicHost}`;
    if (method === "GET" && path === "/health") {
      return new Response("Bot running", { status: 200 });
    }
    if (method !== "POST") {
      return new Response("OK", { status: 200 });
    }
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    const superAdminId = env.ADMIN_ID?.toString().trim();
    let ctx = {
      bot_id: 0,
      bot_token: env.BOT_TOKEN?.toString().trim(),
      admin_id: superAdminId,
      super_admin_id: superAdminId,
      is_super_bot: true,
      request_url: workerUrl,
      executionCtx
    };
    if (path.startsWith("/handle/")) {
      const secretRef = path.split("/")[2];
      const cloneCacheKey = `https://cache.local/clone/${secretRef}`;
      const cachedRes = await caches.default.match(cloneCacheKey);
      let clone = null;
      if (cachedRes) {
        try {
          clone = await cachedRes.json();
        } catch (e) {
        }
      }
      if (!clone) {
        clone = await queryDBFirst(env, "SELECT * FROM clones WHERE secret_ref = ? AND status = ?", [secretRef, "active"]);
        if (clone) {
          executionCtx.waitUntil(caches.default.put(cloneCacheKey, new Response(JSON.stringify(clone), { headers: { "Cache-Control": "max-age=3600" } })));
        }
      }
      if (!clone) return new Response("Unauthorized", { status: 403 });
      const cloneSecret = await env.KV.get(`config:${clone.id}:webhook_secret`);
      if (cloneSecret && secretToken !== cloneSecret) return new Response("Unauthorized", { status: 403 });
      ctx = {
        bot_id: clone.id,
        bot_token: clone.token.toString().trim(),
        admin_id: clone.owner_id.toString(),
        super_admin_id: superAdminId,
        is_super_bot: false,
        request_url: workerUrl,
        executionCtx
      };
    } else {
      const mainSecret = await env.KV.get(`config:0:webhook_secret`);
      if (mainSecret && secretToken !== mainSecret) return new Response("Unauthorized", { status: 403 });
    }
    try {
      const bodyText = await request.text();
      let update;
      try {
        update = JSON.parse(bodyText);
      } catch (e) {
        console.warn(`[JSON Error] Invalid update body: ${bodyText.substring(0, 100)}`);
        return new Response("OK", { status: 200 });
      }
      const updateType = update.message ? "message" : update.callback_query ? "callback_query" : update.channel_post ? "channel_post" : "unknown";
      console.log(`[Update] BotID: ${ctx.bot_id}, Type: ${updateType}, Path: ${path}`);
      const botKey = `config:${ctx.bot_id}:username`;
      let botUsername = configCache2.get(botKey);
      if (botUsername === void 0) {
        botUsername = await env.KV.get(botKey);
        if (!botUsername) {
          const me = await fetch(`https://api.telegram.org/bot${ctx.bot_token}/getMe`).then((r) => r.json()).catch(() => null);
          if (me?.ok) {
            botUsername = me.result.username;
            await env.KV.put(botKey, botUsername, { expirationTtl: 86400 });
          }
        }
        configCache2.set(botKey, botUsername || null);
      }
      ctx.bot_username = botUsername;
      ctx.user_id = update.message?.from?.id || update.callback_query?.from?.id || update.channel_post?.from?.id || 0;
      let systemAdmins = configCache2.get("system_admins");
      if (systemAdmins === void 0) {
        const adminsStr = await env.KV.get("config:0:admins");
        try {
          systemAdmins = adminsStr ? JSON.parse(adminsStr) : [];
        } catch (e) {
          systemAdmins = [];
        }
        configCache2.set("system_admins", systemAdmins);
      }
      ctx.system_admins = systemAdmins;
      ctx.is_system_admin = ctx.user_id.toString() === ctx.super_admin_id || systemAdmins.includes(ctx.user_id.toString());
      if (update.message) {
        const confKey = `config:${ctx.bot_id}:channel`;
        let channelId = configCache2.get(confKey);
        if (channelId === void 0) {
          channelId = await env.KV.get(confKey);
          configCache2.set(confKey, channelId || null);
        }
        if (channelId && update.message.chat.id.toString() === channelId && !update.message.from?.is_bot) {
          executionCtx.waitUntil(handleChannelPost(update.message, env, ctx).catch((e) => logError(env, ctx, e, "ChannelPost")));
        } else {
          executionCtx.waitUntil(handleMessage(update.message, env, ctx).catch((e) => logError(env, ctx, e, "HandleMessage")));
        }
      } else if (update.callback_query) {
        executionCtx.waitUntil(handleCallbackQuery(update.callback_query, env, ctx).catch((e) => logError(env, ctx, e, "CallbackQuery")));
      } else if (update.channel_post) {
        executionCtx.waitUntil(handleChannelPost(update.channel_post, env, ctx).catch((e) => logError(env, ctx, e, "ChannelPost")));
      }
    } catch (err) {
      await logError(env, ctx, err, "WebhookHandler");
    }
    return new Response("OK", { status: 200 });
  },
  async scheduled(event, env, ctx) {
  }
};
export {
  index_default as default
};
