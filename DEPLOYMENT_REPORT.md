# UtilityFlow — Deployment Readiness Report

> Generated from sandbox testing on May 29, 2026

---

## Project Overview

| Field | Value |
|-------|-------|
| **App Name** | UtilityFlow |
| **Version** | 1.6.0 |
| **Package** | `com.app.utilitybillingapp` |
| **Framework** | Expo 54 + React Native 0.81.5 |
| **Backend** | Express + tRPC + Drizzle ORM |
| **Database** | MySQL 8.0+ (via `mysql2`) |
| **Build System** | EAS Build (Expo Application Services) |
| **Target** | Native Android APK |

---

## Sandbox Test Results

| Check | Status | Notes |
|-------|--------|-------|
| `pnpm install --frozen-lockfile` | PASS | 1200 packages installed in 8.8s |
| `pnpm check` (TypeScript) | PASS | Zero type errors |
| `pnpm test` (Vitest) | PASS | 79 tests across 9 files, all passing |
| `pnpm verify:tests` | PASS | Snapshot matches (79 tests, 9 files) |
| `pnpm build` (server bundle) | PASS | 94.8kb bundle in 8ms |
| `expo export --platform android` | PASS | JS bundle compiled (3.08 MB), 1598 modules |
| `pnpm check:env` | EXPECTED FAIL | Missing `JWT_SECRET` — requires operator secrets |

**Conclusion: The codebase is healthy and ready for deployment.** The only blockers are operator-provided secrets and credentials.

---

## What's Needed From You to Deploy

### Required Secrets (you must provide these)

| Secret | How to Get It |
|--------|---------------|
| **`EXPO_TOKEN`** | Go to https://expo.dev/settings/access-tokens → Create a new token |
| **`DATABASE_URL`** | MySQL 8.0+ connection string (e.g., from PlanetScale, Railway, Supabase MySQL, or self-hosted) |
| **`JWT_SECRET`** | Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| **`EXPO_PUBLIC_API_URL`** | The public HTTPS URL where your server will be hosted (e.g., `https://api.utilityflow.app`) |
| **Keystore choice** | `A` = new EAS-managed (first deploy), `B` = reuse existing, `C` = bring your own `.jks` |

### Deployment Steps (in order)

```
1. Set up your MySQL database (PlanetScale, Railway, or self-hosted)
2. Deploy the tRPC server (Render, Railway, Sevalla, or any Node.js host)
3. Configure environment variables on your server host
4. Run database migrations: pnpm db:push
5. Seed admin account: pnpm seed:admin
6. Run pre-deploy audit: pnpm verify:deploy
7. Build APK via EAS:
   EAS_NO_VCS=1 npx eas-cli build --platform android --profile production --non-interactive --no-wait
8. Distribute the APK
```

---

## Recommended Deployment Stack (with Supabase)

Since you want to use Supabase instead of Firebase, here's the adapted stack:

| Component | Tool | Notes |
|-----------|------|-------|
| **Database** | Supabase PostgreSQL | NOTE: This project currently uses MySQL via `mysql2` + Drizzle. Switching to Supabase PostgreSQL requires a migration (see below) |
| **OR Database** | PlanetScale / Railway MySQL | Zero code changes needed — just provide a `DATABASE_URL` |
| **Server Hosting** | Render / Railway / Sevalla | Deploy the Express/tRPC server |
| **APK Build** | EAS Build (Expo) | Cloud-based Android builds |
| **Push Notifications** | OneSignal or FCM | Not built into Supabase |
| **Crash Reporting** | Sentry | Optional |
| **Analytics** | PostHog | Optional |
| **File Storage** | Supabase Storage | For receipts, meter photos |
| **Auth** | Built-in (email/password) | Already implemented in the app — no external auth needed |

### Important: Database Compatibility Note

Your project uses **MySQL** (`mysql2` driver + Drizzle ORM). If you want to use **Supabase** as your database, you have two options:

| Option | Effort | Recommendation |
|--------|--------|----------------|
| **A. Keep MySQL** (PlanetScale/Railway/self-hosted) + use Supabase only for Storage/Realtime | Low — no code changes | RECOMMENDED for fastest deploy |
| **B. Migrate to PostgreSQL** (Supabase) | Medium — swap `mysql2` → `pg`, update Drizzle schema dialect, test all queries | Only if you want full Supabase ecosystem |

---

## Server Deployment Options

Your tRPC backend server needs a Node.js host. Here are the best options:

### Option 1: Render (Recommended for simplicity)

```yaml
# render.yaml
services:
  - type: web
    name: utilityflow-api
    runtime: node
    buildCommand: pnpm install --frozen-lockfile && pnpm build
    startCommand: pnpm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: NODE_ENV
        value: production
```

### Option 2: Railway

```bash
# Deploy directly from GitHub
railway login
railway init
railway link
railway up
```

### Option 3: Sevalla

Deploy via their dashboard — connect your GitHub repo, set environment variables, and deploy.

---

## EAS Build Command (Final APK)

Once your server is live and all secrets are configured:

```bash
# Login to Expo
EXPO_TOKEN=your_token npx eas-cli login

# Build production APK
EAS_NO_VCS=1 npx eas-cli build \
  --platform android \
  --profile production \
  --non-interactive \
  --no-wait
```

The `--no-wait` flag is important — EAS builds take 10-20 minutes and run in the cloud. You'll get a URL to download the APK when it's done.

---

## Distribution Channels for the APK

Once built, distribute via:

| Channel | How |
|---------|-----|
| **Direct link** | Upload APK to your server/S3/Supabase Storage and share the URL |
| **Google Play Internal Testing** | Upload via Play Console for controlled rollout |
| **In-app updates** | After first install, use admin panel → Settings → App updates |

---

## Quick Start Checklist

```
[ ] Create Expo account at https://expo.dev
[ ] Generate EXPO_TOKEN
[ ] Set up MySQL database (PlanetScale free tier or Railway)
[ ] Deploy server to Render/Railway/Sevalla
[ ] Set environment variables on server
[ ] Run: pnpm db:push
[ ] Run: pnpm seed:admin
[ ] Run: pnpm verify:deploy (must show 0 failures)
[ ] Run: EAS_NO_VCS=1 npx eas-cli build --platform android --profile production --non-interactive --no-wait
[ ] Download APK from EAS dashboard
[ ] Distribute to users
```

---

## What I Verified in the Sandbox

I was able to confirm the following without any issues:

1. **Code compiles cleanly** — zero TypeScript errors
2. **All 79 tests pass** — no regressions
3. **Server bundle builds** — Express/tRPC server compiles to production bundle
4. **Android JS bundle exports** — Metro bundler successfully creates the Android JavaScript bundle (1598 modules)
5. **Dependencies are locked** — `pnpm-lock.yaml` is consistent, no resolution issues
6. **EAS configuration is valid** — `eas.json` has correct production profile with JDK 21

### What I Could NOT Do (requires your credentials)

- Run `eas build` (needs your `EXPO_TOKEN`)
- Connect to a database (needs your `DATABASE_URL`)
- Deploy the server (needs your hosting account)
- Sign the APK (needs keystore — managed by EAS on first build)
