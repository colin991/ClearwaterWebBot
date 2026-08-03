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

The bot needs only the standard **Guilds** gateway intent. Never commit or share `.env`.
