# Zwicky launch path (nothing here is deployed yet)

## What goes where
- Public site (existing, untouched): repo root pages.
- Member app: `app/` (static) at `/app/`.
- API + cron: `worker/src/index.js` (Cloudflare Worker), data in Neon.

## One-time steps (need the user's OK: "انشر")
1. Database: `psql "$DATABASE_URL" -f worker/schema.sql` (empty Neon DB, creates tables and the 5 default stages).
2. First admin: `ADMIN_NAME=... ADMIN_EMAIL=... ADMIN_PASSWORD_FILE=... node worker/scripts/create-admin.mjs`. The password is generated into the user's vault; he changes it at first login.
3. Worker secrets (never in git): `wrangler secret put DATABASE_URL`, `wrangler secret put VAPID_PRIVATE_JWK`. Public VAPID key and subject are plain vars in `worker/wrangler.jsonc`.
4. Deploy: the Worker serves the static files (repo root, including `app/`) and `/api/*`, and runs the 15-minute reminder cron. Use `wrangler deploy` from `worker/`.
   - The existing site is a Worker named "zwicky" on abdullah-elmassry.workers.dev. Deploying with the same name replaces it with this combined Worker, which still serves the same pages. Confirm how it deploys today (Git integration or manual) before the first deploy, so the two do not fight.
5. Smoke test on the live URL: login, create a video, mark a task done, enable notifications on a phone (iPhone: add to Home Screen first).
6. Add the 12 people from the admin tab, send each their initial password privately (shown once).

## Rollback
Redeploy the previous Worker version from the Cloudflare dashboard (Deployments tab). The database is separate and unaffected.


## Deploy through Git (current setup)
- The live site is a Cloudflare Worker named `zwicky` with GitHub integration. A push to the production branch (main) redeploys.
- `wrangler.jsonc` and `package.json` are at the repo root. The root is the static site, `.assetsignore` keeps `worker/`, config and node_modules out of the public files. `/api/*` runs the Worker, everything else is served as static files.
- Needed once in Cloudflare (Workers & Pages > zwicky > Settings > Variables and Secrets): secrets `DATABASE_URL` (Neon) and `VAPID_PRIVATE_JWK`. Secrets survive redeploys. Without them the public site still works as static pages, but `/api` and the `/app/` login return errors.
- Database: `worker/schema.sql` (already applied to the Zwicky Neon database). First admin: `worker/scripts/create-user.mjs` with `IS_ADMIN=1`.
- Rollback: Cloudflare dashboard > zwicky > Deployments > roll back to the previous version, or revert the commit on main.
