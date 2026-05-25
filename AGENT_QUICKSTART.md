# Agent Quickstart — UtilityFlow Redeploy

> **Read this BEFORE asking the operator anything.** This file lists the
> only two things you can legitimately ask. Everything else is already
> answered in `DEPLOY_CONFIG.json`.

## TL;DR — full deploy in 9 steps

```
0. CRITICAL — overlay the real repo on top of the Manus webdev template:
     git clone --depth 1 --branch main \
         https://github.com/jarrenmanusai/utility-billing-app.git tmp_clone
     find . -mindepth 1 -maxdepth 1 \
         ! -name 'tmp_clone' ! -name '.manus-logs' ! -name '.npmrc' \
         ! -name 'node_modules' -exec rm -rf {} +
     shopt -s dotglob nullglob
     mv tmp_clone/* tmp_clone/.* . 2>/dev/null || true
     rmdir tmp_clone
     git rev-parse HEAD                # must be a6561ac or newer
     grep projectId app.config.ts      # must contain 7631dad9-d6f2-4006-b56d-8104211175c3
   If either check fails, STOP. (Skipping this step caused a previous
   deploy to publish the empty Manus template to *.manus.space.)
1. Read DEPLOY_CONFIG.json (authoritative defaults)
2. pnpm install --frozen-lockfile
3. pnpm fix:env --pretty   →  feed JSON to webdev_request_secrets
   (this resolves OAUTH_SERVER_URL, OWNER_OPEN_ID, JWT_SECRET in one shot)
4. webdev_restart_server   (so the overrides take effect)
5. pnpm db:push && pnpm seed:admin && pnpm verify:deploy   (must report 0 failures)
6. webdev_save_checkpoint → operator clicks Publish in UI
7. Set EXPO_PUBLIC_API_URL = the *.manus.space URL from step 6
   (via webdev_request_secrets, preventMatching:true)
8. Ask operator for EXPO_TOKEN + keystore choice (the ONLY two questions)
   then run NON-INTERACTIVE so EAS never prompts:
      EXPO_TOKEN=<from operator> \
        npx eas-cli build --platform android --profile production \
          --non-interactive --no-wait
   (eas.json sets `requireCommit: false`, so EAS_NO_VCS=1 is no longer required)
```

## CRITICAL: First-time-ever EAS bootstrap (one-time per project)

The **very first** EAS build for a project requires creating an EAS
`projectId` and uploading initial credentials. This step **cannot run
fully non-interactively** without prior setup. `pnpm verify:deploy`
includes a check for `extra.eas.projectId` in `app.config.ts`:

```ts
extra: {
  eas: { projectId: "<uuid>" }
}
```

If that field is missing, the audit fails with a paste-ready fix:

1. **Recommended:** the operator runs ONCE on their LOCAL machine the
   provided bootstrap script:
   ```
   export EXPO_TOKEN=<token>
   bash scripts/bootstrap-eas-projectid.sh
   ```
   The script wraps `eas init` with safety checks, auto-commits the
   new `projectId` into `app.config.ts`, and pushes to origin. See
   `EAS_BOOTSTRAP_README.txt` for the full operator-facing guide.
   After that, every future agent build is fully `--non-interactive`.

2. **Skip step:** the agent runs `pnpm verify:deploy`, sees the
   "EAS projectId configured" failure, prints the exact `eas init`
   command for the operator to run, and stops. Operator runs it locally,
   pushes, and the agent retries. This adds ONE extra round-trip but no
   sandbox hand-holding.

The agent must NEVER try to run `eas init` from inside the Manus
sandbox — it requires an interactive TTY for the project-naming prompt
and will hang or fail there.

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

If a step fails (e.g., `pnpm verify:deploy` reports any failure
after `pnpm fix:env`), report the exact error to the operator and
propose a fix — don't ask for permission to investigate, just
investigate. The pass count varies between 11 and 14 depending on
env state; only the failure count is contractual and MUST be 0.
**One question for diagnosis is fine; ten questions to gather
config is not.**
