# UtilityFlow — Sevalla Deployment Guide

> This guide covers deploying the UtilityFlow tRPC backend server to **Sevalla** (application hosting + managed MySQL + Cloudflare R2 object storage) and building the Android APK via EAS Build.

---

## Architecture on Sevalla

```
┌──────────────────┐       ┌──────────────────────────────────────────────┐
│  Android APK     │       │              Sevalla Platform                 │
│  (React Native)  │       │                                              │
│                  │──────▶│  ┌────────────────┐    ┌─────────────────┐   │
│                  │ HTTPS │  │ Node.js App    │───▶│ MySQL 8.0       │   │
│                  │       │  │ (tRPC/Express) │    │ (Internal Net)  │   │
└──────────────────┘       │  └────────────────┘    └─────────────────┘   │
                           │         │                                     │
                           │         ▼                                     │
                           │  ┌────────────────┐                           │
                           │  │ Object Storage │                           │
                           │  │ (Cloudflare R2)│                           │
                           │  └────────────────┘                           │
                           └──────────────────────────────────────────────┘
```

All three services (app, database, object storage) run within Sevalla's infrastructure, connected via private internal network for minimal latency and maximum security.

---

## Prerequisites

| Item | Where to Get It |
|------|-----------------|
| Sevalla account | https://sevalla.com |
| OpenAI API key (for OCR) | https://platform.openai.com/api-keys |
| Expo account + token | https://expo.dev/settings/access-tokens |

---

## Step 1: Create a MySQL Database on Sevalla

1. Log in to [Sevalla Dashboard](https://sevalla.com)
2. Click **Databases → Add database**
3. Configure:

| Setting | Value |
|---------|-------|
| **Type** | MySQL |
| **Version** | 8.0 |
| **Database name** | `utilityflow` |
| **Location** | Choose the same region you'll use for the app |
| **Resources** | DB1 (starter) or higher based on needs |

4. Note the connection details (host, port, username, password) — you'll need them for the internal connection.

> **Important:** Create the database in the **same region** as your application to enable internal (private network) connections.

---

## Step 2: Create Object Storage Bucket on Sevalla

1. In Sevalla Dashboard → **Object Storage → Create bucket**
2. Configure:

| Setting | Value |
|---------|-------|
| **Bucket name** | `utilityflow-uploads` |
| **Region** | Same region as your app |

3. Create a storage user under the bucket with read/write permissions
4. Note the credentials:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL** (Cloudflare R2 endpoint)

---

## Step 3: Create the Application on Sevalla

1. Click **Applications → Add application**
2. Choose **Git repository** and connect your GitHub account
3. Select repository: `jarrenmanusai/utility-billing-app`
4. Configure:

| Setting | Value |
|---------|-------|
| **Branch** | `main` |
| **Location** | Same region as your database |
| **Resources** | H1 (Hobby) or higher |
| **Automatic deployment** | Enabled |

### Build Strategy

Sevalla supports three build strategies. Choose one:

**Option A: Nixpacks (auto-detected, recommended)**

Sevalla will auto-detect from `nixpacks.toml` and `package.json`:
- Build command: auto-detected (`pnpm install && pnpm build`)
- Start command: auto-detected (`node dist/index.js`)
- Node version: auto-detected from `.nvmrc` (22)

**Option B: Dockerfile**

If you prefer Docker, Sevalla will auto-detect the `Dockerfile` in the repo root:
- No additional configuration needed
- Includes health check and production optimizations

**Option C: Manual Buildpacks**

| Setting | Value |
|---------|-------|
| **Build command** | `corepack enable && corepack prepare pnpm@9.12.0 --activate && pnpm install --frozen-lockfile && pnpm build` |
| **Start command** | `node dist/index.js` |

---

## Step 4: Connect Database (Internal Network)

1. Go to your application's **Settings** page
2. Under **Internal connections**, attach your MySQL database
3. Select **"Add environment variables"** checkbox — Sevalla will auto-inject connection details
4. Edit the auto-created environment variable key to `DATABASE_URL` with format:

```
mysql://USERNAME:PASSWORD@INTERNAL_HOST:INTERNAL_PORT/utilityflow
```

> Using the internal connection means traffic stays on Sevalla's private network — no SSL overhead needed, lower latency, and no external exposure.

---

## Step 5: Set Environment Variables

In Sevalla Dashboard → Your App → **Environment Variables**, add:

### Required Variables

| Key | Value | Available At | Notes |
|-----|-------|--------------|-------|
| `NODE_ENV` | `production` | Runtime | **Must be set manually** — Sevalla does not set this automatically |
| `DATABASE_URL` | `mysql://...` | Runtime | Internal connection string (from Step 4) |
| `JWT_SECRET` | *(96-char hex)* | Runtime | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

### Storage Variables (Sevalla Object Storage / Cloudflare R2)

| Key | Value | Available At | Notes |
|-----|-------|--------------|-------|
| `STORAGE_PROVIDER` | `s3` | Runtime | Switches to S3-compatible mode |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | Runtime | From Sevalla Object Storage settings |
| `S3_REGION` | `auto` | Runtime | R2 uses `auto` for region |
| `S3_BUCKET` | `utilityflow-uploads` | Runtime | Your bucket name |
| `S3_ACCESS_KEY` | *(from Sevalla)* | Runtime | Object Storage user access key |
| `S3_SECRET_KEY` | *(from Sevalla)* | Runtime | Object Storage user secret key |
| `S3_PUBLIC_URL` | `https://your-bucket.sevalla.storage/` | Runtime | Public URL if bucket has public access |
| `S3_FORCE_PATH_STYLE` | `true` | Runtime | **Required for Cloudflare R2** |

### AI/LLM Variables (for OCR meter reading)

| Key | Value | Available At | Notes |
|-----|-------|--------------|-------|
| `OPENAI_API_KEY` | `sk-...` | Runtime | Your OpenAI API key |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Runtime | Or any OpenAI-compatible endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Runtime | Model for OCR (default: `gemini-2.5-flash`) |

### Variables That MUST Stay Unset (do NOT add these)

| Key | Why |
|-----|-----|
| `OAUTH_SERVER_URL` | Must be empty — disables Manus OAuth |
| `OWNER_OPEN_ID` | Must be empty — email+password auth only |
| `BUILT_IN_FORGE_API_URL` | Not needed — use `OPENAI_BASE_URL` instead |
| `BUILT_IN_FORGE_API_KEY` | Not needed — use `OPENAI_API_KEY` instead |
| `PORT` | **Do NOT set** — Sevalla injects this automatically |

### Optional Variables

| Key | Value | Notes |
|-----|-------|-------|
| `NOTIFICATION_WEBHOOK_URL` | `https://hooks.slack.com/...` | Slack/Discord webhook for admin alerts |
| `ADMIN_EMAIL` | `your@email.com` | Bootstrap admin email (for seed script) |
| `ADMIN_PASSWORD` | *(strong password)* | Bootstrap admin password (for seed script) |

---

## Step 6: Run Database Migrations

After the first successful deployment, run migrations to create tables:

**Option A: From your local machine**

```bash
export DATABASE_URL="mysql://user:pass@external-host:3306/utilityflow"
pnpm db:push
pnpm seed:admin
```

**Option B: From Sevalla's web terminal (if available)**

```bash
pnpm db:push
pnpm seed:admin
```

---

## Step 7: Configure Health Check (Recommended)

In Sevalla Dashboard → Your App → **Processes → Web Process**:

| Setting | Value |
|---------|-------|
| **Health check path** | `/api/health` |
| **Readiness probe** | Enabled |
| **Liveness probe** | Enabled |

This enables zero-downtime deployments — old pods continue serving until new pods pass health checks.

---

## Step 8: Deploy & Verify

1. Push to `main` (or click **Deploy now** in Sevalla)
2. Watch the deployment log for success
3. Verify:

```bash
curl https://your-app.sevalla.app/api/version
# Expected: {"ok":true,"version":"1.6.0","name":"utility-billing-app","timestamp":...}

curl https://your-app.sevalla.app/api/health
# Expected: {"ok":true,"timestamp":...}
```

---

## Step 9: Build the Android APK

Once your server is live on Sevalla:

```bash
# Set the Sevalla URL as the API endpoint for the mobile app
export EXPO_PUBLIC_API_URL=https://your-app.sevalla.app

# Build the production APK via EAS
EAS_NO_VCS=1 EXPO_TOKEN=your_token npx eas-cli build \
  --platform android \
  --profile production \
  --non-interactive \
  --no-wait
```

The APK will be available for download from your [EAS dashboard](https://expo.dev) once the build completes (10-20 minutes).

---

## Step 10: Distribute the APK

| Method | How |
|--------|-----|
| **Direct download** | Upload APK to your Sevalla Object Storage bucket and share the URL |
| **Google Play** | Use `production-aab` profile and submit via Play Console |
| **In-app updates** | After first install, use Admin → Settings → App Updates |

---

## Sevalla-Specific Compatibility Notes

| Requirement | How We Handle It |
|-------------|-----------------|
| **PORT env var** | Server reads `process.env.PORT` and binds to `0.0.0.0:$PORT` in production |
| **Stateless app** | No in-memory sessions (JWT-based auth), no local file storage (S3) |
| **NODE_ENV not auto-set** | Must be manually added as env var |
| **pnpm detection** | `packageManager` field in `package.json` set to `pnpm@9.12.0` |
| **Node version** | `engines.node >= 20.0.0` in `package.json` + `.nvmrc` file |
| **R2 path-style** | `S3_FORCE_PATH_STYLE=true` ensures path-style addressing for R2 |
| **Health checks** | `/api/health` endpoint returns `{"ok":true}` for readiness/liveness probes |
| **Internal DB** | Connects via private network when app and DB are in same region |
| **No EXPOSE needed** | Sevalla handles routing externally; Dockerfile EXPOSE is informational only |
| **Zero-downtime deploy** | Health check ensures old pods serve until new pods are ready |

---

## Scaling on Sevalla

When ready to scale:

1. **Horizontal scaling** — Add more instances (app is stateless, fully supports this)
2. **Upgrade pod size** — Increase CPU/RAM per instance
3. **Database scaling** — Upgrade from DB1 to larger tiers
4. **Custom domain** — Requires non-Hobby pod size; add in Settings → Domains

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Storage config missing` | Set `STORAGE_PROVIDER=s3` and all `S3_*` vars |
| `LLM API key is not configured` | Set `OPENAI_API_KEY` |
| `ECONNREFUSED` on database | Ensure app and DB are in same region; use internal connection |
| `Cannot find module` | Ensure build completes successfully in deployment log |
| OCR returns low confidence | Try `LLM_MODEL=gpt-4o` for better vision capabilities |
| 404 on `/api/oauth/*` | Correct behavior — OAuth is disabled on Sevalla |
| App crashes on startup | Check runtime logs; ensure all required env vars are set |
| `MODULE_TYPELESS_PACKAGE_JSON` warning | Use Dockerfile build (handles this automatically) |
| Build fails with pnpm | Ensure `packageManager` field is in `package.json` |

---

## Environment Variable Quick-Copy

```bash
# === REQUIRED ===
NODE_ENV=production
DATABASE_URL=mysql://user:pass@internal-host:3306/utilityflow
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">

# === STORAGE (Sevalla Object Storage / Cloudflare R2) ===
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=utilityflow-uploads
S3_ACCESS_KEY=<from Sevalla Object Storage>
S3_SECRET_KEY=<from Sevalla Object Storage>
S3_PUBLIC_URL=<your public bucket URL>
S3_FORCE_PATH_STYLE=true

# === AI/LLM ===
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# === OPTIONAL ===
NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/services/...
```
