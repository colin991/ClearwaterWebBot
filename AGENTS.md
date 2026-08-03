# Clearwater Website Workflow

## Website source

- The deployed website source is `index.html`, `styles.css`, and `script.js` in the repository root.
- Keep the site responsive, accessible, and usable without a build step unless the user requests a framework migration.
- Do not edit or commit `Clearwater-Homepage.zip` or the duplicate `Clearwater-Homepage/` folder.

## Verification

- Run `node --check script.js` after JavaScript changes.
- Confirm that every local stylesheet and script referenced by `index.html` exists.
- Inspect the final diff and ensure no credentials, tokens, `.env` files, or unrelated files are staged.

## Automatic publishing

- After completing and verifying each requested website change, stage only the intended project files.
- Create a concise, descriptive Git commit and push the current branch to `origin` automatically.
- The `main` branch is the production branch and is deployed automatically by Vercel.
- Never force-push, rewrite published history, bypass failed checks, or commit secrets. Stop and ask the user before any destructive or history-changing Git action.
