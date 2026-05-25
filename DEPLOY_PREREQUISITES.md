# DEPLOY_PREREQUISITES.md

> Things the **operator (human)** must hand to the next Manus agent **once** before any deployment can proceed. Without these the agent will be blocked and have to ask. Hand them to the agent in chat (or upload them as files); the agent stores them via `webdev_request_secrets` and never commits them to the repo.

The list below is the **complete** set. Provide them all upfront and the agent can finish the deploy with zero further intervention beyond a single review at the end.

---

## 1. Source-code access

| Item | Why | Notes |
|---|---|---|
| Git repo URL **or** a `.zip` of the working tree | The agent has to clone the codebase before doing anything. | Public HTTPS clone URL is easiest. If private, attach a deploy key or a personal access token (treat as a secret). |
| Branch / tag to build | "Always the latest tag" is the policy, but if no tags exist yet, tell the agent which branch HEAD to use (usually `main`). | If the repo has zero tags, also tell the agent **what version string to assume** (e.g. "tag `main` as `v1.6.0`"). |

---

## 2. Database

You can choose any of these — the agent only needs a `DATABASE_URL` it can write to.

| Option | What you provide | Cost |
|---|---|---|
| **Manus webdev built-in MySQL** (recommended) | Nothing — the agent provisions it automatically when initialising the webdev project. | Included with Manus. |
| PlanetScale / Railway / RDS / etc. | A full `mysql://user:pass@host:3306/db?ssl=true` connection string with **CREATE/DROP/ALTER** privileges. | Whatever the provider charges. |
| Self-hosted MySQL 8 | A connection string + ensure the server is reachable from the Manus runtime (public IP / VPN / SSH tunnel). | Server-hosting cost. |

**Required version: MySQL 8.0+ with `utf8mb4` / `utf8mb4_unicode_ci`.**

---

## 3. Secrets

The agent will store these via `webdev_request_secrets` so they're injected at runtime but never written to the repo. Provide a value for each that's marked **REQUIRED**.

| Key | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | REQUIRED | From section 2. |
| `JWT_SECRET` | REQUIRED | A 64-byte random hex string. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and hand it to the agent — or tell the agent to generate one and just keep a copy for backup. |
| `EXPO_PUBLIC_API_URL` | REQUIRED | The public HTTPS URL where the **server** will live (e.g. `https://utilitybill-gfmmgjuu.manus.space`). The agent bakes this into the APK at build time. |
| `ADMIN_PASSWORD` | optional | Override the bootstrap admin password before the agent seeds. Default is `030921manusai!@!` and rotates on first sign-in either way. |
| `OAUTH_SERVER_URL` | MUST BE UNSET | Leave blank. Setting this re-enables Manus OAuth. |
| `OWNER_OPEN_ID` | MUST BE UNSET | Leave blank. Same reason. |
| `BUILT_IN_FORGE_API_URL` | optional | Auto-populated on Manus webdev — no action needed. |
| `BUILT_IN_FORGE_API_KEY` | optional | Same. |

---

## 4. Android signing keystore (CRITICAL — easy to get wrong)

If users have already installed a previous APK signed with a specific keystore, **the new APK MUST be signed with the same keystore** or every existing user will see "App not installed" when they try to upgrade.

Pick **exactly one** of the three paths below and tell the agent which:

### A. EAS-managed keystore (recommended for first deploy)
The agent creates a new keystore through EAS the first time it runs `eas build`. You authorise it once.

> "Use EAS-managed credentials. This is the first APK; no existing keystore exists."

### B. Existing EAS-managed keystore
You've already deployed via EAS in the past. The agent reuses the keystore stored in your EAS account.

> "Reuse the existing EAS-managed keystore on Expo account `<your-account>`."

You also need to provide an `EXPO_TOKEN` (Expo personal access token with `Owner` permission for that account).

### C. Bring-your-own keystore
You have a `.jks` or `.keystore` file from a previous build (Play Store deploys, etc.).

> "Use the attached keystore." — and attach the file plus these four values, treated as secrets:
>
> - `ANDROID_KEYSTORE_BASE64` (the keystore file, base64-encoded)
> - `ANDROID_KEYSTORE_PASSWORD`
> - `ANDROID_KEY_ALIAS`
> - `ANDROID_KEY_PASSWORD`

The agent imports it into EAS via `eas credentials` and keeps it in the EAS-managed credentials store.

---

## 5. Expo / EAS account

| Item | Required? | Notes |
|---|---|---|
| Expo account (free) | REQUIRED | Sign up at expo.dev. Tell the agent the account slug. |
| `EXPO_TOKEN` (personal access token) | REQUIRED | Generate at https://expo.dev/accounts/[username]/settings/access-tokens. The agent uses it for `eas login` non-interactively. Treat as a secret. |
| EAS Build credits | REQUIRED | Free tier includes ~30 builds/month. Production-grade workloads may need a paid plan. |

---

## 6. Distribution path for the **first** APK

Once the APK is built, how do end-users install it the very first time? After that, the in-app updater takes over — but the first install needs an external channel.

Pick one and tell the agent:

| Channel | What you do |
|---|---|
| **Direct download link** | The agent uploads the APK to your storage (S3 / Manus storage proxy) and gives you a URL to share. |
| **Google Play Internal Testing** | You provide a Play Console account + service-account JSON; the agent runs `eas submit`. |
| **Email / Drive / Slack** | The agent hands you the `.apk` file; you distribute manually. |

---

## 7. Optional: domain

| Item | Notes |
|---|---|
| Custom domain for the API (e.g. `api.utilityflow.app`) | Optional. If absent, the Manus-issued `*.manus.space` URL is used and baked into the APK. Switching domains later requires a rebuild. |

---

## Quick checklist (paste this into chat with the agent)

```
[ ] Repo URL: ________________________
[ ] Branch/tag to build: ____________
[ ] DATABASE_URL: ____________________ (or "use Manus built-in")
[ ] JWT_SECRET: ______________________ (or "generate one")
[ ] EXPO_PUBLIC_API_URL: _____________
[ ] EXPO_TOKEN: ______________________
[ ] Keystore path (A / B / C from §4): ___
[ ] First-install channel (§6): ______
[ ] Custom domain (optional): _________
```

When every line above has a value, the agent can run end-to-end with no further questions.
