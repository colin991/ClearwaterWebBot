# Clearwater Discord Bot

Discord bot for Clearwater Roleplay — moderation, voice tools, ER:LC sync, Roblox group join requests, and the Discord Internet Panel.

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Add optional keys (`ERLC_SERVER_KEY`, Roblox group keys, etc.) as needed.
4. Run `npm install` and `npm start`.

Required gateway intents: **Guilds**, **Server Members**, **Server Messages**, **Message Content**, and **Guild Voice States**. Enable Server Members and Message Content in the Discord Developer Portal. Never commit or share `.env`.

## Layout

- `index.js` — bot entry point
- `commands/` — slash commands
- `prefixCommands/` — prefix commands (e.g. `-holdvc`, `-vc`)
- `events/` — Discord event handlers
- `utils/` — loaders, VC, Internet panel, ER:LC, Roblox group sync
- `data/` — host-local runtime state (gitignored) plus `site-updates.json`

## Notable features

- **Hold VC** (`-holdvc` / `-unholdvc`) — Ownership-only voice hold; action logs go to channel `1514547037537046688`
- **Discord Internet Panel** — social feed inside Discord (`INTERNET_PANEL_CHANNEL_ID`)
- **ER:LC role sync** — in-game Discord role while players are on the server
- **Roblox group join requests** — accept/decline using Melonly-verified identity cache

```env
ROBLOX_GROUP_ID=your-group-id
ROBLOX_GROUP_API_KEY=your-roblox-open-cloud-key
ROBLOX_GROUP_ALLOWED_ROLE_IDS=1514033664306974752,1514744040778760252
ROBLOX_GROUP_LOG_CHANNEL_ID=1536517651055120514
```
