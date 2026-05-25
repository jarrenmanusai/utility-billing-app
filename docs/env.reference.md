# Environment variable reference

> **Do not commit a populated `.env`.** In Manus webdev, register secrets via the **Settings → Secrets** panel (or `webdev_request_secrets` from a Manus session). Locally, copy the keys below into a new `.env` you create yourself; this repo does not ship a sample because the platform manages env vars centrally.

## Required

| Key | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | MySQL 8 connection string. Include `?ssl=true` for managed providers (PlanetScale, RDS, etc.). | `mysql://user:pass@host:3306/utilitybill?ssl=true` |
| `JWT_SECRET` | 64-byte random hex. Used by both session JWT (`server/auth.ts`) and CAPTCHA HMAC (`lib/captcha.ts`). | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `EXPO_PUBLIC_API_URL` | Public HTTPS URL of the deployed tRPC server. Baked into the APK at build time — change requires a rebuild. | `https://utilitybill-gfmmgjuu.manus.space` |

## Optional / runtime defaults

| Key | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` for prod deploys. |
| `PORT` | `3000` | tRPC server port. |
| `EXPO_PORT` | `8081` | Metro bundler port. |
| `BUILT_IN_FORGE_API_URL` | (unset) | Auto-populated on Manus webdev. Leave unset locally. |
| `BUILT_IN_FORGE_API_KEY` | (unset) | Auto-populated on Manus webdev. Leave unset locally. |

## MUST be unset in production

| Key | Why |
|---|---|
| `OAUTH_SERVER_URL` | Re-enables Manus OAuth. The locked release is email+password only. |
| `OWNER_OPEN_ID` | Same — only used by OAuth fallback. |

If either of these is set, the verify script (`pnpm verify:deploy`) refuses to declare the deploy ready.

## Seed-script overrides

These are read only by `pnpm seed:admin` and are optional.

| Key | Default | Notes |
|---|---|---|
| `ADMIN_EMAIL` | `jarren.manusai@outlook.com` | The bootstrap admin. Operator should rotate after first sign-in. |
| `ADMIN_PASSWORD` | `030921manusai!@!` | Bootstrap-only; rotate immediately. |
| `ADMIN_NAME` | `Jarren (Admin)` | Display name on the admin dashboard. |
| `ADMIN_PHONE` | `+639000000000` | Placeholder; admin can change later. |
| `ALLOW_PROD_SEED` | (unset) | Required (`=1`) to run `seed:admin` while `NODE_ENV=production`. |

## Where to put them

| Environment | How |
|---|---|
| Manus webdev (preferred) | **Settings → Secrets** in the project UI, or call `webdev_request_secrets` from a Manus session. |
| Local dev | Create a `.env` in the project root yourself (it's already gitignored). |
| EAS Build | `eas secret:create --scope project --name KEY --value VALUE` for each. |
