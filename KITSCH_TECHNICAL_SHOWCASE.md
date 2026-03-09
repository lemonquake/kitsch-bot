# ✨ Kitsch Bot: Technical Showcase & Build Guide

Welcome to the deep dive into **Kitsch Bot**, a premium Discord utility bot blending **Modern Interactive UI** with a **Retro Aesthetic**. This document outlines the architecture, features, and "awesomeness" that make Kitsch Bot a state-of-the-art community management tool.

---

## 🎨 The Kitsch Philosophy
Kitsch Bot isn't just a utility; it's a design statement.
- **Aesthetic**: "Modern + Retro" — clean typography meets vibrant, curated color palettes.
- **Signature Color**: **Kitsch Pink** (`#FF69B4`) defines the bot's visual identity.
- **User Experience**: Focused on "ephemeral whispers" and interactive modals to keep server channels clean while providing powerful tools to moderators.

---

## 🏗️ Technical Architecture

Kitsch Bot is built on a robust, asynchronous stack designed for performance and reliability.

- **Runtime**: [Node.js](https://nodejs.org/)
- **Library**: [Discord.js v14](https://discord.js.org/)
- **Database**: [SQL.js](https://sql.js.org/) (SQLite compiled to WebAssembly) for a lightweight, file-based persistence layer.
- **Scheduling**: Multi-layered scheduling system supporting timezones and recurring events.

### 🧬 Core Components
1.  **Interaction Handlers**: Decoupled handlers for Buttons, Modals, and Select Menus (located in `src/handlers/`).
2.  **The Hub Engine**: A unique state-persistent UI system for complex, multi-step management tasks.
3.  **Embed Pipeline**: A modular system for building, templating, and deploying rich embeds.

---

## 🔥 Featured Systems

### 1. The "Hub" System 📡
The Hub is a revolutionary way to manage server resources. Instead of dozens of commands, a single `/hub edit` command opens an ephemeral, multi-layered dashboard.
- **Stateful Sessions**: Uses a `Map`-based session store to track user progress through complex menus.
- **Whisper Panels**: Delivers information via ephemeral responses to avoid chat clutter.
- **Dynamic Updates**: Modifying a Hub automatically updates the live message in the target channel.

### 2. Pulse Monitoring 💓
Stay informed about your server's health with the **Server Pulse** service.
- **Vitality Metrics**: Real-time tracking of member counts and presence (online/offline).
- **Stylized Statuses**: Automatically categorizes server activity (e.g., `Peaceful`, `Vibrant`, `Lively`).
- **Cron Integration**: Uses `node-cron` to periodically refresh and edit a single status message.

### 3. Advanced Embed Engine 🎨
The `/embed` suite provides a professional-grade editor inside Discord.
- **Live Preview**: Inspect your work ephemerally before posting.
- **Modular Buttons**: Add up to 25 interactive buttons per embed across 5 rows.
- **Template System**: Save, categorize, and reuse your best designs with `/template`.
- **Webhook Integration**: Post as a custom persona with one click, giving your announcements a unique brand.

### 4. Smart Scheduling 📅
Never miss a post with the integrated scheduler.
- **Timezone Aware**: Handles localized timing for global communities.
- **Recurring Jobs**: Supports daily or weekly automated posts for regular events.

---

## 🛠️ Developer Implementation Guide

### Project Structure
```text
src/
├── commands/      # Slash command definitions
├── database/      # SQLite schema and CRUD operations
├── handlers/      # Interaction logic (buttons, modals)
├── utils/         # Core services (Hub, Pulse, Scheduler)
└── events/        # Discord event listeners
```

### Environment Setup
Kitsch Bot requires a `.env` file with the following variables:
```env
DISCORD_TOKEN=your_token_here
CLIENT_ID=your_client_id
GUILD_ID=your_development_guild_id
DB_PATH=./data/kitsch.db
```

### Best Practices
- **Ephemeral First**: Always prefer ephemeral replies for configuration tasks.
- **Database Atoms**: Keep DB operations small and ensure `saveDatabase()` is called after mutations.
- **Error Resilience**: All handlers use `try/catch` blocks to prevent bot crashes during API downtime.

---

## 🚀 The Awesomeness Factor
What sets Kitsch Bot apart?
- **Zero Placeholder Policy**: No "coming soon" or empty menus. Every feature is polished and ready.
- **High-End UI**: Carefully crafted embeds that look premium on both Desktop and Mobile.
- **Performance**: Heavy use of caching and efficient SQL queries ensures sub-100ms response times.

---
*Built with ❤️ by the Kitsch Dev Team.*
