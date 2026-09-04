# Bot data

This folder is reserved for non-secret bot data on the bot host.

- `owner-config.json` — Discord sync settings (host-local)
- `department-salaries.json` — weekly department salary configuration and payout receipts (host-local)
- `clearwater-internet.json` — Clearwater Internet users, posts, wallets, messages, and related state
- `clearwater-internet.json.bak` / `.bak.1` — rotating backups written before each save
- `site-updates.json` — tracked catalog of bot updates (committed to git; not posted to Discord)
- `site-updates-posted.json` — obsolete host-local file from when updates were Discord-posted (safe to delete)

If the live file is ever wiped or corrupt, restore from `.bak` or `.bak.1` on the host before restarting the bot.

Do not store tokens, passwords, or private credentials here.
