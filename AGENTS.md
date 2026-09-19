# Discord bot workflow

## Source

- This repository hosts a Discord bot being rebuilt. Entry point: `index.js` → `bot.js`.
- Live bot features are PCSO support tickets (panel buttons, claim/close, `-cr`) only.
- The PCSO website files may still live in this repo for Vercel; do not treat leftover `utils/` as live bot features unless `bot.js` or ticket events import them.

## Verification

- After JavaScript changes, run `node --check` on edited files or `npm run check`.
- Inspect the final diff and ensure no credentials, tokens, `.env` files, or unrelated files are staged.

## Publishing

- After completing and verifying each requested bot change, stage only the intended project files.
- Create a concise, descriptive Git commit and push the current branch to `origin` automatically.
- Never force-push, rewrite published history, bypass failed checks, or commit secrets. Stop and ask the user before any destructive or history-changing Git action.

## Update catalog

- Every completed user-facing update must be appended to `data/site-updates.json` before the final commit.
- Each entry needs a unique `id`, short `title`, plain-language `summary`, ISO `createdAt`, `updatedBy` (the requester’s **GitHub/git username**, e.g. `colin991` — not a full legal name and not “Cursor Agent”), and optional short `commit` hash.
- Updates are **not** posted to a Discord channel.
