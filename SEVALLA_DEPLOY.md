# UtilityFlow — Sevalla Deployment Guide

> This guide covers deploying the UtilityFlow tRPC backend server to **Sevalla** and building the Android APK via EAS Build.

---

## Architecture Overview

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Android APK     │──────▶│  Sevalla Server   │──────▶│  MySQL Database  │
│  (React Native)  │ HTTPS │  (Node.js/tRPC)   │       │  (External)      │
└──────────────────┘       └──────────────────┘       └──────────────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  S3 Storage      │
                           │  (Files/Images)  │
                           └──────────────────┘
```

---

## Prerequisites

| Item | Where to Get It |
|------|-----------------|
| Sevalla account | https://sevalla.com |
| MySQL 8.0+ database | PlanetScale, Railway, Aiven, or Sevalla add-on |
| S3-compatible storage | Supabase Storage, AWS S3, Cloudflare R2, DigitalOcean Spaces |
| OpenAI API key (for OCR) | https://platform.openai.com/api-keys |
| Expo account + token | https://expo.dev/settings/access-tokens |

---

## Step 1: Create a Sevalla Application

1. Log in to [Sevalla Dashboard](https://sevalla.com)
2. Click **"Add Application"**
3. Connect your GitHub repository: `jarrenmanusai/utility-billing-app`
4. Configure build settings:

| Setting | Value |
|---------|-------|
| **Branch** | `main` |
| **Build command** | `corepack enable && corepack prepare pnpm@9.12.0 --activate && pnpm install --frozen-lockfile && pnpm build` |
| **Start command** | `node dist/index.js` |
| **Node version** | 22 (auto-detected from `.nvmrc`) |
| **Root directory** | `/` (project root) |

> **Alternative:** If Sevalla supports Dockerfile deployments, it will auto-detect the `Dockerfile` in the repo and use that instead.

---

## Step 2: Set Environment Variables

In Sevalla Dashboard → Your App → **Environment Variables**, add:

### Required Variables

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Enables production mode |
| `DATABASE_URL` | `mysql://user:pass@host:3306/dbname?ssl={"rejectUnauthorized":true}` | Your MySQL connection string |
| `JWT_SECRET` | *(96-char hex string)* | Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PORT` | `3000` | Or let Sevalla assign automatically |

### Storage Variables (choose one path)

**Option A: S3-compatible storage (recommended for Sevalla)**

| Key | Value | Notes |
|-----|-------|-------|
| `STORAGE_PROVIDER` | `s3` | Switches from Forge to S3 |
| `S3_ENDPOINT` | `https://s3.amazonaws.com` | Or Supabase/R2/Spaces endpoint |
| `S3_REGION` | `us-east-1` | Your bucket region |
| `S3_BUCKET` | `utilityflow-uploads` | Your bucket name |
| `S3_ACCESS_KEY` | *(your access key)* | IAM or service account key |
| `S3_SECRET_KEY` | *(your secret key)* | IAM or service account secret |
| `S3_PUBLIC_URL` | `https://utilityflow-uploads.s3.amazonaws.com` | Public URL for serving files |

**Option B: Supabase Storage specifically**

| Key | Value | Notes |
|-----|-------|-------|
| `STORAGE_PROVIDER` | `s3` | Supabase Storage is S3-compatible |
| `S3_ENDPOINT` | `https://<project-ref>.supabase.co/storage/v1/s3` | From Supabase dashboard |
| `S3_REGION` | `us-east-1` | Default for Supabase |
| `S3_BUCKET` | `uploads` | Your Supabase bucket name |
| `S3_ACCESS_KEY` | *(from Supabase S3 credentials)* | Settings → Storage → S3 Access Keys |
| `S3_SECRET_KEY` | *(from Supabase S3 credentials)* | Settings → Storage → S3 Access Keys |
| `S3_PUBLIC_URL` | `https://<project-ref>.supabase.co/storage/v1/object/public/uploads` | Public bucket URL |

### AI/LLM Variables (for OCR meter reading feature)

| Key | Value | Notes |
|-----|-------|-------|
| `OPENAI_API_KEY` | `sk-...` | Your OpenAI API key |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Or any OpenAI-compatible endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Model for OCR (default: `gemini-2.5-flash`) |

### Variables That MUST Stay Unset

| Key | Why |
|-----|-----|
| `OAUTH_SERVER_URL` | Must be empty — disables Manus OAuth |
| `OWNER_OPEN_ID` | Must be empty — email+password auth only |
| `BUILT_IN_FORGE_API_URL` | Not needed on Sevalla (use OPENAI_BASE_URL + S3 instead) |
| `BUILT_IN_FORGE_API_KEY` | Not needed on Sevalla (use OPENAI_API_KEY + S3 instead) |

### Optional Variables

| Key | Value | Notes |
|-----|-------|-------|
| `NOTIFICATION_WEBHOOK_URL` | `https://hooks.slack.com/...` | Slack/Discord webhook for admin notifications |
| `ADMIN_EMAIL` | `your@email.com` | Bootstrap admin email |
| `ADMIN_PASSWORD` | *(strong password)* | Bootstrap admin password |

---

## Step 3: Set Up the Database

### Option A: Use an external MySQL provider

1. Create a MySQL 8.0+ database on PlanetScale, Railway, Aiven, or any provider
2. Get the connection string and set it as `DATABASE_URL`
3. Run migrations from your local machine (or Sevalla console):

```bash
# From your local machine with DATABASE_URL exported
export DATABASE_URL="mysql://..."
pnpm db:push
pnpm seed:admin
```

### Option B: Use Sevalla's database add-on (if available)

1. In Sevalla Dashboard → Add-ons → Database → MySQL
2. The connection string will be auto-injected as `DATABASE_URL`
3. Run migrations via Sevalla's console/SSH

---

## Step 4: Deploy

1. Push your code to the `main` branch (or trigger a manual deploy in Sevalla)
2. Sevalla will build and deploy automatically
3. Verify the deployment:

```bash
curl https://your-app.sevalla.app/api/version
# Expected: {"ok":true,"version":"1.6.0","name":"utility-billing-app","timestamp":...}

curl https://your-app.sevalla.app/api/health
# Expected: {"ok":true,"timestamp":...}
```

---

## Step 5: Build the Android APK

Once your server is live, set the API URL and build:

```bash
# Set the Sevalla URL as the API endpoint
export EXPO_PUBLIC_API_URL=https://your-app.sevalla.app

# Build the production APK via EAS
EAS_NO_VCS=1 EXPO_TOKEN=your_token npx eas-cli build \
  --platform android \
  --profile production \
  --non-interactive \
  --no-wait
```

The APK will be available for download from your EAS dashboard at https://expo.dev once the build completes (10-20 minutes).

---

## Step 6: Distribute the APK

| Method | How |
|--------|-----|
| **Direct download** | Upload APK to your S3 bucket and share the URL |
| **Google Play** | Use `production-aab` profile and submit via Play Console |
| **In-app updates** | After first install, use Admin → Settings → App Updates |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Storage config missing` | Set `STORAGE_PROVIDER=s3` and all `S3_*` vars |
| `LLM API key is not configured` | Set `OPENAI_API_KEY` |
| `ECONNREFUSED` on database | Check `DATABASE_URL` and ensure the DB allows connections from Sevalla's IP |
| `Cannot find module` | Ensure build command runs `pnpm install --frozen-lockfile && pnpm build` |
| OCR returns low confidence | Try a different `LLM_MODEL` (e.g., `gpt-4o` for better vision) |
| 404 on `/api/oauth/*` | This is correct — OAuth is disabled on Sevalla |

---

## Environment Variable Summary

```bash
# === REQUIRED ===
NODE_ENV=production
DATABASE_URL=mysql://user:pass@host:3306/dbname
JWT_SECRET=<96-char-hex>

# === STORAGE (S3) ===
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=utilityflow-uploads
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=...
S3_PUBLIC_URL=https://utilityflow-uploads.s3.amazonaws.com

# === AI/LLM ===
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini

# === OPTIONAL ===
NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/services/...
EXPO_PUBLIC_API_URL=https://your-app.sevalla.app
```
