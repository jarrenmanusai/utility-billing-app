# Agent Quickstart — UtilityFlow Redeploy

> **Read this BEFORE asking the operator anything.** This file lists the
> only two things you can legitimately ask. Everything else is already
> answered in `DEPLOY_CONFIG.json`.

## TL;DR — full deploy in 8 steps

```
1. Read DEPLOY_CONFIG.json (authoritative defaults)
2. pnpm install --frozen-lockfile
3. pnpm fix:env --pretty   →  feed JSON to webdev_request_secrets
   (this resolves OAUTH_SERVER_URL, OWNER_OPEN_ID, JWT_SECRET in one shot)
4. webdev_restart_server   (so the overrides take effect)
5. pnpm db:push && pnpm seed:admin && pnpm verify:deploy   (must be 12/12)
6. webdev_save_checkpoint → operator clicks Publish in UI
7. Set EXPO_PUBLIC_API_URL = the *.manus.space URL from step 6
   (via webdev_request_secrets, preventMatching:true)
8. Ask operator for EXPO_TOKEN + keystore choice (the ONLY two questions)
   then: npx eas-cli build --platform android --profile production
```

## The two questions you ARE allowed to ask

| # | Question | Why it can't be in the repo |
|---|---|---|
| 1 | **`EXPO_TOKEN`** | Personal Expo access token — never commit secrets |
| 2 | **Keystore choice (A/B/C)** | One-time deploy decision affecting forever; A=brand-new EAS-managed, B=reuse existing, C=BYO `.jks` |

**Combine both into a single `webdev_request_secrets` card** so the
operator answers once. Example:

```ts
webdev_request_secrets({
  brief: "Final two inputs needed for EAS Build",
  message: "Please paste your Expo token and pick a keystore strategy (A/B/C). See DEPLOY_PREREQUISITES.md §4 for keystore details.",
  secrets: [
    { key: "EXPO_TOKEN", description: "Personal Expo access token from https://expo.dev/accounts/<you>/settings/access-tokens" },
    { key: "KEYSTORE_CHOICE", description: "A = brand-new EAS-managed (first deploy ever) | B = reuse existing EAS-managed | C = BYO .jks (also need ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD)" }
  ]
})
```

If `KEYSTORE_CHOICE === "C"`, follow up with a second card asking for
the four keystore secrets in one shot.

## Things you MUST NOT ask

These are answered authoritatively in `DEPLOY_CONFIG.json` — re-asking
the operator is a defect:

- ❌ "What's the repo URL?" → `repo.url`
- ❌ "Which branch/tag?" → `repo.tagStrategy` (latest tag, fallback to main)
- ❌ "What's `DATABASE_URL`?" → `secrets.DATABASE_URL.source = manus-builtin`
- ❌ "What `JWT_SECRET` should I use?" → auto-generate via `pnpm fix:env`
- ❌ "What's the production API URL?" → derive from webdev Publish output
- ❌ "Should I enable Manus OAuth?" → **NEVER** — empty-string override
- ❌ "What app name?" → `UtilityFlow`
- ❌ "Build profile?" → `production` (`.apk`)
- ❌ "EAS image?" → `ubuntu-22.04-jdk-21-ndk-r27b`
- ❌ "Distribution channel?" → direct download (default)
- ❌ "Custom domain?" → no, use `*.manus.space`

## Reading order

1. `AGENT_QUICKSTART.md` (this file)
2. `DEPLOY_CONFIG.json` (locked defaults)
3. `MANUS_HANDOFF.txt` (full procedure including §4b override recipe)
4. `DEPLOY_PREREQUISITES.md` (only §4 keystore options matter — everything else is in DEPLOY_CONFIG.json)
5. `TAGGING.md` (post-deploy)

## Decision tree on every step

```
At every step, ask yourself:
  "Is the answer in DEPLOY_CONFIG.json?"
   ├── YES → use it; do NOT ask the operator
   └── NO  → is it EXPO_TOKEN or keystore choice?
              ├── YES → ask via webdev_request_secrets card
              └── NO  → STOP. You're about to ask something you shouldn't.
                       Re-read this file.
```

## When something genuinely goes wrong

If a step fails (e.g., `pnpm verify:deploy` reports something other
than 12/12 even after `pnpm fix:env`), report the exact error to the
operator and propose a fix — don't ask for permission to investigate,
just investigate. **One question for diagnosis is fine; ten questions
to gather config is not.**
