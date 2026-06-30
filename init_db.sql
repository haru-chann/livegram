-- D1 Database Initialization for Livegram Bot
-- Includes all required columns identified in the codebase

CREATE TABLE IF NOT EXISTS clones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    owner_id INTEGER,
    bot_username TEXT,
    secret_ref TEXT UNIQUE,
    status TEXT, -- 'pending', 'active', 'rejected'
    created_at INTEGER
);

-- Crucial: Primary key involves both user_id and bot_id
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER,
    username TEXT,
    first_name TEXT,
    bot_id INTEGER DEFAULT 0,
    extra_clones INTEGER DEFAULT 0,
    PRIMARY KEY(user_id, bot_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_msg_id INTEGER,
    user_id INTEGER,
    user_msg_id INTEGER,
    bot_id INTEGER DEFAULT 0,
    created_at INTEGER
);

-- Crucial: Primary key involves both user_id and bot_id
CREATE TABLE IF NOT EXISTS blocked_users (
    user_id INTEGER,
    bot_id INTEGER DEFAULT 0,
    created_at INTEGER,
    PRIMARY KEY(user_id, bot_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_admin_msg_id ON messages(admin_msg_id, bot_id);
CREATE INDEX IF NOT EXISTS idx_clones_owner_id ON clones(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_bot_id ON users(bot_id);
