# In-game voice checks

Use `/vc checks state:on` or `/vc checks state:off` in the configured Clearwater Discord server. Administrator permission is required both in the command registration and at execution. Checks start **on** at every bot startup, even if previously disabled.

The service checks the ER:LC player list and Discord members every 15 seconds after the previous pass finishes. It matches the Roblox username, ignoring case, within Discord nicknames, display names, global names, or usernames. Any matching non-bot member in any voice channel in that Discord server satisfies the check.

- A matching member outside voice receives alternating VC reminders, starting immediately and then at least one minute apart. After five minutes outside voice, the player is jailed.
- A player with no matching Discord member is jailed immediately and receives the three comms reminders in rotation, at least one minute apart.
- When a matching member appears, messages switch to the VC reminders. An already applied jail stays until the player joins voice.
- Joining voice releases jails applied by this feature. Already compliant players receive no commands. Leaving voice starts a fresh five-minute grace period.
- Turning checks off releases tracked jails and stops enforcement. Failed releases retry automatically.

The service uses `DISCORD_GUILD_ID` and `ERLC_SERVER_KEY`. Full member fetches must succeed before enforcement; lookup errors skip that pass. The existing Guild Members and Guild Voice States intents are required. The shared ER:LC command queue enforces a five-second minimum gap, so busy servers or API throttling can delay reminders, jail, and release beyond their target times.

Runtime ownership and timers are saved in `data/vc-checks.json`, which is ignored by Git. Checks do not intentionally release jails they did not apply. The API does not provide jail ownership, so simultaneous manual moderation can overlap with automation. Keep this runtime file when updating the bot.
