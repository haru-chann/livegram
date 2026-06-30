import { sendMessage } from '../services/telegram.js';

export function log(ctx, message, data = {}) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        bot_id: ctx.bot_id || 0,
        user_id: ctx.user_id || 0,
        message,
        ...data
    }));
}

export async function logError(env, ctx, error, context = "General") {
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
