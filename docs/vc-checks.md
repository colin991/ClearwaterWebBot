# In-game voice checks

Main-server role `1514033074948800683` bypasses VC checks (linked Roblox ID or name match). Roblox usernames `Coleddev13` and `notj3dah` also bypass these checks, with exact case-insensitive matching. Exempt players receive no reminders; previously tracked VC-check jails are released. The role also permits entry through the secondary-server gate; the username exemptions apply only to VC checks. The role also permits entry through the secondary-server gate; the username exemptions apply only to VC checks.

Use `/vc checks state:on` or `/vc checks state:off` in the configured Clearwater Discord server. Administrator permission is required both in the command registration and at execution. Checks start **off** at every bot startup, even if previously enabled.

`/vc whitelist` is Administrator-only (Discord Administrator permission, not just a role named admin). Discord hides it from members without that permission. Use `action:remove` to take them off, or `action:list` to see the list. Stored in `data/vc-whitelist.json` (Git-ignored). A whitelist match unjails any VC-check jail on the next pass. The hardcoded usernames and staff exemption role still apply.

The service checks the ER:LC player list and Discord members every 15 seconds after the previous pass finishes. It matches a linked Roblox identity, or the Roblox username (ignoring case, underscores vs spaces) within Discord nicknames, display names, global names, or usernames. Any matching non-bot member in any voice channel in that Discord server satisfies the check.

- A matching member outside voice gets VC reminder PMs, then is **jailed** after 5 minutes. They are **never** `:kick`'ed, `:load`'ed, or `:wanted`.
- A player whose Discord nickname **is** or **contains** their Roblox username counts as in Discord. They are not jailed as “missing.”
- A player with no matching Discord member is only PMed comms reminders (never jailed). A partial Discord cache is never treated as “not in Discord.”
- Joining voice or turning checks off **unjails** anyone this feature jailed. A failed unjail is retried on the next pass instead of being forgotten. Already compliant players receive no commands. Leaving voice starts a fresh reminder interval.
- Failed jails, failed unjails, and jail-notice PMs retry automatically.
- `-dc` and VC checks use the same voice lookup, including people found from live voice-state members, so someone listed as **In Discord — In VC** is not jailed for missing voice.

The service uses `DISCORD_GUILD_ID` and `ERLC_SERVER_KEY`. Full Discord member fetches are shared and limited to **one request every 20 seconds**; VC checks, `-dc`, Sheriff balance, and other features reuse that cache. If Discord is rate-limiting, the last roster is used instead of failing `-dc`. An incomplete roster is never treated as “not in Discord” (needs about 90% of the server cached). The existing Guild Members and Guild Voice States intents are required. Only in-game commands share the five-second PRC queue. Automatic `:load` and `:kick` are blocked unless a staff map/raw command explicitly allows them. VC checks may `:jail` when enabled.

Jail, unjail, in-game PMs, `/vc checks` toggles, `/vc whitelist` changes, and `-dc` summaries are posted to channel `1514547037537046688` in the same `[VcCheck]` / `[DcCheck]` proximity-log style as hold/say logs. Discord log failures do not delay or repeat enforcement.

Runtime ownership and timers are saved in `data/vc-checks.json`, which is ignored by Git. Checks do not intentionally release jails they did not apply. The API does not provide jail ownership, so simultaneous manual moderation can overlap with automation. Keep this runtime file when updating the bot.
