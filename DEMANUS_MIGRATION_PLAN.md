# De-Manus Migration Plan
## Porting `utility-billing-app` from Manus to Render + Supabase + EAS Build

**Author:** Manus AI
**Repo:** `github.com/jarrenmanusai/utility-billing-app`
**Baseline tag:** `v1.6.2` (post-audit), with v1.6.3 expected after the in-flight launch-crash fix
**Target stack:** Render (backend) + Supabase (Postgres + Storage + Auth) + EAS Build (APK)
**Audience:** You, the human operator, executing each step yourself. AI agents are advisors only — they answer questions, review your work, and unstick you, but they do not drive the keyboard.

---

## How to read this document

This is a **migration blueprint**, not a script. It tells you what to do, what to decide, and what to verify, in the order that minimizes the risk of breaking something. The estimated total time, spread across multiple working sessions, is **3–5 working days** if this is your first time doing a port like this. A seasoned full-stack engineer would do it in 1–2 days.

Each phase is self-contained. You can stop at the end of any phase, go to bed, come back the next day, and resume. You can also pause mid-phase if you save your work to a feature branch — the document calls out where it's safe to pause.

The document is structured in five phases:

1. **Phase 0 — Pre-flight** (accounts, replica repo, decisions). About half a day.
2. **Phase 1 — Strip Manus from the codebase.** Files to delete, files to edit, what to replace each thing with. About one day.
3. **Phase 2 — Switch the database from MySQL to Postgres.** About half a day.
4. **Phase 3 — Add commercial deploy infrastructure** (Supabase + Render + EAS configuration). About one day.
5. **Phase 4 — Verify, deploy, and smoke-test.** About half a day.

After Phase 4, the repo is self-sufficient. You can deploy and redeploy on your own using the `DEPLOY.md` you'll have written by then.

---

## Phase 0 — Pre-flight

### 0.1 Create a replica repository on GitHub

You said you wanted to do this on a replica, not the live `utility-billing-app` repo. Good call. The replica isolates you from any risk of damaging the working Manus deploy while you experiment.

In the GitHub UI, go to your `utility-billing-app` repository, click the **Fork** button (or use **Use this template** if you converted it to a template), and name the new repo something distinct. Suggested names: `utility-billing-app-portable`, `utilityflow-render`, or `utility-billing-app-v2`. Whatever you pick, be consistent for the rest of the document — I'll refer to it as **`<replica-repo>`** below.

Clone it to your local machine:

```bash
git clone https://github.com/jarrenmanusai/<replica-repo>.git
cd <replica-repo>
```

From this point forward, all work happens locally on your machine and is pushed to **`<replica-repo>`** on GitHub. The live Manus deploy continues running off the original repo, undisturbed.

### 0.2 Local development environment

Make sure you have, on your local machine:

- **Node.js 22.x** (matches the Manus sandbox; lower versions may compile but not all syntax is supported)
- **pnpm 9.x** (`npm install -g pnpm@9.12.0`)
- **PostgreSQL 16+** for local development testing (can be Docker, Postgres.app on macOS, or a system install on Linux/Windows). Supabase uses Postgres 15 in production but 16 is backward-compatible for development.
- **Git**, configured with your GitHub credentials.
- **Optionally:** an editor with TypeScript support (VS Code, WebStorm, Cursor, etc.).

Run `pnpm install` in the cloned replica to confirm dependencies install cleanly. They should — there are no Manus-specific npm packages.

### 0.3 Provider accounts

You'll need accounts on three platforms. All offer free tiers sufficient to complete the migration, with paid upgrades available later.

**Supabase** (`supabase.com`):
- Sign up with GitHub for fastest onboarding.
- Free tier: 500 MB database, 1 GB file storage, 50 MB total egress per day. Enough for testing and small early-user traffic.
- Paid tier ("Pro"): $25/month, 8 GB database, 100 GB storage, more egress. Upgrade when real users hit.

**Render** (`render.com`):
- Sign up with GitHub.
- Free tier for web services: backend sleeps after 15 minutes of inactivity, takes ~30 seconds to wake up on the first request. Acceptable for testing, painful for real users.
- Paid tier ("Starter"): $7/month, no sleep, faster cold starts. This is what you'll want once real users hit.

**Expo** (`expo.dev`):
- Free tier: 30 EAS Build minutes/month, sufficient for occasional builds during development.
- Paid tier ("Production"): $19/month, 100+ build minutes, priority queue, useful when you're iterating on the APK frequently.

You don't need to upgrade any of them right now. Phases 1 through 4 can all be completed on free tiers. Upgrade decisions come later, after you've verified the deploy works and you have early users.

### 0.4 Provider preferences and decisions

Before writing a single line of code, lock in these decisions. They affect what gets built in Phase 1.

**OAuth provider for social login.** You said yes to OAuth. Supabase Auth supports Google, Apple, GitHub, Microsoft, Facebook, Twitter, and others natively. Pick one to start with — I'd recommend Google because it has the broadest user base and the lowest friction. You can add more later. Document your choice here:

> Primary OAuth provider: **___________** (e.g., Google)

**Push notification platform.** You said yes to push. Expo Push Notifications is the native fit because the app is built with Expo. It's free up to extremely high volumes (many millions per month). Confirm:

> Push notification provider: **Expo Push Notifications** (free tier)

**File upload destination.** You said yes to uploads. Supabase Storage is the native fit because you're already using Supabase for the database. It uses Postgres-backed access policies (Row Level Security) for permissions, which is more secure than the Manus Forge proxy you have today. Confirm:

> File storage provider: **Supabase Storage**

**Region.** Supabase asks you to pick a region during project creation. Pick the one closest to your users. For Philippines users, **Singapore (`ap-southeast-1`)** is the lowest-latency option. Render auto-detects the closest region but you can override it; pick **Singapore** there too. Document:

> Region: **Singapore (ap-southeast-1)**

**Domain decision.** You said no custom domain yet. That's fine — both Render and Supabase give you usable subdomains by default. You'll get URLs like `https://your-app.onrender.com` and `https://yourproject.supabase.co`. When you're ready to switch to a custom domain (e.g., `api.utilityflow.app`), it's a 15-minute DNS reconfiguration; defer it until you have an audience worth branding for.

### 0.5 Branch strategy

In `<replica-repo>`, before any code changes:

```bash
git checkout -b demanus-migration
```

All migration work happens on this branch. Keep `main` clean as a "Manus-compatible original" reference until the migration is verified. Once Phase 4 passes, you'll merge `demanus-migration` into `main` and delete the branch.

This way, if at any point you decide the migration was a bad idea, you `git checkout main && git branch -D demanus-migration` and you're back to the Manus-compatible state with zero damage.

### 0.6 Operator handoff checkpoint

Before proceeding to Phase 1, confirm:

- [ ] Replica repo created on GitHub at `<replica-repo>`
- [ ] Repo cloned locally
- [ ] `pnpm install` completes without errors
- [ ] Local Postgres 16 installed and running (`psql --version` works)
- [ ] Supabase account created
- [ ] Render account created
- [ ] Expo account created (`npm install -g eas-cli && eas login`)
- [ ] OAuth provider chosen and recorded
- [ ] Region chosen
- [ ] `demanus-migration` branch checked out
- [ ] You've read Phase 1 below in full before starting it (do this — Phase 1 is the highest-risk phase)

Once all boxes are ticked, you're ready for Phase 1.

---

## Phase 1 — Strip Manus from the codebase

This is the largest phase. The goal is to remove every line of code that depends on the Manus runtime and replace it with provider-agnostic equivalents. The end state is a server that boots cleanly with only standard env vars (`DATABASE_URL`, `JWT_SECRET`, etc.) and an APK that doesn't try to talk to a Manus iframe.

The scope is much smaller than I initially feared. The repo inventory turned up only **eight Manus-specific files** in `server/_core/` and **one** in `lib/_core/`. Of those, several can be deleted entirely because their features (LLM, image generation, voice transcription) aren't used in your app.

### 1.1 Files to delete entirely

These can be `git rm`'d with no replacement needed because the features they implement are not used in your app.

| File | Why it's safe to delete |
|---|---|
| `server/_core/sdk.ts` | Manus SDK initialization. The de-Manus'd server doesn't use any Manus services. |
| `server/_core/llm.ts` | LLM API client. Used by exactly one tRPC mutation (the OCR meter-reader at `server/routers.ts:518`). You said no AI features, so we'll remove the call site too. |
| `server/_core/imageGeneration.ts` | Manus image-gen API client. Not referenced from any router. |
| `server/_core/voiceTranscription.ts` | Manus STT API client. Not referenced from any router. |
| `server/_core/heartbeat.ts` | Manus webdev heartbeat for the dev panel. Not used in production. |
| `server/_core/dataApi.ts` | Manus webdev data inspection API. Not used in production. |

After deleting these, `pnpm check` (TypeScript) will fail. That's expected — Phase 1.2 cleans up the imports.

### 1.2 Files to edit

#### `server/routers.ts`

Remove the LLM-using mutation. Find lines 22 (`import { invokeLLM } from "./_core/llm";`) and the entire mutation block that uses it (around lines 510–560 — search for the second `.mutation` block that calls `invokeLLM`). Delete both.

If the mobile client has a screen that calls this mutation, find it (probably under `app/`) and replace the screen with a "feature unavailable in this build" message, OR delete the screen entirely if you don't need OCR. Search for `meterReadingExtract` or whatever the procedure is named to find call sites.

Also remove `import { systemRouter } from "./_core/systemRouter";` and any registration of it in the router tree. The `systemRouter` is a Manus webdev internal router for the dev panel; it has no place in production.

#### `server/_core/index.ts`

Remove the `registerOAuthRoutes` import and call:

```typescript
// DELETE these lines:
import { registerOAuthRoutes } from "./oauth";
// ...
if (process.env.OAUTH_SERVER_URL && process.env.OWNER_OPEN_ID) {
  registerOAuthRoutes(app);
  console.log("[OAuth] Manus OAuth routes mounted (env vars set).");
} else {
  console.log("[OAuth] Manus OAuth disabled — /api/oauth/* not mounted (email+password only).");
}
```

Replace the OAuth section with a comment marking where Supabase Auth integration will live in Phase 3:

```typescript
// OAuth: handled by Supabase Auth on the client side.
// The server validates Supabase JWTs in the tRPC context — see server/_core/context.ts.
```

Also delete `server/_core/oauth.ts` after this.

#### `server/_core/env.ts`

Replace the entire file with a stripped, provider-agnostic version:

```typescript
export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  // Expo Push
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN ?? "",
};
```

Remove every reference to `appId`, `oAuthServerUrl`, `ownerOpenId`, `forgeApiUrl`, and `forgeApiKey` from anywhere in the codebase. Use grep to find them: `grep -rn "ENV\.appId\|ENV\.oAuthServerUrl\|ENV\.ownerOpenId\|ENV\.forgeApiUrl\|ENV\.forgeApiKey" server/ lib/ app/`. Each call site should be deleted or replaced.

#### `server/storage.ts`

This is the largest single rewrite in Phase 1. The current implementation uses Manus's Forge S3 proxy. Replace it with Supabase Storage.

```typescript
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

const supabase = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const BUCKET = "user-uploads"; // create this bucket in Phase 3.1

export async function uploadFile(
  userId: string,
  filename: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = `${userId}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, data, { contentType, upsert: false });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { key, url: urlData.publicUrl };
}

export async function deleteFile(key: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([key]);
  if (error) throw error;
}

export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
```

Then add the dependency:

```bash
pnpm add @supabase/supabase-js
```

#### `server/_core/notification.ts`

Replace the Manus push delivery with Expo Push Notifications:

```typescript
import { Expo } from "expo-server-sdk";

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!Expo.isExpoPushToken(expoPushToken)) {
    console.warn(`[push] invalid token: ${expoPushToken}`);
    return;
  }

  const messages = [
    {
      to: expoPushToken,
      sound: "default" as const,
      title,
      body,
      data: data ?? {},
    },
  ];

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      console.error("[push] send failed", err);
    }
  }
}

// Replace the existing notifyOwner export
export async function notifyOwner(title: string, body: string): Promise<void> {
  // Look up the owner's expo push token from the users table; this is a stub.
  // Implement based on your schema once Phase 2 has migrated to Postgres.
  console.log(`[notifyOwner] ${title}: ${body}`);
}
```

Add the dependency:

```bash
pnpm add expo-server-sdk
```

#### `lib/_core/manus-runtime.ts` and `app/_layout.tsx`

Delete `lib/_core/manus-runtime.ts` entirely. Then in `app/_layout.tsx`:

```typescript
// DELETE this import:
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";

// DELETE this useEffect:
useEffect(() => {
  initManusRuntime();
}, []);

// DELETE this useEffect (the entire block that subscribes to safe-area insets):
useEffect(() => {
  if (Platform.OS !== "web") return;
  const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
  return () => unsubscribe();
}, [handleSafeAreaUpdate]);
```

Replace the safe-area logic with a standard `react-native-safe-area-context` `useSafeAreaInsets()` hook, which the project already has installed. Search the file for `useSafeAreaInsets` to see if it's already imported elsewhere; if not, add `import { useSafeAreaInsets } from "react-native-safe-area-context";` and replace `insets` state with the hook's return value.

#### `app.config.ts`

Remove the `appSlug`, `appId`, `logoUrl` env keys that were Manus-specific. Keep `appName`, `iosBundleId`, `androidPackage`, `scheme`. The `bundle_id` template at the top can stay as-is — it generates a deterministic bundle ID from a project name.

### 1.3 Add the Supabase Auth integration

Since you said yes to OAuth, this is where Supabase Auth replaces the Manus OAuth flow. The architecture is:

1. Mobile app uses `@supabase/supabase-js` to call `signInWithOAuth({ provider: "google" })`.
2. Supabase handles the OAuth dance, returns a Supabase JWT.
3. Mobile app stores the JWT in SecureStore and includes it in every tRPC request.
4. Server tRPC context validates the JWT against Supabase's JWKS and looks up the user.

This is a clean replacement. Concretely:

**On the mobile side** (`lib/auth-context.tsx` or wherever auth state lives):

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
);

// Add a "Sign in with Google" button that calls:
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "your-scheme://auth-callback",
    },
  });
  if (error) throw error;
}

// Existing email+password flow stays intact:
async function signInWithEmail(email: string, password: string) {
  // Use Supabase Auth too, OR keep the existing custom auth.
  // I recommend migrating to Supabase Auth fully — it gives you password reset,
  // email verification, and rate limiting for free.
}
```

**On the server side** (`server/_core/context.ts`):

```typescript
import jwksClient from "jwks-rsa";
import * as jose from "jose";

const SUPABASE_JWKS_URL = `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const JWKS = jose.createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));

export async function createContext({ req }: { req: any }) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) return { user: null };

  try {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    });
    return { user: { id: payload.sub, email: payload.email } };
  } catch {
    return { user: null };
  }
}
```

Add dependencies:

```bash
pnpm add @supabase/supabase-js jose
```

**Important decision on the existing email+password auth:** the current codebase has its own email+password auth in `server/_core/auth.ts`. You have two choices:

- **Option A** — keep it. The email+password flow continues to use the local DB; OAuth flows go through Supabase. Two parallel auth paths. More code, more edge cases.
- **Option B** — migrate everyone to Supabase Auth. Delete `server/_core/auth.ts`, switch the email+password screens to Supabase Auth. Less code, more consistent, but you have to migrate any existing users (which on a not-yet-released app means there are none).

I recommend **Option B** — fewer moving parts, better long-term. But it adds about 4 hours to Phase 1. Document your choice here:

> Auth strategy: **___________** (Option A: dual / Option B: Supabase only)

### 1.4 Phase 1 verification

After all the changes above, run:

```bash
pnpm check          # TypeScript compile
pnpm test           # Unit tests
pnpm lint           # ESLint
```

Fix any errors. The most common ones at this stage are:

- Imports of deleted files in places I missed listing above. Use `grep -rn "_core/sdk\|_core/llm\|_core/heartbeat\|_core/dataApi\|_core/imageGeneration\|_core/voiceTranscription\|_core/manus-runtime"` to find any remaining references and delete them.
- Type errors from removed env vars. Find with `grep -rn "ENV\.appId\|ENV\.forge\|ENV\.oAuth\|ENV\.ownerOpenId"`.
- Type errors from removed Manus push notification API. Update call sites to use the new `sendPushNotification` signature.

Once `pnpm check && pnpm test && pnpm lint` all pass clean, commit:

```bash
git add -A
git commit -m "Phase 1: strip Manus runtime — replace with provider-agnostic stack"
git push origin demanus-migration
```

This is a safe pause point. You can stop here, take a break, and resume Phase 2 fresh.

---

## Phase 2 — Switch the database from MySQL to Postgres

This phase is shorter and more mechanical than Phase 1. Drizzle handles most of it automatically.

### 2.1 Update package.json

Remove `mysql2` and add `pg`:

```bash
pnpm remove mysql2
pnpm add pg @types/pg
```

### 2.2 Rewrite `drizzle.config.ts`

Change the dialect:

```typescript
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",  // was "mysql"
  dbCredentials: {
    url: connectionString,
  },
});
```

### 2.3 Rewrite `drizzle/schema.ts`

This is the bulk of Phase 2. Every Drizzle import needs to switch from `drizzle-orm/mysql-core` to `drizzle-orm/pg-core`:

```typescript
// BEFORE:
import { mysqlTable, mysqlEnum, varchar, ... } from "drizzle-orm/mysql-core";

// AFTER:
import { pgTable, pgEnum, varchar, ... } from "drizzle-orm/pg-core";
```

Then for each table, swap `mysqlTable` → `pgTable`, `mysqlEnum` → `pgEnum`. Postgres enums are slightly different — you declare them once at the top of the file:

```typescript
export const userRoleEnum = pgEnum("user_role", ["landlord", "tenant", "admin"]);

// Then in the table:
role: userRoleEnum("role").default("landlord").notNull(),
```

Other type changes you'll likely hit:

- MySQL `int` → Postgres `integer`
- MySQL `bigint` → Postgres `bigint` (same syntax)
- MySQL `tinyint(1)` → Postgres `boolean`
- MySQL `datetime` → Postgres `timestamp`
- MySQL `text` and `varchar` → identical in Postgres
- MySQL `json` → Postgres `jsonb` (use jsonb; it's better)

Drizzle's documentation at https://orm.drizzle.team/docs/column-types/pg has a complete reference.

### 2.4 Update `server/db.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV } from "./_core/env";
import * as schema from "../drizzle/schema";

const pool = new Pool({
  connectionString: ENV.databaseUrl,
  max: 20,
  ssl: ENV.isProduction ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
```

### 2.5 Regenerate migrations

Delete the old MySQL migrations:

```bash
rm drizzle/0000_*.sql
rm -rf drizzle/meta
```

Then with a local Postgres running and `DATABASE_URL=postgres://localhost/utility_billing_dev` set, generate fresh Postgres migrations:

```bash
createdb utility_billing_dev
DATABASE_URL=postgres://localhost/utility_billing_dev pnpm drizzle-kit generate
DATABASE_URL=postgres://localhost/utility_billing_dev pnpm drizzle-kit migrate
```

This produces `drizzle/0000_initial.sql` (or similar) targeted at Postgres.

### 2.6 Update seed scripts

If the project has any database seed scripts (look in `scripts/` and `server/`), they likely have MySQL-specific syntax (`INSERT IGNORE`, backticks for identifiers). Convert to Postgres syntax (`ON CONFLICT DO NOTHING`, double-quotes for identifiers).

### 2.7 Phase 2 verification

```bash
pnpm check          # TypeScript
pnpm test           # Tests
pnpm dev            # Boot the server against local Postgres
```

The server should start, log `[server] listening on port 3000`, and respond to `curl http://localhost:3000/api/version` with valid JSON. If it does, Phase 2 is complete.

Commit:

```bash
git add -A
git commit -m "Phase 2: migrate database from MySQL to Postgres"
git push origin demanus-migration
```

Another safe pause point.

---

## Phase 3 — Add commercial deploy infrastructure

Now we configure the cloud platforms. This phase is mostly UI clicks and config files, less code editing.

### 3.1 Provision Supabase

In the Supabase dashboard:

1. Click **New project**.
2. Name: `utility-billing-app` (or whatever you prefer)
3. Database password: generate a strong one and **save it in your password manager**. You'll need it for the connection string.
4. Region: Singapore (`ap-southeast-1`).
5. Pricing plan: Free.
6. Click **Create new project**. Wait 2-3 minutes for provisioning.

Once provisioned:

7. Go to **Settings → Database**. Copy the connection string. It looks like `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres`. This is your `DATABASE_URL`.

8. Go to **Settings → API**. Copy:
   - **Project URL** (`https://xxxxxx.supabase.co`) → this is `SUPABASE_URL`
   - **`anon` `public`** key → this is `SUPABASE_ANON_KEY`
   - **`service_role` `secret`** key → this is `SUPABASE_SERVICE_ROLE_KEY`

9. Go to **Authentication → Providers**. Enable Google (or whichever OAuth provider you chose). Follow Supabase's docs to configure the OAuth client ID/secret with Google Cloud Console. The setup is well-documented at https://supabase.com/docs/guides/auth/social-login/auth-google.

10. Go to **Storage → Buckets**. Create a bucket named `user-uploads`. Set it to **private** (auth required). Configure RLS (Row Level Security) policies so users can only access their own files. The Supabase docs cover this at https://supabase.com/docs/guides/storage/security/access-control.

### 3.2 Run the database migrations on Supabase

From your local machine:

```bash
DATABASE_URL='postgresql://postgres:YOUR-PASSWORD@db.xxxxxx.supabase.co:5432/postgres' \
  pnpm drizzle-kit migrate
```

This applies the migrations you generated in Phase 2.5 to the Supabase database. Verify by going to the Supabase **Table Editor** and confirming your tables (users, bills, units, etc.) appear.

### 3.3 Provision Render

In the Render dashboard:

1. Click **New → Web Service**.
2. Connect your GitHub account if not already connected.
3. Select the `<replica-repo>` repository.
4. Branch: `main` (you'll merge `demanus-migration` into `main` at the end of Phase 4).
5. Region: Singapore.
6. Runtime: **Node**.
7. Build command: `pnpm install && pnpm build`
8. Start command: `pnpm start`
9. Instance type: Free.
10. Add the environment variables (you'll do this in Phase 3.5).
11. Click **Create Web Service**. Render will fail to deploy at first because env vars aren't set yet — that's expected.

### 3.4 Add `render.yaml` for infrastructure-as-code

Create `render.yaml` at the repo root so future redeploys can be reproduced:

```yaml
services:
  - type: web
    name: utility-billing-app
    runtime: node
    plan: free
    region: singapore
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_ANON_KEY
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: EXPO_ACCESS_TOKEN
        sync: false
```

`sync: false` means the value is set in the Render UI, not in the YAML — which is what you want for secrets.

### 3.5 Set Render environment variables

In the Render service dashboard, go to **Environment** and add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The Supabase connection string from Phase 3.1.7 |
| `JWT_SECRET` | A 96-char hex string (generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `SUPABASE_URL` | From Phase 3.1.8 |
| `SUPABASE_ANON_KEY` | From Phase 3.1.8 |
| `SUPABASE_SERVICE_ROLE_KEY` | From Phase 3.1.8 |
| `EXPO_ACCESS_TOKEN` | Generate at https://expo.dev/settings/access-tokens (used by the server SDK to send push notifications) |

Click **Save**. Render will auto-redeploy.

### 3.6 Verify the Render deploy

Wait for Render to finish deploying. Click into the latest deploy logs and confirm:

- `pnpm install` succeeded
- `pnpm build` succeeded
- The server logged `listening on port 3000` (or whatever port Render assigned)

Then in your terminal:

```bash
curl https://your-app.onrender.com/api/version
```

This must return `{"version":"1.6.0", ...}` or similar. If it returns 404 or HTML, something is wrong with the build. Check the Render logs.

If it works, **the backend is live**.

### 3.7 Configure EAS Build for the new backend

In `eas.json`, update the production profile to point at the new backend:

```json
{
  "build": {
    "production": {
      "image": "sdk-54",
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://your-app.onrender.com",
        "EXPO_PUBLIC_SUPABASE_URL": "https://xxxxxx.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "your-anon-key-here"
      }
    }
  }
}
```

Note the `EXPO_PUBLIC_*` prefix — these env vars get baked into the JavaScript bundle (visible to anyone who decompiles the APK), which is fine for the URL and the anon key (the anon key is designed to be public; it relies on Supabase RLS for actual security). **Never put `SUPABASE_SERVICE_ROLE_KEY` here.**

### 3.8 Trigger an EAS build

From your local machine:

```bash
eas build --profile production --platform android
```

EAS Build will compile the APK against the new env vars. Wait 15-25 minutes. When done, EAS gives you a URL to download the APK.

### 3.9 Phase 3 verification

- [ ] Supabase project created and tables visible in Table Editor
- [ ] Database migrations ran successfully
- [ ] Render service deployed and `/api/version` returns 200 with valid JSON
- [ ] EAS build completed and APK is downloadable
- [ ] `eas.json` committed with the new env values (the URL and anon key only — service role key is never in the repo)

Commit and push the eas.json + render.yaml changes:

```bash
git add eas.json render.yaml
git commit -m "Phase 3: add Render + Supabase + EAS Build configuration"
git push origin demanus-migration
```

---

## Phase 4 — Verify, deploy, and smoke-test

The final phase. You're verifying the whole stack works end-to-end and writing the documentation that lets you operate the app without me.

### 4.1 Install the new APK on a test phone

Download the APK from the EAS build URL. Transfer it to a test Android phone (USB, Google Drive, whatever). Install it. Open it.

You should see the login screen (no crash, no localhost errors). Try to:

1. **Email + password sign-in** with the seeded admin account (or whatever your test credentials are). Should land on the home screen.
2. **OAuth sign-in** with Google. Should redirect to Google, complete auth, return to the app, land on the home screen.
3. **Create a record** (a new bill, a new tenant, whatever your app's primary action is). Should save and reflect in the Supabase Table Editor.
4. **Upload a file** (if your app has uploads). Should save to Supabase Storage; verify in the Storage UI.
5. **Receive a push notification** (if your app sends them). Trigger one from the server and verify it arrives.

If any of these fail, debug:

- **API errors:** check Render logs.
- **Auth errors:** check Supabase Auth logs.
- **Storage errors:** check Supabase Storage policies (RLS).
- **Push errors:** check the Expo Push Notification dashboard.

Iterate until all five smoke tests pass.

### 4.2 Write `DEPLOY.md`

This is the document you (or any other operator) follows for future redeployments. Save it at the repo root:

```markdown
# Deploying utility-billing-app

This document covers redeploying the app after code changes. For first-time setup, see DEMANUS_MIGRATION_PLAN.md.

## Prerequisites
- Render account with the utility-billing-app service
- Supabase account with the utility-billing-app project
- Expo account (eas-cli installed and logged in)
- Repo cloned locally on `main` branch

## Backend redeploy (server changes)
1. Commit and push your changes to `main`.
2. Render auto-deploys on push to `main`. Watch the build at https://dashboard.render.com.
3. Once deployed, verify with `curl https://your-app.onrender.com/api/version`.
4. If anything goes wrong, roll back via Render → Deploys → Previous deploy → "Redeploy".

## Database migration (schema changes)
1. Create a new Drizzle migration locally: `pnpm drizzle-kit generate`.
2. Review the generated SQL in `drizzle/`.
3. Apply to Supabase: `DATABASE_URL='postgres://...' pnpm drizzle-kit migrate`.
4. Commit the migration files and push.

## APK rebuild (mobile app changes)
1. Increment the build number in `app.config.ts` if needed (EAS auto-increments by default).
2. Run: `eas build --profile production --platform android`.
3. Download the new APK from the EAS dashboard.
4. Distribute to users (direct download, Play Store, etc.).

## Rollback procedures
- **Server:** Render → Deploys → previous deploy → Redeploy.
- **Database:** Drizzle migrations are forward-only. To roll back a schema change, write a new migration that reverses it.
- **APK:** users keep the old APK; they don't auto-update unless you ship through Play Store.

## Monitoring
- Render: built-in metrics dashboard.
- Supabase: SQL editor for ad-hoc queries; Logs section for connection/query logs.
- Expo: build logs for APK builds; push notification delivery dashboard.

## Backups
- Supabase Free tier: daily automated backups, 7-day retention.
- Pro tier: extended retention, point-in-time recovery.
- Manual: `pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql`.
```

Customize this further as you learn the operational rhythm of your specific app.

### 4.3 Write `MAINTENANCE.md`

A separate doc for ongoing operations:

```markdown
# Maintenance Runbook

## Daily
- (Nothing automated needed; everything auto-scales.)

## Weekly
- Skim Render logs for errors (look for "ERROR" patterns).
- Skim Supabase logs for slow queries.
- Verify a recent backup is restorable (do this once a month at minimum).

## Monthly
- Verify TLS certificates haven't drifted (Render and Supabase manage these automatically, but worth checking).
- Review usage on Render (instance hours), Supabase (DB size, storage size, egress), Expo (build minutes). Upgrade plans if approaching limits.
- Update dependencies: `pnpm update --interactive --latest`. Test thoroughly after.

## Quarterly
- Take a manual database backup and store off-platform.
- Review and rotate `JWT_SECRET` (requires forcing all users to re-login).
- Review and rotate Supabase service role key.
- Review APK versions in users' hands; consider deprecating old versions.

## On-call / Incident response
- Backend down: Render dashboard → Logs → diagnose. Most common: out of memory on free tier.
- Database down: Supabase dashboard → Status. Most common: hitting connection limit.
- Push notifications failing: Expo dashboard → Push Notifications → diagnose.
```

### 4.4 Update `README.md`

Replace the Manus-template README with one that describes your actual project:

```markdown
# UtilityFlow — Smart Utility Billing Platform

Mobile-first utility billing application for landlords and tenants in the Philippines.

## Stack
- **Frontend:** React Native (Expo SDK 54)
- **Backend:** Node.js + tRPC, deployed on Render
- **Database:** Postgres on Supabase
- **Storage:** Supabase Storage
- **Auth:** Supabase Auth (Google OAuth + email/password)
- **Push notifications:** Expo Push Notifications

## Documentation
- [`DEPLOY.md`](DEPLOY.md) — how to redeploy after code changes
- [`MAINTENANCE.md`](MAINTENANCE.md) — operational runbook
- [`drizzle/schema.ts`](drizzle/schema.ts) — database schema

## Local development
1. Install dependencies: `pnpm install`
2. Set up local Postgres and run migrations: `DATABASE_URL=postgres://localhost/utility_billing_dev pnpm drizzle-kit migrate`
3. Copy `.env.example` to `.env.local` and fill in values
4. Start dev server: `pnpm dev`
5. Open in Expo Go or build a development client: `eas build --profile development --platform android`

## Production
The app is deployed to Render at `https://your-app.onrender.com`. The Android APK is built by EAS and distributed manually.

## License
(Your license here)
```

### 4.5 Final commit and merge

```bash
git add DEPLOY.md MAINTENANCE.md README.md
git commit -m "Phase 4: deploy documentation"
git push origin demanus-migration

# Merge to main:
git checkout main
git merge demanus-migration
git push origin main

# Tag the release:
git tag -a v2.0.0 -m "v2.0.0 — fully de-Manus'd, deployed on Render + Supabase"
git push origin v2.0.0

# Clean up:
git branch -D demanus-migration
```

### 4.6 Phase 4 verification

- [ ] All 5 smoke tests pass on the test phone APK
- [ ] `DEPLOY.md` written and committed
- [ ] `MAINTENANCE.md` written and committed
- [ ] `README.md` updated and committed
- [ ] Branch merged to `main`
- [ ] `v2.0.0` tag pushed

You're done. The repo is now a self-sufficient deployment artifact. You can hand it to anyone — no Manus context needed — and they can deploy and operate it.

---

## Operating the app post-migration

After Phase 4, your operational reality changes:

| Operation | Old (Manus) | New (Render + Supabase + EAS) |
|---|---|---|
| Deploy backend change | Edit in Manus webdev panel → Publish | `git push` to main → Render auto-deploys |
| Deploy schema change | Manus agent ran migrations | `DATABASE_URL=... pnpm drizzle-kit migrate` |
| Build new APK | Manus agent triggered EAS | You run `eas build` locally |
| Add a feature | Ask Manus agent | Edit code in your IDE, push, redeploy |
| Monitor errors | Manus agent reviewed logs | Open Render and Supabase dashboards |
| Rotate secrets | Manus webdev request_secrets (sometimes blocked) | Render env vars UI; rotate at will |
| Backup database | Manus internal | Supabase auto-backup; `pg_dump` manually |

You're now an independent operator. AI assistance is on-demand — you can use ChatGPT, Claude, Cursor, or any tool of your choice for code reviews, debugging, and feature work, because nothing in the repo requires Manus to function.

---

## What you can ask an agent for after migration

Even though the deploy is self-sufficient, agents (Manus or otherwise) remain useful for:

- **Code reviews** — paste a diff, ask for feedback.
- **Bug investigation** — paste a stack trace, ask what's likely wrong.
- **Feature implementation** — describe the feature, agent writes the code, you review and merge.
- **Schema changes** — describe the data model change, agent writes the migration, you apply it.
- **Test writing** — agent writes unit tests for code you point at.
- **Documentation** — agent updates DEPLOY.md or MAINTENANCE.md as the system evolves.

What agents *should not* do post-migration:

- Run anything in production. You're the operator. Agents propose; you dispose.
- Make schema changes without your review. Always inspect generated SQL before applying.
- Rotate secrets autonomously. Secret rotation is operator authority.

---

## Risk assessment and mitigation

The biggest risks during migration and how to mitigate them:

**Risk 1: data loss during the database migration.** You're not migrating *data* in this plan because the Manus deploy is for testing — there are no real users yet. If at some point you want to migrate real user data: take a `pg_dump` of the Manus MySQL DB first, study the type incompatibilities (especially around enums and JSON columns), write a one-off migration script, test on a copy first.

**Risk 2: Supabase Auth integration breaks the existing email+password flow.** Mitigated by Option A (keep dual auth) or Option B (migrate fully to Supabase Auth). Either way, test both flows on the test phone before merging.

**Risk 3: Render free-tier sleep affects user experience.** First request after sleep takes ~30 seconds. Mitigation: upgrade to paid tier ($7/month) before any real users hit it. The free tier is for migration testing only.

**Risk 4: EAS build picks up wrong env vars again.** This was the bug that produced the broken APK 10 in the Manus deploy. Mitigation: the env vars are now in `eas.json` directly, version-controlled, visible in code review. The build will fail loudly if any are missing.

**Risk 5: APK distributed to users locks them to a specific backend URL.** True — once you ship an APK, it's pointed at whatever URL was in `eas.json` at build time. Mitigation: keep `https://your-app.onrender.com` stable. If you ever need to migrate to another backend, build a new APK and ask users to update.

**Risk 6: Costs creep up over time.** Free tier is generous for testing but you'll outgrow it. Mitigation: set up billing alerts on Render and Supabase. Review monthly. Most utility-billing apps with under 1000 active users will fit comfortably in the $7-30/month range.

---

## When to ask for help

Stuck on a specific step? Some signals it's worth asking an agent or a human engineer:

- **You've been on the same step for 4+ hours.** Diminishing returns; get a fresh perspective.
- **Error messages reference internals you don't recognize.** Drizzle, Render, Supabase, and Expo all have detailed error messages, but some require background to interpret.
- **You're tempted to skip a verification step.** Don't. The verification steps are there because skipping them is what produced APK 10. Ask for help to understand *why* the step matters before deciding to skip.
- **The plan disagrees with your reading of the code.** I wrote this plan from a sandbox snapshot at v1.6.2. If your replica diverges (different commit, different files), the plan might miss something. Ask an agent to reconcile.

When asking for help, paste:
1. Which phase and step you're on.
2. What you did.
3. What happened (error message, unexpected output, etc.).
4. What you've tried.

A good question gets a 10x better answer than a vague "it's not working."

---

## Closing notes

This plan is a *blueprint*, not a *script*. It will not run itself. It will not adapt to surprises. You are the one driving execution, with agents as advisors when you need them.

The good news: every step in this plan has been done thousands of times by thousands of teams. None of it is novel or risky in isolation. The only thing that's specific to your situation is the *combination* — and that combination is a well-trodden path (React Native + Expo + tRPC + Postgres + Supabase + Render + EAS Build is a popular modern stack).

By the end of Phase 4, you'll have:

- A repo that anyone can deploy.
- A deploy that anyone can operate.
- Documentation that survives any agent (or any specific human, including you) leaving the project.
- Independence from any single platform vendor.

That's the whole point of doing this. Take your time. Don't skip verification steps. Commit often. Ask for help when stuck. You'll get there.

---

**Plan version:** 1.0
**Last reviewed:** 2026-05-27
**Next review:** when you complete Phase 1, OR when the repo's `package.json` adds new significant dependencies, OR when Render / Supabase / Expo change their pricing or APIs in ways that affect this plan
