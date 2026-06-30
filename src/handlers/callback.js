import { answerCallbackQuery, deleteMessage, sendMessage, buildKeyboard, safeTelegramCall, editMessageText } from '../services/telegram.js';
import { MESSAGES } from '../config.js';
import { logError } from '../utils/logger.js';
import { runGlobalBroadcast, runBroadcast, runCloneBroadcast } from '../services/broadcast.js';
import { handleCloneAction } from './flow.js';
import { queryDBFirst } from '../services/db.js';

import { configCache, clearConfig } from '../utils/cache.js';

export async function handleCallbackQuery(query, env, ctx) {
    const { bot_token, admin_id, bot_id, super_admin_id } = ctx;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    const isAuthorized = query.from.id.toString() === admin_id || query.from.id.toString() === super_admin_id || (bot_id === 0 && ctx.is_system_admin);
    if (!isAuthorized) {
        return await answerCallbackQuery(bot_token, query.id, 'Only admin can manage this bot.');
    }

    try {
        if (data === 'save_welcome') {
            const stateKey = `state:${bot_id}:${admin_id}`;
            const stateStr = await env.KV.get(stateKey);
            const state = JSON.parse(stateStr || '{}');
            if (state.type === 'welcome_collect') {
                if (!state.messages || state.messages.length === 0) {
                    await answerCallbackQuery(bot_token, query.id, 'You must provide at least one message.', true);
                    return;
                }
                const welcomeKey = `config:${bot_id}:welcome`;
                const welcomeStr = JSON.stringify(state.messages);
                await env.KV.put(welcomeKey, welcomeStr);
                await env.KV.delete(stateKey);
                clearConfig(bot_id);
                await sendMessage(bot_token, admin_id, '<blockquote><b>Success</b>\nWelcome messages updated.</blockquote>', { parse_mode: 'HTML' });
            }
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data === 'cancel_welcome') {
            await env.KV.delete(`state:${bot_id}:${admin_id}`);
            await deleteMessage(bot_token, chatId, messageId);
        } else if (data.startsWith('delete_btn:')) {
            const index = parseInt(data.split(':')[1], 10);
            const btnKey = `config:${bot_id}:buttons`;
            let btnsStr = configCache.get(btnKey);
            if (btnsStr === undefined) {
                btnsStr = await env.KV.get(btnKey);
            }

            let buttons = [];
            try { if (btnsStr) buttons = JSON.parse(btnsStr); } catch (e) { }
            if (buttons[index]) {
                const removed = buttons.splice(index, 1)[0];
                const newStr = JSON.stringify(buttons);
                await env.KV.put(btnKey, newStr);
                clearConfig(bot_id);
                await answerCallbackQuery(bot_token, query.id, `Deleted ${removed.text}`);
                if (buttons.length) await safeTelegramCall(`https://api.telegram.org/bot${bot_token}/editMessageReplyMarkup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons.map((b, i) => [{ text: `🗑️ ${b.text}`, callback_data: `delete_btn:${i}` }]) } }) });
                else await deleteMessage(bot_token, chatId, messageId);
            }
        } else if (data.startsWith('confirm_gbroadcast:')) {
            const sid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(sid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Global Broadcast...</b></blockquote>", { parse_mode: 'HTML' });
                const results = await runGlobalBroadcast(env, bdata, ctx, { chatId: admin_id, messageId: pMsg.result?.message_id });
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
                await env.KV.delete(sid);
            }
        } else if (data.startsWith('confirm_broadcast:')) {
            const bid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(bid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Broadcast...</b></blockquote>", { parse_mode: 'HTML' });
                const results = await runBroadcast(env, bot_id, bot_token, bdata, ctx, { chatId: admin_id, messageId: pMsg.result?.message_id });
                await sendMessage(bot_token, admin_id, MESSAGES.BROADCAST_REPORT(results.success, results.fail), { parse_mode: 'HTML' });
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('confirm_cbroadcast:')) {
            const bid = data.substring(data.indexOf(':') + 1);
            const bdataStr = await env.KV.get(bid);
            let bdata = null;
            try { if (bdataStr) bdata = JSON.parse(bdataStr); } catch (e) { }
            if (bdata) {
                await deleteMessage(bot_token, chatId, messageId);
                const pMsg = await sendMessage(bot_token, admin_id, "<blockquote><b>Starting Owner Broadcast...</b></blockquote>", { parse_mode: 'HTML' });
                const results = await runCloneBroadcast(env, bdata, { chatId: admin_id, messageId: pMsg.result?.message_id });
                await sendMessage(bot_token, admin_id, `<blockquote><b>Owner Broadcast Result</b>\nSent to: <b>${results.success}</b>\nFailed: <b>${results.fail}</b></blockquote>`, { parse_mode: 'HTML' });
                await env.KV.delete(bid);
            }
        } else if (data.startsWith('approve_clone:')) {
            const secretRef = data.substring(data.indexOf(':') + 1);
            const clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE secret_ref = ?', [secretRef]);
            if (!clone || clone.status !== 'pending') return await editMessageText(bot_token, chatId, messageId, msg.text + '\n\n<b>Already processed</b>', { parse_mode: 'HTML' });
            await handleCloneAction(clone, null, null, 'approve', env, ctx);
            await editMessageText(bot_token, chatId, messageId, msg.text + '\n\n<b>Approved</b>', { parse_mode: 'HTML' });
        } else if (data.startsWith('reject_clone:')) {
            const secretRef = data.substring(data.indexOf(':') + 1);
            const clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE secret_ref = ?', [secretRef]);
            if (!clone || clone.status !== 'pending') return await editMessageText(bot_token, chatId, messageId, msg.text + '\n\n<b>Already processed</b>', { parse_mode: 'HTML' });
            await handleCloneAction(clone, null, null, 'reject', env, ctx);
            await editMessageText(bot_token, chatId, messageId, msg.text + '\n\n<b>Rejected</b>', { parse_mode: 'HTML' });
        } else if (data.includes('cancel_')) {
            const bid = data.substring(data.indexOf('_') + 1);
            if (bid) await env.KV.delete(bid);
            await deleteMessage(bot_token, chatId, messageId);
        }
    } catch (err) { await logError(env, ctx, err, "handleCallbackQuery"); }
}
