# Clearwater Discord Bot

PCSO support tickets on Discord. The bot logs in, keeps slash commands cleared, and handles ticket panel buttons plus `-cr`.

Ticket channels are visible only to the opener, the bot, and the matching staff role:

- General Support `1514361384576618627` — General Support tickets
- IA `1514851283817725962` — Office of Professional Compliance tickets
- Command Staff `1514361105244356639` — Office of the Sheriff tickets

## Setup

1. Copy `.env.example` to `.env` on the bot host.
2. Set `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `DISCORD_GUILD_ID`.
3. Optional: `MELONLY_API_KEY` (ticket account info) and `COOKIE_API_KEY` (transcripts).
4. Run `npm install` and `npm start`.

On Spark/Apollo, keep the locked startup command. Restart the host after pushing to `main`. A restart rewrites view permissions on every open ticket.
