export const MAIN_BOT_USERNAME = '@StellarModuleBot';

export function escapeHTML(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function escapeMarkdown(text) {
    if (!text) return '';
    const chars = '_*[\]()~`>#+\-=|{}.!\\';
    let result = '';
    for (const char of String(text)) {
        if (chars.includes(char)) result += '\\' + char;
        else result += char;
    }
    return result;
}

export const MESSAGES = {
    START_GREETING: "Welcome. You can contact us using this bot. Please send your message below.",
    CANCELLED_ALL: "<blockquote><b>Process cancelled.</b></blockquote>",
    NO_ACTIVE_CANCEL: "<blockquote>Nothing to cancel.</blockquote>",
    RATE_LIMIT: "<blockquote><b>Rate Limit Exceeded</b>\nPlease wait a moment before sending more messages.</blockquote>",
    NO_LAST_TARGET: "<blockquote><b>No target found.</b>\nPlease reply to a user first to set a target.</blockquote>",
    QUICK_REPLY_EMPTY: "<blockquote>Please provide a message.</blockquote>",
    QUICK_REPLY_SENT: (name, targetId) => `<blockquote><b>Message Sent</b>\nDelivered to <a href="tg://user?id=${String(targetId).trim()}">${escapeHTML(name)}</a>.</blockquote>`,
    STEP_1_WELCOME: "<blockquote><b>Step 1:</b> Send your first welcome message.</blockquote>",
    STEP_2_WELCOME: "<blockquote><b>Step 2:</b> Send your second welcome message.</blockquote>",
    WELCOME_SAVE_CONFIRM: "<blockquote>Confirm saving this sequence?</blockquote>",
    WELCOME_UNSUPPORTED: "<blockquote>Unsupported media type. Please send text, photo, video, document, or sticker.</blockquote>",
    BUTTONS_UPDATED: (count) => `<blockquote><b>Success</b>\n${count} buttons have been updated.</blockquote>`,
    BUTTONS_INVALID: "<blockquote><b>Invalid Format</b>\nPlease send buttons as: <code>Label | Link</code></blockquote>",
    CHANNEL_LINKED: (id) => `<blockquote><b>Channel Linked</b>\nID: <code>${id}</code>\nEnsure the bot has admin rights in the channel.</blockquote>`,
    CHANNEL_INVALID: "<blockquote><b>Invalid Channel</b>\nPlease forward a message from the channel.</blockquote>",
    CLONE_TOKEN_INVALID: "<blockquote><b>Invalid Token</b>\nPlease send a valid BotFather token.</blockquote>",
    CLONE_REQUEST_SENT: (username) => `<blockquote><b>Request Submitted</b>\nYour bot @${username} is pending review.</blockquote>`,
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
    USER_BLOCKED_SUCCESS: (name) => `<blockquote><b>User Blocked</b>\n${name} has been blocked.</blockquote>`,
    BLOCK_USAGE: "<blockquote>Usage: <code>/block @username</code> or reply to a message.</blockquote>",
    UNBLOCK_USAGE: "<blockquote>Usage: <code>/unblock @username</code> or reply to a message.</blockquote>",
    USER_NOT_FOUND: (val) => `<blockquote>User <b>${val}</b> not found.</blockquote>`,
    USER_UNBLOCKED_SUCCESS: (name) => `<blockquote><b>User Unblocked</b>\n${name} has been unblocked.</blockquote>`,
    USER_NOT_BLOCKED: (name) => `<blockquote>User <b>${name}</b> is not blocked.</blockquote>`,
    CHANNEL_REMOVED: "<blockquote><b>Channel Unlinked</b></blockquote>",
    STATUS_TITLE: "<b>System Status</b>",
    STATUS_FOOTER: "<i>Command menu is synchronized.</i>",
    REPLIED_SUCCESS: (name, id) => `<blockquote><b>Message Sent</b>\nDelivered to <a href="tg://user?id=${String(id).trim()}">${escapeHTML(name)}</a>.</blockquote>`,
    USER_UNREACHABLE: (id, desc) => `<blockquote>Delivery failed for <code>${id}</code>: ${desc}</blockquote>`,
    BROADCAST_REPORT: (success, fail) => `<blockquote><b>Broadcast Report</b>\nDelivered: <b>${success}</b>\nFailed: <b>${fail}</b></blockquote>`,
    FORWARD_REPORT: (success, fail) => `<blockquote><b>Forward Report</b>\nDelivered: <b>${success}</b>\nFailed: <b>${fail}</b></blockquote>`,
    CONFIRMATION: "<blockquote>Sent.</blockquote>",
    WELCOME_PREVIEW: "<b>Welcome Sequence Preview:</b>",
    CLONE_INSTRUCTIONS: "<b>Bot Setup</b>\n<blockquote>1. Go to @BotFather and create a bot.\n2. Copy the token (e.g., <code>12345:ABCDEF</code>) and send it here.\n\n<i>Type /cancel to abort.</i></blockquote>",
    CANCEL_SUCCESS: "<blockquote><b>Process Cancelled</b></blockquote>",
    CLONE_DELETED_OWNER: (bot) => `<blockquote><b>Alert</b>\nYour bot @${bot} has been removed by an administrator.</blockquote>`,
    EXTRA_CLONE_PROMPT: "<blockquote><b>Request Submitted</b>\nPlease wait for an administrator to review your extra bot request.</blockquote>",
    EXTRA_CLONE_ADMIN_NOTIFY: (name, id, username, botname) => `<b>Extra Bot Request</b>\n<blockquote>User: <a href="tg://user?id=${id}">${escapeHTML(name)}</a> ${username ? `(@${username})` : ''}\nID: <code>${id}</code>\nExisting Bot: ${botname ? `@${botname}` : 'None'}</blockquote>\nDo you want to approve this request?`,
    EXTRA_CLONE_APPROVED: "<blockquote><b>Request Approved</b>\nYou can now use /clone to set up an additional bot.</blockquote>",
    EXTRA_CLONE_REJECTED: "<blockquote><b>Request Declined</b>\nYour request for an extra bot was not approved.</blockquote>"
};
