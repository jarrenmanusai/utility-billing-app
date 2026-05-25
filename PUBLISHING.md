# UtilityFlow — Publishing Guide

> **This file is intentionally short.** The complete, authoritative deploy
> recipe lives in [`MANUS_HANDOFF.txt`](./MANUS_HANDOFF.txt) and the operator
> checklist lives in [`DEPLOY_PREREQUISITES.md`](./DEPLOY_PREREQUISITES.md).
> Read those two first; this file only summarises the path.

## TL;DR

UtilityFlow ships as a **native Android APK** (no web app) signed for the
operator's distribution channel of choice. The deploy contract is locked
to the values in `MANUS_HANDOFF.txt` §3 and enforced by `pnpm verify:deploy`.

| Step | What it does | Where |
|---|---|---|
| 1. Provide secrets | DATABASE_URL, JWT_SECRET, EXPO_PUBLIC_API_URL, EXPO_TOKEN, keystore choice | `DEPLOY_PREREQUISITES.md` |
| 2. Sync code | Always check out the **latest git tag** (or `main` HEAD if no tags exist) | `MANUS_HANDOFF.txt` §1 |
| 3. Rebuild DB | `DROP` → `CREATE` → run all `drizzle/*.sql` migrations in order | `MANUS_HANDOFF.txt` §5 |
| 4. Seed admin | `pnpm seed:admin` — creates exactly one admin row | `MANUS_HANDOFF.txt` §6 |
| 5. Audit | `pnpm verify:deploy` — must report 0 failures | `scripts/verify-deploy.ts` |
| 6. Publish server | Deploy the Node tRPC server to `*.manus.space` (or your own host) | `MANUS_HANDOFF.txt` §7 |
| 7. Build APK | `eas build --platform android --profile production` (JDK 21 image, pre-pinned in `eas.json`) | `MANUS_HANDOFF.txt` §7 |
| 8. Distribute first APK | Direct link / Play Console / etc. | `DEPLOY_PREREQUISITES.md` §6 |
| 9. Future updates | Sign in as admin → Settings → App updates → upload signed APK | `MANUS_HANDOFF.txt` §7 |

## Hard rules

1. **Native Android only** — do **not** publish the web bundle as the
   product.
2. **Email + password only** — Manus OAuth is disabled. `OAUTH_SERVER_URL`
   and `OWNER_OPEN_ID` MUST be unset. The server only mounts
   `/api/oauth/*` routes when those vars are present, so probing them on
   a production deploy returns 404.
3. **JDK 21** — Android builds use the
   `ubuntu-22.04-jdk-21-ndk-r27b` EAS image. Do not downgrade to JDK 17
   or upgrade to JDK 22+.
4. **APK, not AAB** — the `production` profile in `eas.json` is set to
   `buildType: "apk"`. Use the separate `production-aab` profile only if
   the operator specifically asks for a Play Store bundle.
5. **Same keystore for every release** — installing a new APK signed
   with a different keystore breaks update for every existing user
   (`App not installed`).

## Versioning

Three files MUST agree (`pnpm verify:deploy` enforces this):

| File | Field | What reads it |
|---|---|---|
| `constants/app-version.ts` | `APP_VERSION` | In-app About screen, update banner |
| `app.config.ts` | `version` | Expo metadata bundled into the APK |
| `package.json` | `version` | Manus Publish Mobile App card, EAS Build versionName |

Bump all three in lock-step on every release.

## Quick reference

| Action | Command |
|---|---|
| Run dev server | `pnpm dev` |
| Type-check | `pnpm check` |
| Lint | `pnpm lint` |
| Tests | `pnpm test` |
| Apply DB migrations (fresh DB) | `pnpm db:push` |
| Seed exactly one admin | `pnpm seed:admin` |
| Pre-deploy audit | `pnpm verify:deploy` |
| Probe deployed server | `curl https://<your-domain>/api/version` |
| Build APK | `npx eas-cli build --platform android --profile production` |

## Env vars at a glance

Documented canonical names (see `docs/env.reference.md`):

- `DATABASE_URL` (required)
- `JWT_SECRET` (required, 64-byte random hex)
- `EXPO_PUBLIC_API_URL` (required for production build) — public HTTPS
  base URL of the deployed tRPC server. The `EXPO_PUBLIC_API_BASE_URL`
  alias is accepted for backward compatibility; if both are set they
  must match.
- `OAUTH_SERVER_URL` and `OWNER_OPEN_ID` — **must remain unset** in
  production.

For everything else (keystore options, Play Console submission, in-app
updater details), read `MANUS_HANDOFF.txt` and `DEPLOY_PREREQUISITES.md`.
