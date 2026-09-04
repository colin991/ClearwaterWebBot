# Discord bot workflow

## Source

- This repository is the **Clearwater Discord bot only** (no website / Vercel deploy).
- Entry point: `index.js`. Slash commands live in `commands/`, prefix commands in `prefixCommands/`, events in `events/`.

## Verification

- After JavaScript changes, run `node --check` on edited files or `npm run check`.
- Inspect the final diff and ensure no credentials, tokens, `.env` files, or unrelated files are staged.

## Publishing

- After completing and verifying each requested bot change, stage only the intended project files.
- Create a concise, descriptive Git commit and push the current branch to `origin` automatically.
- Never force-push, rewrite published history, bypass failed checks, or commit secrets. Stop and ask the user before any destructive or history-changing Git action.

## Discord update log

- Every completed user-facing update must be appended to `data/site-updates.json` before the final commit.
- Each entry needs a unique `id`, short `title`, plain-language `summary`, ISO `createdAt`, `updatedBy` (the requester’s **GitHub/git username**, e.g. `colin991` — not a full legal name and not “Cursor Agent”), and optional short `commit` hash.
- The Discord bot posts new entries to channel `1538007463851200583` on startup.
- Do not edit `data/site-updates-posted.json`; that file is host-local so already-posted updates are not repeated.
