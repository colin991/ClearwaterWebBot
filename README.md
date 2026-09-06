# Clearwater Discord Bot

Discord bot for Clearwater Roleplay — moderation, voice tools, ER:LC sync, Roblox group join requests, and the Discord Internet Panel.

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Add optional keys (`ERLC_SERVER_KEY`, Roblox group keys, etc.) as needed.
4. Run `npm install` and `npm start`.

### Apollopanel / Pterodactyl (important)

**Do not delete all files and re-upload a zip.** That wipes host-only data:

- `data/clearwater-internet.json` (Internet panel users/posts/wallets)
- `data/department-salaries.json`
- `data/identity-cache.json`
- `data/owner-config.json`
- `.env` (token and secrets)

Those files live only on the bot host. They are gitignored on purpose so updates do not overwrite them.

#### Safe update (what “just Restart” used to do)

1. Set the panel **Startup Command** to:

```bash
bash start.sh
```

2. Click **Restart** (or Stop → Start).

`start.sh` will:

- pull latest code from `origin/main`
- leave `data/` and `.env` alone
- run `npm install`
- start the bot

#### One-time fix if the panel is stuck on old code

Stop the server, then paste in the console:

```bash
cd /home/container
rm -rf downloads
git fetch origin main
git reset --hard origin/main
# Do NOT run: git clean -fdx
# Do NOT delete the data/ folder or .env
```

Then Restart with `bash start.sh` as the startup command.

Required gateway intents: **Guilds**, **Server Members**, **Server Messages**, **Message Content**, and **Guild Voice States**. Enable Server Members and Message Content in the Discord Developer Portal. Never commit or share `.env`.

## Layout

- `index.js` — bot entry point
- `start.sh` — host startup (code sync + bot; preserves `data/` + `.env`)
- `commands/` — slash commands
- `prefixCommands/` — prefix commands (e.g. `-holdvc`, `-vc`)
- `events/` — Discord event handlers
- `utils/` — loaders, VC, Internet panel, ER:LC, Roblox group sync
- `data/` — host-local runtime state (gitignored) plus committed `site-updates.json` / `manual-identities.json`

## Notable features

- **Hold VC** (`-holdvc` / `-unholdvc`) — Ownership-only voice hold; action logs go to channel `1514547037537046688`
- **Secondary server gate** — server `1514189396184793169` kicks members without one of the allowed main-server roles (`1053768758772109394`, `1514421440890409060`, `1514744040778760252`, `1536839307766267944`)
- **Discord Internet Panel** — social feed inside Discord (`INTERNET_PANEL_CHANNEL_ID`)
- **ER:LC role sync** — in-game Discord role while players are on the server
- **Roblox group join requests** — accept/decline using Melonly-verified identity cache
- **Frequency Change greeting** — first joiner in any “Frequency Change” VC hears the 10-minute rule TTS
