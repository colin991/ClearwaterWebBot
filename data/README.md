# Bot data

This folder is reserved for non-secret bot data on the Sparked bot host.

- `clearwater-internet.json` — Clearwater Internet users, posts, wallets, messages, and related state
- `clearwater-internet.json.bak` / `.bak.1` — rotating backups written before each save

If the live file is ever wiped or corrupt, restore from `.bak` or `.bak.1` on the host before restarting the bot.

Do not store tokens, passwords, or private credentials here.
