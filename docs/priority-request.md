# Priority requests

`/request-priority` in the Clearwater Discord server opens a searchable form:

1. **Search users** — type in the dropdown to filter, then pick one in-game player. Discord only shows search on a single choice, so extra names go in **Additional users or vehicles**.
2. **Search vehicles** — type in that dropdown to filter by owner or vehicle. Discord only shows search on a required single choice, so pick **None** if you have no car. A second vehicle can be typed in the additional field.
3. Fill in **Background** and **Priority Details** on the same form.

If a request is already **pending** or **active**, a new one cannot be submitted.

Staff review is posted to channel `1514341436139770017`. Staff (Clearwater staff ranks or Discord Administrator) can **Approve** or **Deny**. Unanswered pending requests are **auto-denied after 25 minutes**.

On approve:

- The requester is DMed the started card, including **Request Added Time**.
- The bot runs `:prty 1800` (30 minutes).
- The staff message switches to **Active**, with **Void** available.

**Void** (or a natural timer end, or **everyone listed on the request dying in-game**) runs `:prty 0` then `:pt 600` (10 minute peace timer). All listed deaths end it immediately — there is no 3 minute wait. Void also DMs the requester that staff voided it.

**Request Added Time** asks for 1–30 extra minutes, posts to the same staff channel, and pings role `1515107822432419971`. If staff approve, the bot runs `:prty` with remaining time plus the extra minutes.

Runtime state is `data/priority-request.json` (Git-ignored). Preserve it across bot updates. Restart the bot after deploying this feature so slash commands register.
