# Clearwater Discord Bot

Discord bot for Clearwater Roleplay — moderation, voice tools, ER:LC sync, Roblox group join requests, and the Discord Internet Panel.

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Add optional keys (`ERLC_SERVER_KEY`, Roblox group keys, etc.) as needed.
4. Run `npm install` and `npm start`.

### Apollopanel / Pterodactyl (important)

This host keeps a dirty `downloads/` file that makes normal `git pull` fail, so the panel keeps starting **old** bot code.

**One-time fix (Stop the server first, then paste in console):**

```bash
cd /home/container
rm -rf downloads
git fetch origin main
git reset --hard origin/main
git clean -fd
```

Then set the panel **Startup Command** to:

```bash
bash start.sh
```

`start.sh` force-resets to `origin/main` on every start, installs deps, then launches the bot.

Required gateway intents: **Guilds**, **Server Members**, **Server Messages**, **Message Content**, and **Guild Voice States**. Enable Server Members and Message Content in the Discord Developer Portal. Never commit or share `.env`.

## Layout

- `index.js` — bot entry point
- `start.sh` — host startup (force-sync + bot)
- `commands/` — slash commands
- `prefixCommands/` — prefix commands (e.g. `-holdvc`, `-vc`)
- `events/` — Discord event handlers
- `utils/` — loaders, VC, Internet panel, ER:LC, Roblox group sync
- `data/` — host-local runtime state (gitignored) plus `site-updates.json`

## Notable features

- **Hold VC** (`-holdvc` / `-unholdvc`) — Ownership-only voice hold; action logs go to channel `1514547037537046688`
- **Secondary server gate** — server `1514189396184793169` kicks members without role `1053768758772109394`, `1514744040778760252`, or `1514421440890409060` in the main Clearwater Discord
- **Discord Internet Panel** — social feed inside Discord (`INTERNET_PANEL_CHANNEL_ID`)
- **ER:LC role sync** — in-game Discord role while players are on the server
- **Roblox group join requests** — accept/decline using Melonly-verified identity cache
