# Priority queue

An administrator in `DISCORD_GUILD_ID` runs `-prtyq` to post the supplied Components V2 panel to channel `1532549648042954922`. Clicking Join Queue requires role `1514109306700693616` or `1532549498696634408`, fetched fresh from Discord. The bot resolves the clicking user's Roblox ID from its existing identity cache or manual identity mappings; it never grants access based on a display-name guess.

The game must have a nonempty Queue. Missing player/staff/queue data fails closed. Already-present players, existing staff, and owners are not modified. Only one temporary grant runs at a time, and roles and queue are checked again when its command transaction starts.

The bot sends `:mod ROBLOX_ID`, checks for entry approximately once per second, and sends `:unmod ROBLOX_ID` on entry or after ten seconds from grant confirmation. The transaction reserves the shared command queue so ordinary bot commands do not build up ahead of its removal. ER:LC's minimum command spacing and network/API failures can still delay execution; ten seconds is a target, not an upstream guarantee.

Before granting, the bot writes `data/priority-queue-pending.json`. It clears that record only after a successful removal. Pending removals block new grants and retry on startup and every fifteen seconds. Preserve this ignored runtime file during host updates. No live role grants are performed by automated tests.

The panel uses the supplied Discord attachment URLs; Discord may expire those signed image links. If images become unavailable, replace them with refreshed attachment URLs.

Uses of Join Queue are logged to channel `1549178818814812211` (success and failure) with the Discord user and linked Roblox ID. Log delivery does not delay or block the in-game grant.
