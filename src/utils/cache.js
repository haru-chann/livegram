// Shared in-memory cache to ensure consistency across different modules
// in the same Cloudflare Worker isolate.

export const memoryCache = new Map();
export const configCache = new Map();
export const activityCache = new Map();

/**
 * Clear all caches (useful for debugging or forced refreshes)
 */
export function clearAllCaches() {
    memoryCache.clear();
    configCache.clear();
    activityCache.clear();
}

/**
 * Clear configuration for a specific bot (triggered by admin updates)
 * @param {string|number} botId 
 */
export function clearConfig(botId) {
    const id = botId.toString();
    configCache.delete(`config:${id}:welcome`);
    configCache.delete(`config:${id}:buttons`);
    configCache.delete(`config:${id}:channel`);
    // Also clear setup state to be safe
    memoryCache.delete(`config:${id}:welcome`);
    memoryCache.delete(`config:${id}:buttons`);
    memoryCache.delete(`config:${id}:channel`);
}
