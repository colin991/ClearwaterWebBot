# Priority requests

`/request-priority` in the Clearwater Discord server opens a searchable form:

1. **Search users** — type in the dropdown to filter, then pick one in-game player. Discord only shows search on a single choice, so extra names go in **Additional users or vehicles**.
2. **Search vehicles** — type in that dropdown to filter by owner or vehicle. Discord only shows search on a required single choice, so pick **None** if you have no car. A second vehicle can be typed in the additional field.
3. Fill in **Background** and **Priority Details** on the same form.

If a request is already **pending** or **active**, a new one cannot be submitted.

New requests post to channel `1514341436139770017` and ping role `1515107822432419971`. **Anyone** can **Approve** or **Deny**. Unanswered pending requests are **auto-denied after 25 minutes**. Void stays staff-only.

On approve:

- The clicked request card updates immediately (Active). In-game `:prty` / `:m` and voice announce keep running in the background so the buttons do not sit on the ER:LC 5-second command queue.
- The requester is DMed the started card, including **Request Added Time**.
- The bot runs `:prty 1800` (30 minutes).
- The bot runs `:m` telling the server a new priority started and not to start any major roleplays.
- The bot joins voice channel `1514128904783139018`, plays a short chime, then slowly speaks who started it and the priority details.

**Void** (or a natural timer end, or **everyone listed on the request dying in-game**) runs `:prty 0` then `:pt 600` (10 minute peace timer). The original request card is rewritten immediately to **Priority Request — Ended** / **Voided** (Void/Started removed). All listed deaths end it immediately — there is no 3 minute wait. Void also DMs the requester that staff voided it.

**Request Added Time** asks for 1–30 extra minutes, posts to the same staff channel, and pings role `1515107822432419971`. Clearwater staff **or** that role can approve or deny extra time. Approve runs `:prty` with remaining time plus the extra minutes and updates that extra-time card.

Runtime state is `data/priority-request.json` (Git-ignored), with a `.bak` copy. Preserve it across bot updates. A restart reloads a pending or active priority, including who already died, so the timer and “everyone died” end still work. Restart the bot after deploying this feature so slash commands register.
