import { queryDBFirst, queryDBRun } from './services/db.js';
import { logError } from './utils/logger.js';
import { handleMessage, handleChannelPost } from './handlers/message.js';
import { handleCallbackQuery } from './handlers/callback.js';
import { configCache } from './utils/cache.js';

export default {
    async fetch(request, env, executionCtx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const publicHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
        const workerUrl = env.WORKER_URL ? env.WORKER_URL.replace(/\/$/, '') : `https://${publicHost}`;

        if (method === 'GET' && path === '/health') {
            return new Response('Bot running', { status: 200 });
        }

        if (method !== 'POST') {
            return new Response('OK', { status: 200 });
        }

        const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        const superAdminId = env.ADMIN_ID?.toString().trim();
        let ctx = {
            bot_id: 0,
            bot_token: env.BOT_TOKEN?.toString().trim(),
            admin_id: superAdminId,
            super_admin_id: superAdminId,
            is_super_bot: true,
            request_url: workerUrl,
            executionCtx: executionCtx
        };

        // 1. Webhook Security: Secret Token Validation
        if (path.startsWith('/handle/')) {
            const secretRef = path.split('/')[2];
            const cloneCacheKey = `https://cache.local/clone/${secretRef}`;
            const cachedRes = await caches.default.match(cloneCacheKey);
            let clone = null;
            if (cachedRes) {
                try { clone = await cachedRes.json(); } catch (e) { }
            }
            if (!clone) {
                clone = await queryDBFirst(env, 'SELECT * FROM clones WHERE secret_ref = ? AND status = ?', [secretRef, 'active']);
                if (clone) {
                    executionCtx.waitUntil(caches.default.put(cloneCacheKey, new Response(JSON.stringify(clone), { headers: { 'Cache-Control': 'max-age=3600' } })));
                }
            }
            
            if (!clone) return new Response('Unauthorized', { status: 403 });

            // Optional: Clone-level secret token validation if configured in KV
            const cloneSecret = await env.KV.get(`config:${clone.id}:webhook_secret`);
            if (cloneSecret && secretToken !== cloneSecret) return new Response('Unauthorized', { status: 403 });

            ctx = {
                bot_id: clone.id,
                bot_token: clone.token.toString().trim(),
                admin_id: clone.owner_id.toString(),
                super_admin_id: superAdminId,
                is_super_bot: false,
                request_url: workerUrl,
                executionCtx: executionCtx
            };
        } else {
            // Main Bot Security
            const mainSecret = await env.KV.get(`config:0:webhook_secret`);
            if (mainSecret && secretToken !== mainSecret) return new Response('Unauthorized', { status: 403 });
        }

        try {
            const bodyText = await request.text();
            let update;

            try {
                update = JSON.parse(bodyText);
            } catch (e) {
                console.warn(`[JSON Error] Invalid update body: ${bodyText.substring(0, 100)}`);
                return new Response('OK', { status: 200 });
            }

            const updateType = update.message ? 'message' : (update.callback_query ? 'callback_query' : (update.channel_post ? 'channel_post' : 'unknown'));
            console.log(`[Update] BotID: ${ctx.bot_id}, Type: ${updateType}, Path: ${path}`);

            // Fetch bot username for group mention detection
            const botKey = `config:${ctx.bot_id}:username`;
            let botUsername = configCache.get(botKey);
            if (botUsername === undefined) {
                botUsername = await env.KV.get(botKey);
                if (!botUsername) {
                    const me = await fetch(`https://api.telegram.org/bot${ctx.bot_token}/getMe`).then(r => r.json()).catch(() => null);
                    if (me?.ok) {
                        botUsername = me.result.username;
                        await env.KV.put(botKey, botUsername, { expirationTtl: 86400 });
                    }
                }
                configCache.set(botKey, botUsername || null);
            }
            ctx.bot_username = botUsername;

            ctx.user_id = update.message?.from?.id || update.callback_query?.from?.id || update.channel_post?.from?.id || 0;

            let systemAdmins = configCache.get('system_admins');
            if (systemAdmins === undefined) {
                const adminsStr = await env.KV.get('config:0:admins');
                try { systemAdmins = adminsStr ? JSON.parse(adminsStr) : []; } catch (e) { systemAdmins = []; }
                configCache.set('system_admins', systemAdmins);
            }
            ctx.system_admins = systemAdmins;
            ctx.is_system_admin = ctx.user_id.toString() === ctx.super_admin_id || systemAdmins.includes(ctx.user_id.toString());
            if (update.message) {
                const confKey = `config:${ctx.bot_id}:channel`;
                let channelId = configCache.get(confKey);
                if (channelId === undefined) {
                    channelId = await env.KV.get(confKey);
                    configCache.set(confKey, channelId || null);
                }
                if (channelId && update.message.chat.id.toString() === channelId && !update.message.from?.is_bot) {
                    executionCtx.waitUntil(handleChannelPost(update.message, env, ctx).catch(e => logError(env, ctx, e, "ChannelPost")));
                } else {
                    executionCtx.waitUntil(handleMessage(update.message, env, ctx).catch(e => logError(env, ctx, e, "HandleMessage")));
                }
            } else if (update.callback_query) {
                executionCtx.waitUntil(handleCallbackQuery(update.callback_query, env, ctx).catch(e => logError(env, ctx, e, "CallbackQuery")));
            } else if (update.channel_post) {
                executionCtx.waitUntil(handleChannelPost(update.channel_post, env, ctx).catch(e => logError(env, ctx, e, "ChannelPost")));
            }
        } catch (err) {
            await logError(env, ctx, err, "WebhookHandler");
        }

        return new Response('OK', { status: 200 });
    },
    async scheduled(event, env, ctx) {
        // Scheduled task disabled: Users can be inactive for months legitimately.
        // We only clean up old messages if needed, not users.
    }
};
