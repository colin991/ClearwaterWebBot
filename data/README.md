# Bot data

This folder holds bot runtime files on the **bot host**.

## Committed (safe to ship in git)

- `site-updates.json` — catalog of bot updates
- `manual-identities.json` — Discord ↔ Roblox links that always merge into the identity cache
- `README.md` — this file

## Host-only (gitignored — never delete when updating)

- `police-cars.json` — last Police car whitelist PMs
- `vehicle-presets.json` — last in-game PMs for emergency vehicles that are not on a server-saved preset
- `leo-briefing.json` — active server-wide LEO briefing and which map layouts are loaded
- `priority-request.json` — active/pending priority request, timer, recorded in-game deaths, and civilian kill warnings
- `owner-config.json` — Discord sync settings
- `department-salaries.json` — weekly department salary config and payout receipts
- `clearwater-internet.json` — Clearwater Internet users, posts, wallets, messages
- `clearwater-internet.json.bak` / `.bak.1` — rotating backups before each save
- `identity-cache.json` — Melonly identity cache (may be encrypted)
- `circle-moderation.json` — moderation store
- other `data/*.json` created by the live bot

**Updating the bot:** click Restart with `bash start.sh`. Do **not** delete all files and re-upload a zip — that wipes this host-only data.

If a live file is wiped or corrupt, restore from `.bak` / `.bak.1` on the host before restarting.

Do not store tokens, passwords, or private credentials here.
