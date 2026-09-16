# Priority requests

`/request-priority` in the Clearwater Discord server opens an ephemeral form:

1. Select up to **4 in-game players**.
2. Select up to **2 vehicles** whose owners are currently on the **Civilian** team.
3. Continue into **Background** and **Priority Details**.

If a request is already **pending** or **active**, a new one cannot be submitted.

Staff review is posted to channel `1514341436139770017`. Staff (Clearwater staff ranks or Discord Administrator) can **Approve** or **Deny**. Unanswered pending requests are **auto-denied after 25 minutes**.

On approve:

- The requester is DMed the started card, including **Request Added Time**.
- The bot runs `:prty 1800` (30 minutes).
- The staff message switches to **Active**, with **Void** available.

**Void** (or a natural timer end, or the requester dying in-game **after 3 minutes**) runs `:prty 0` then `:pt 600` (10 minute peace timer). Void also DMs the requester that staff voided it.

**Request Added Time** asks for 1–30 extra minutes, posts to the same staff channel, and pings role `1515107822432419971`. If staff approve, the bot runs `:prty` with remaining time plus the extra minutes.

Runtime state is `data/priority-request.json` (Git-ignored). Preserve it across bot updates. Restart the bot after deploying this feature so slash commands register.
