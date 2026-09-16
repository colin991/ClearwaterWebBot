# In-game voice checks

Main-server role `1514033074948800683` bypasses VC checks (linked Roblox ID or name match). Roblox usernames `Coleddev13` and `notj3dah` also bypass these checks, with exact case-insensitive matching. Exempt players receive no reminders or new VC-check jails; previously tracked VC-check jails are released. The role also permits entry through the secondary-server gate; the username exemptions apply only to VC checks.

Use `/vc checks state:on` or `/vc checks state:off` in the configured Clearwater Discord server. Administrator permission is required both in the command registration and at execution. Checks start **on** at every bot startup, even if previously disabled.

The service checks the ER:LC player list and Discord members every 15 seconds after the previous pass finishes. It matches a linked Roblox identity, or the Roblox username (ignoring case, underscores vs spaces) within Discord nicknames, display names, global names, or usernames. Any matching non-bot member in any voice channel in that Discord server satisfies the check.

- A matching member outside voice receives alternating VC reminders, starting immediately and then at least one minute apart. After five minutes outside voice, the player is jailed.
- A player with no matching Discord member is jailed immediately, PMed in-game with the jail reason, and then receives the three comms reminders in rotation, at least one minute apart.
- After five minutes outside voice, the player is jailed and immediately PMed in-game that they were jailed for not being in VC.
- When a matching member appears, messages switch to the VC reminders. An already applied jail stays until the player joins voice.
- Joining voice releases jails applied by this feature. Already compliant players receive no commands. Leaving voice starts a fresh five-minute grace period.
- Turning checks off releases tracked jails and stops enforcement. Failed releases retry automatically.

The service uses `DISCORD_GUILD_ID` and `ERLC_SERVER_KEY`. Full Discord member fetches are shared and limited to **one request every 20 seconds**; VC checks, `-dc`, Sheriff balance, and other features reuse that cache. If Discord is rate-limiting, the last roster is used instead of failing `-dc`. The existing Guild Members and Guild Voice States intents are required. All ER:LC snapshots and commands share one queue with a five-second minimum gap, so busy servers or API throttling can delay reminders, jail, and release beyond their target times.

Jail, unjail, in-game PMs, `/vc checks` toggles, and `-dc` summaries are posted to channel `1514547037537046688` in the same `[VcCheck]` / `[DcCheck]` proximity-log style as hold/say logs. Discord log failures do not delay or repeat enforcement.

Runtime ownership and timers are saved in `data/vc-checks.json`, which is ignored by Git. Checks do not intentionally release jails they did not apply. The API does not provide jail ownership, so simultaneous manual moderation can overlap with automation. Keep this runtime file when updating the bot.
