# 🤖 Livegram Multi-Tenant Bot Cloner

A powerful, secure, and production-ready Telegram bot cloning platform built on **Cloudflare Workers**. This bot allows you to manage multiple "cloned" bot instances from a single codebase, featuring strict data isolation, advanced broadcasting tools, and a premium administrative interface.

---

## 🚀 Key Features

### 🏢 Multi-Tenant Bot Cloning
- **Dynamic Cloning**: Users can request their own bot clone by providing a token from `@BotFather`.
- **Approval System**: Super Admin can review, approve, or reject clone requests with a single click.
- **Sequential IDs**: Easy management using simple numbers (1, 2, 3...) that automatically re-order when items are deleted.

### 📢 Advanced Broadcasting
- **Global Broadcast (`/gbroadcast`)**: Message **EVERY** user across **ALL** cloned bots (Super Admin only).
- **Owner Broadcast (`/cbroadcast`)**: Message only the **bot owners** for administrative updates.
- **Bot-Level Broadcast (`/broadcast`)**: Individual bot owners can message their own user base.
- **Interactive Confirmation**: All broadcasts feature a "Confirm & Send" preview step to prevent accidents.

### ⚡ Quick-Reply Shortcut (`!.`)
- **Instant Messaging**: Admins can skip long-pressing or replying by starting a message with `!.` to automatically message the last person they contacted.
- **Target Tracking**: The bot intelligently remembers your "last target" after every reply, block, or unblock.
- **Media Support**: Works for text, photos, stickers, and documents (via captions).

### 🛡️ Privacy & Security
- **Super Admin Privacy**: Technical system/D1 errors are **strictly private** to the Super Admin and always deliver through the **Main Bot**.
- **Data Isolation**: All users, messages, and configurations are partitioned by `bot_id`.
- **Blocked Users**: Robust blocking system scoped to each individual bot instance.

### 🎨 Premium User Experience
- **MarkdownV2 Support**: Clean, professional formatting for all menus and messages.
- **Smart Fallback**: Automatically strips formatting characters if Markdown parsing fails, ensuring the message always delivers gracefully.
- **Customizable**: Set unique welcome messages and start-button keyboards for every clone.

---

## 🛠️ Setup Instructions

### 1. Cloudflare Requirements
You will need a Cloudflare account with the following services:
- **Workers**: To host the bot logic.
- **D1 Database**: For persistent storage of users and clones.
- **KV Namespace**: For state management and configuration.

### 2. D1 Database Schema
Run the following SQL in your Cloudflare D1 console to initialize the database. **Note the composite primary keys**; this is critical for multi-tenancy:

```sql
CREATE TABLE IF NOT EXISTS clones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE,
    owner_id INTEGER,
    bot_username TEXT,
    secret_ref TEXT UNIQUE,
    status TEXT,
    created_at INTEGER
);

-- Crucial: Primary key involves both user_id and bot_id
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER,
    username TEXT,
    first_name TEXT,
    bot_id INTEGER DEFAULT 0,
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
    PRIMARY KEY(user_id, bot_id)
);
```

### 3. Environment Variables
Add these variables to your Worker's `Settings > Variables`:
- `BOT_TOKEN`: The API token for your **Main Bot** (from @BotFather).
- `ADMIN_ID`: Your Telegram User ID (Super Admin).

### 4. Required KV & D1 Bindings
Ensure your Worker is bound to the following:
- **D1 Database**: Bound as `D1_DB`.
- **KV Namespace**: Bound as `KV`.

### 5. Deployment
1. Copy the `worker.js` code to your Worker.
2. Set your Worker's URL as the webhook for your Main Bot:
   `https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_WORKER_URL>`

---

## 📖 Main Bot Commands (Super Admin)
- `/start` - Initialize your admin session.
- `/req` - View and manage pending clone requests.
- `/clones` - Manage active bot clones.
- `/gbroadcast` - Send a message to all users globally.
- `/cbroadcast` - Message all bot owners specifically.
- `/status` - Check server diagnostics and sync command menus.

## 👤 Clone Admin Commands
- `/broadcast` - Message your own bot's users.
- `/userlist` - View users who have contacted your bot.
- `/setwelcome` - Customize your bot's greeting.
- `/setbuttons` - Customize the start keyboard.
- `/block` / `/unblock` - Manage access to your bot.

---

## 💡 Pro Tip: Quick-Reply
Simply type `!. Your message` to reply to the last person who messaged you. It's the fastest way to handle multiple conversations!

---

*For further help or custom modifications, contact the developer @thv_haru.*
