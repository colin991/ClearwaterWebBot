# Clearwater Website and Discord Bot

The public homepage and Discord bot for Clearwater Roleplay.

## Files

- `index.html` — page content and structure
- `styles.css` — responsive design and visual styling
- `script.js` — navigation and page interactions
- `index.js` — Discord bot entry point
- `commands/` — slash commands
- `events/` — Discord event handlers
- `utils/` — command loading and the protected website status connection

Updates pushed to the production branch are deployed automatically by Vercel.

## Bot setup

1. Copy `.env.example` to `.env` on the bot host.
2. Add the Discord bot token, application ID, and Clearwater server ID.
3. Create a long random `BOT_API_KEY` and keep it private.
4. Run `npm install`, then `npm start`.
5. In Vercel, set `BOT_API_URL` to the bot host's public HTTPS address and set `BOT_API_KEY` to the same private key.

The bot needs the **Guilds**, **Server Members**, **Server Messages**, and **Message Content** gateway intents. Enable Server Members and Message Content in the Discord Developer Portal. Never commit or share `.env`.

## Verification, ER:LC, and owner panel

- `-id @DiscordUser` looks up the member in Melonly, finds the Roblox ID stored with their application responses, and displays an Identity card.
- The ER:LC sync checks the live player list and adds/removes the configured in-game Discord role.
- `/owner.html` is restricted server-side to Discord user `1044686997194805280` or members with role `1514033074948800683` by default. It configures the main/staff servers, roles, log channels, prefix, and sync interval.
- Add `MELONLY_API_KEY` and `ERLC_SERVER_KEY` to the bot host. Do not add either secret to browser code or GitHub.

The website-to-bot bridge accepts only explicitly allowlisted actions. The included test button sends a protected `ping` action after Discord sign-in; add future actions on both sides of the bridge rather than accepting arbitrary commands.
