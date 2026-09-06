# Clearwater Discord Bot

Discord bot for Clearwater Roleplay — moderation, voice tools, ER:LC sync, Roblox group join requests, and the Discord Internet Panel.

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Add optional keys (`ERLC_SERVER_KEY`, Roblox group keys, etc.) as needed.
4. Run `npm install` and `npm start`.

### Apollopanel / Pterodactyl (important)

Your panel may lock the startup command to something like:

```bash
if [[ -d .git ]]; then git pull; fi; ...; node /home/container/index.js
```

**You do not need to change that.** On boot, `index.js` force-syncs code from `origin/main` and keeps host-only `data/` + `.env`.

**Do not delete all files and re-upload a zip.** That wipes host-only data:

- `data/clearwater-internet.json` (Internet panel users/posts/wallets)
- `data/department-salaries.json`
- `data/identity-cache.json`
- `data/owner-config.json`
- `.env` (token and secrets)

#### Safe update

Just click **Restart**.

What happens:

1. Panel runs its locked `git pull` (may fail if `downloads/` is dirty — that’s OK)
2. Panel starts `node index.js`
3. Bot removes `downloads/`, resets tracked files to `origin/main`, keeps `data/` + `.env`
4. If code changed, it restarts itself onto the new commit

#### One-time fix if the host is still stuck on old code

Stop the server, paste this in the console **once**, then Start:

```bash
cd /home/container
rm -rf downloads
git fetch origin main
git reset --hard origin/main
# Do NOT run: git clean -fdx
# Do NOT delete data/ or .env
```

After that, normal **Restart** is enough (no startup-command change required).

Required gateway intents: **Guilds**, **Server Members**, **Server Messages**, **Message Content**, and **Guild Voice States**. Enable Server Members and Message Content in the Discord Developer Portal. Never commit or share `.env`.

## Layout

- `index.js` — bot entry point (includes host code sync for locked panel startups)
- `utils/hostCodeSync.js` — force-sync to `origin/main` without wiping `data/` / `.env`
- `start.sh` — optional helper only if your panel *can* change the startup command
- `commands/` — slash commands
- `prefixCommands/` — prefix commands (e.g. `-holdvc`, `-vc`)
- `events/` — Discord event handlers
- `utils/` — loaders, VC, Internet panel, ER:LC, Roblox group sync
- `data/` — host-local runtime state (gitignored) plus committed `site-updates.json` / `manual-identities.json`

## Notable features

- **Hold VC** (`-holdvc` / `-unholdvc`) — Ownership-only voice hold; action logs go to channel `1514547037537046688`
- **Secondary server gate** — server `1514189396184793169` kicks members without one of the allowed main-server roles
- **Discord Internet Panel** — social feed inside Discord (`INTERNET_PANEL_CHANNEL_ID`)
- **ER:LC role sync** — in-game Discord role while players are on the server
- **Roblox group join requests** — accept/decline using Melonly-verified identity cache
- **Frequency Change greeting** — first joiner in any “Frequency Change” VC hears the 10-minute rule TTS
