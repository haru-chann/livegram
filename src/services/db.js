export async function queryDB(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).all();
    } catch (e) {
        console.error(`[D1 Error] ${e.message}`, { sql, params });
        return { results: [], success: false, error: e.message };
    }
}

export async function queryDBFirst(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).first();
    } catch (e) {
        console.error(`[D1 First Error] ${e.message}`, { sql, params });
        return null;
    }
}

export async function queryDBRun(env, sql, params = []) {
    try {
        return await env.D1.prepare(sql).bind(...params).run();
    } catch (e) {
        console.error(`[D1 Run Error] ${e.message}`, { sql, params });
        return { success: false, error: e.message };
    }
}

import { activityCache } from '../utils/cache.js';

export async function upsertUser(env, bot_id, user_id, from, return_statement = false) {
    if (!from) return null;
    const cacheKey = `${bot_id}:${user_id}`;
    const metaKey = `meta:${bot_id}:${user_id}`;
    const now = Math.floor(Date.now() / 1000);
    const lastActive = activityCache.get(cacheKey);

    // Cache metadata (name/username) to avoid D1 SELECTs during notifications
    activityCache.set(metaKey, { first_name: from.first_name, username: from.username });

    const stmt = env.D1.prepare('INSERT INTO users (user_id, username, first_name, bot_id, last_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, bot_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_active=excluded.last_active')
        .bind(user_id, from.username || '', from.first_name || '', bot_id, now);

    if (return_statement) return stmt;

    // Throttle check (only for non-batched calls)
    if (lastActive && (now - lastActive < 54000)) return null;

    try {
        await stmt.run();
        activityCache.set(cacheKey, now);
        if (activityCache.size > 10000) activityCache.clear();
    } catch (e) {
        console.error(`[DB Error] upsertUser failed: ${e.message}`);
    }
}
