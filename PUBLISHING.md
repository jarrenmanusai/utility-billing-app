# UtilityBill — Android Build & Google Play Publishing Guide

This document explains how to take this Expo + React Native project from the Manus IDE to a published listing on the Google Play Store.

## 1. What You Already Have

The codebase you are reading is the **complete, runnable application**. It includes:

- A working Expo SDK 54 + React Native + TypeScript client (mobile + web preview)
- A Node/Express + tRPC backend with Drizzle ORM and MySQL
- Custom email/password authentication with role-based access (Landlord, Tenant, Admin)
- All 47 user-facing actions across the three roles, plus the 10 smart-billing automations (A1–A10)
- Database migrations applied to the managed database
- A simple, minimal, white-background UI per your design preference

You do **not** need to write any additional code to publish — the publishing pipeline below only requires configuration and asset preparation.

## 2. Building the APK / AAB

There are two supported paths. Choose the one that fits where you want the build to run.

### Path A — Publish from the Manus IDE (Recommended)

The Manus IDE has a **Publish** button (top-right of the preview panel) that triggers a hosted build for the current checkpoint. This produces the installable artifact for Android.

The steps are:

1. Open the Manus IDE for this project.
2. Confirm that a checkpoint has been saved with the latest changes (the most recent checkpoint card in the chat shows the **Publish** button).
3. Click **Publish**.
4. Wait for the build to finish. The IDE will surface the resulting download link.

This is the simplest path because it does not require installing the Android SDK or EAS CLI on your machine.

### Path B — Build Locally with EAS

If you prefer to drive the build from your own computer, use Expo Application Services (EAS). This requires a free Expo account.

```bash
# Install the EAS CLI
npm install -g eas-cli

# From the project root
eas login
eas build:configure
eas build --platform android --profile production
```

The first time you run `eas build`, EAS will offer to generate and store an upload keystore. Accept this — Google Play requires every release to be signed with a stable key, and EAS manages it for you securely.

The output of a production build is an **.aab** file (Android App Bundle). This is the format Google Play requires for new app listings since August 2021.

## 3. Pre-Publishing Checklist

Before you submit, confirm the following items in this repository:

| Area | File | What to verify |
|------|------|----------------|
| App name | `app.config.ts` → `env.appName` | Currently set to "UtilityBill" |
| Package id | `app.config.ts` → `androidPackage` | Auto-generated from the project name (e.g. `space.manus.utility.billing.app.t...`); change this only if you want a custom domain-style id |
| Version | `app.config.ts` → `version` | Bump on every release (e.g. `1.0.0` → `1.0.1`) |
| Icon | `assets/images/icon.png` | Square PNG, opaque white background (already in place) |
| Splash | `assets/images/splash-icon.png` | Mirror of icon (already in place) |
| Permissions | `app.config.ts` → `android.permissions` | Currently `POST_NOTIFICATIONS`; the app also requests camera/photo access at runtime through expo-image-picker |
| Backend URL | Server environment | The shipped app must point to a public backend URL, not a sandbox preview URL — see Section 5 |

## 4. Google Play Console Setup

You need a **Google Play Developer account** before you can publish. It is a one-time fee of US$25.

1. Visit <https://play.google.com/console/signup> and create the account.
2. In Play Console, click **Create app**.
3. Provide:
   - App name (must match `appName` in `app.config.ts`)
   - Default language
   - App or game
   - Free or paid
   - Acceptance of declarations
4. Under **App content**, complete:
   - **Privacy policy URL** — required. Host the policy on any public URL.
   - **App access** — if your app requires login (it does), provide demo credentials for Google's reviewers.
   - **Data safety form** — declare what user data your app collects. For UtilityBill that is: email, name, photos (meter and payment proof), and authentication tokens.
   - **Content rating** — fill out the questionnaire; UtilityBill should rate **Everyone**.
   - **Target audience** — adults.
   - **Ads** — declare whether you show ads (UtilityBill does not).
5. Under **Store listing**, upload:
   - Short description (max 80 characters)
   - Full description (max 4000 characters)
   - At least 2 phone screenshots (1080×1920 or similar portrait aspect)
   - A feature graphic (1024×500)
   - The high-res icon you already have

6. Under **Production → Releases**, click **Create new release**, then upload the `.aab` from Section 2. Write release notes, save, and submit for review.

Google's first-time review typically takes 1–7 days.

## 5. Backend Hosting

The app expects a server at the URL configured in `constants/oauth.ts → getApiBaseUrl()`. In development that resolves to a Manus sandbox URL, which is **not** suitable for a published app because sandboxes hibernate.

Before publishing, do **one** of the following:

- **Use Manus deploy** — Click the Manus IDE **Publish** button (Path A). The platform deploys the backend to a stable Cloud Run instance and rewrites the URL automatically.
- **Self-host** — Export the project, deploy the Node server to your own host (Cloud Run, Render, Fly.io, VPS, etc.), set the `EXPO_PUBLIC_API_BASE_URL` environment variable to the public URL, and rebuild.

## 6. Updating the App

For every new release:

1. Bump `version` in `app.config.ts` (e.g. `1.0.0` → `1.0.1`).
2. Rebuild the AAB (Path A or Path B).
3. In Play Console, create a new release in the same track and upload the new AAB.
4. Inside the app, sign in as the admin owner and use the **APK** tab to record the new release URL. Tenants and landlords will see an in-app prompt the next time the app polls for updates.

## 7. Local Testing Before Publishing

You can verify the app on your own Android device without going through Google Play:

```bash
# In the project root
npm install -g eas-cli
eas build --platform android --profile preview
```

This produces an `.apk` (not `.aab`) that you can install by downloading it onto your phone and tapping the file. Use this for QA before promoting to a production release.

## 8. Support Files in This Repository

| Path | Purpose |
|------|---------|
| `app.config.ts` | Expo build configuration (icon, splash, permissions, plugins) |
| `eas.json` (auto-created by `eas build:configure`) | EAS build profiles (development, preview, production) |
| `drizzle/` | Database schema and migrations |
| `server/` | tRPC API, auth, storage, LLM, OCR |
| `app/` | All client screens (auth, landlord, tenant, admin) |
| `tests/` | Vitest tests covering auth.logout, currency formatting (A7), and smart billing math (A3/A5/A6) |
| `design.md` | Design specification (screens, flows, colors) |
| `todo.md` | Feature checklist with completion status |

## 9. Quick Reference

| Action | How |
|--------|-----|
| Run dev server | `pnpm dev` |
| Run tests | `pnpm test` |
| Type-check | `pnpm check` |
| Apply DB migrations | `pnpm db:push` |
| Build Android (EAS) | `eas build --platform android --profile production` |
| Build Android (Manus) | Click **Publish** in the IDE header |

---

If anything in this guide is unclear, ping me with the specific step you are on and I can walk you through it.
