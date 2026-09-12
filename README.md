# Clearwater Discord Bot

Discord bot for Clearwater Roleplay — moderation, voice tools, ER:LC sync, Roblox group join requests, and the Discord Internet Panel.

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Add optional keys (`ERLC_SERVER_KEY`, Roblox group keys, etc.) as needed.
4. Run `npm install` and `npm start`.

### Spark Hosting / Apollo panel (important)

Your startup command is **locked and should stay locked**, for example:

```bash
if [[ -d .git ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then npm install ${NODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then npm install --production; fi; node /home/container/index.js
```

Do **not** change it. Panel `git pull` often fails on a dirty tree and is ignored; that is OK.  
`node index.js` runs next and force-syncs from `origin/main` while keeping host-only `data/` + `.env`.

Because this GitHub repo is **private**, the bot keeps Apollo’s existing git remote/token. It will not replace it with a public URL.

**Do not delete all files and re-upload a zip.** That wipes host-only data:

- `data/clearwater-internet.json` (Internet panel users/posts/wallets)
- `data/department-salaries.json`
- `data/identity-cache.json`
- `data/owner-config.json`
- `.env` (token and secrets)

#### Safe update

Just click **Restart**.

In the console you should see lines like:

```text
[host-sync] Using existing origin https://***@github.com/...
[host-sync] Updated abc1234 -> def5678
```

or:

```text
[host-sync] Already on latest (def5678)
```

#### One-time fix if you see `No .git folder`

The console line `[host-sync] No .git` means this server was installed from a **zip**, not GitHub. The locked `git pull` never runs, and the bot cannot update until `.git` exists.

**Keep the startup command unchanged.** Stop the server, open the Apollo **console**, and paste **one** of these.

**A) Zip host → real git checkout** (replace `ghp_YOUR_PAT` with a GitHub PAT that can read this private repo):

```bash
cd /home/container; echo "ENV=$([ -f .env ] && echo YES || echo NO) DATA=$([ -d data ] && echo YES || echo NO)"; rm -rf downloads tmp; git init -b main; git remote remove origin 2>/dev/null; git remote add origin "https://ghp_YOUR_PAT@github.com/colin991/ClearwaterWebBot.git"; git fetch origin main; git checkout -f -B main origin/main; git reset --hard origin/main; npm install --omit=dev; echo "GIT=$([ -d .git ] && echo YES)"; git log -1 --oneline; test -f .env && echo ENV_OK; test -d data && echo DATA_OK; echo DONE
```

**B) Already has `.git` but stuck on old code:**

```bash
cd /home/container; echo "PWD=$(pwd)"; echo "GIT=$([ -d .git ] && echo YES || echo NO)"; rm -rf downloads tmp; git remote -v | sed 's/\/\/[^@/]*@/\/\/***@/g'; echo "BEFORE=$(git log -1 --oneline 2>/dev/null || echo none)"; git fetch origin main; git reset --hard origin/main; echo "AFTER=$(git log -1 --oneline)"; ls utils/hostCodeSync.js index.js; npm install --omit=dev; echo DONE
```

**C) Optional env (after A works, or instead of pasting the PAT into console each time):** set Apollo variable `CLEARWATER_GIT_REMOTE` to `https://<PAT>@github.com/colin991/ClearwaterWebBot.git` (or set `GITHUB_TOKEN`). On boot, `index.js` can bootstrap/repair git while keeping `data/` + `.env`.

You should see `GIT=YES`, a recent commit hash, `ENV_OK`, `DATA_OK`, and `DONE`. Then **Start**. Watch for `[host-sync] Updated ...` or `Already on latest` (not only `[boot] starting bot...`).

After that works once, leave the locked startup as-is; normal **Restart** keeps the latest code.
Required gateway intents: **Guilds**, **Server Members**, **Server Messages**, **Direct Messages**, **Message Content**, and **Guild Voice States**. Enable Server Members, Message Content, and Direct Messages in the Discord Developer Portal. Never commit or share `.env`.

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
