import { safeTelegramCall, editMessageText, sendMessage } from './telegram.js';
import { queryDB, queryDBFirst } from './db.js';

function getProgressBar(current, total) {
    const size = 10;
    if (total <= 0) return `📢 <b>Broadcasting...</b>\n\nProgress: <code>0%</code> [<code>${"□".repeat(size)}</code>]\n✅ Sent: <code>${current}</code> | 📂 Total: <code>${total}</code>`;

    const progress = Math.min(Math.max(current / total, 0), 1);
    const filledSize = Math.round(progress * size);
    const emptySize = size - filledSize;
    const bar = "■".repeat(filledSize) + "□".repeat(emptySize);
    const percent = Math.round(progress * 100);
    return `📢 <b>Broadcasting...</b>\n\nProgress: <code>${percent}%</code> [<code>${bar}</code>]\n✅ Sent: <code>${current}</code> | 📂 Total: <code>${total}</code>`;
}

export async function copyMessage(token, to, fromChat, msgId, options = {}) {
    return await safeTelegramCall(`https://api.telegram.org/bot${token}/copyMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: to, from_chat_id: fromChat, message_id: msgId, ...options })
    }) || { ok: false, description: "Telegram API Failure" };
}

export async function runBroadcast(env, botId, token, bdata, ctx, progress = {}) {
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
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, JSON.stringify({ cid: last_id.toString(), mid: bdata.message_id }), { expirationTtl: 86400 });
            if (pChatId && pMsgId) await editMessageText(token, pChatId, pMsgId, `⏳ <b>Broadcast paused...</b>\nIt will continue in the next cycle.\n\n${getProgressBar(success, total)}`);
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
            await new Promise(r => setTimeout(r, 25));
        }

        last_id = users[users.length - 1].id;
        if (users.length < limit) break;
    }

    if (pChatId && pMsgId) await editMessageText(token, pChatId, pMsgId, `✅ <b>Broadcast Complete!</b>\n\n${getProgressBar(success, total)}`);
    await env.KV.delete(cursorKey);
    return { success, fail };
}

export async function runGlobalBroadcast(env, bdata, ctx, progress = {}) {
    const bots = [{ id: 0, token: env.BOT_TOKEN }];
    const clones = (await env.D1.prepare('SELECT id, token FROM clones WHERE status = ?').bind('active').all()).results;
    bots.push(...clones);

    const botIds = bots.map(b => b.id);
    const placeholders = botIds.map(() => '?').join(',');

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
        if (Date.now() - startTime > 25000) {
            await env.KV.put(cursorKey, JSON.stringify({ cid: last_id.toString(), mid: bdata.message_id }), { expirationTtl: 86400 });
            if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `⏳ <b>Global Broadcast paused...</b>\n\n${getProgressBar(success, total)}`);
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
                await new Promise(r => setTimeout(r, 25));
            }
        }

        last_id = allUsers[allUsers.length - 1].id;
        if (allUsers.length < limit) break;
    }

    if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `✅ <b>Global Broadcast Complete!</b>\n\n${getProgressBar(success, total)}`);
    await env.KV.delete(cursorKey);
    return { success, fail };
}

export async function runCloneBroadcast(env, bdata, progress = {}) {
    const clonesRes = await queryDB(env, 'SELECT token, owner_id, bot_username FROM clones WHERE status = ?', ['active']);
    const clones = clonesRes.results;
    let success = 0, fail = 0;
    const total = clones.length;
    const { chatId: pChatId, messageId: pMsgId } = progress;

    for (const c of clones) {
        try {
            // To send "through the clone", we use the clone's token.
            // We first "import" the message to the owner's chat using the clone token 
            // so it can then be forwarded/copied to users if needed (though here we just target the owner).
            const resData = await copyMessage(c.token, c.owner_id, bdata.from_chat_id, bdata.message_id);
            if (resData && resData.ok) success++;
            else {
                // Fallback: If copy fails (e.g. cross-bot restriction), try to send at least the text
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
        await new Promise(r => setTimeout(r, 50));
    }

    if (pChatId && pMsgId) await editMessageText(env.BOT_TOKEN, pChatId, pMsgId, `✅ <b>Clone Broadcast Complete!</b>\n\n${getProgressBar(success, total)}`);
    return { success, fail };
}
