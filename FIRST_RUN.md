# FIRST_RUN — Canonical Post-Clone Setup

This document is the **single source of truth** for what to do after cloning
`utility-billing-app` for the first time. If anything in `README.md`,
`AGENT_QUICKSTART.md`, `MANUS_HANDOFF.txt`, or `PUBLISHING.md` contradicts
this file, **this file wins** — please open a PR to fix the contradiction.

---

## 1. Prerequisites

You need:

- **Node.js 22.x** (matches the `packageManager` in `package.json`)
- **pnpm 9.12+** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- **git** (any modern version)
- A working internet connection (the install step pulls from npm + Expo's CDN)

You **do not** need a global install of `eas-cli`; the project uses the
local devDependency via `pnpm dlx eas-cli` / `npx eas-cli`.

---

## 2. Install

```bash
git clone https://github.com/jarrenmanusai/utility-billing-app.git
cd utility-billing-app
pnpm install --frozen-lockfile
```

The `pnpm install` step runs `simple-git-hooks install` automatically and
wires up the pre-commit env-conflict checker. If you are inside GitHub
Codespaces, the Manus webdev sandbox, or CI, the hook detects the
environment and skips silently — that is intentional.

---

## 3. Pre-flight verification (no secrets needed)

```bash
pnpm check       # tsc --noEmit, expects 0 errors
pnpm test        # vitest run, expects 79 passing across 9 files
pnpm verify:tests  # cross-checks the count against tests/SNAPSHOT.txt
```

If `pnpm verify:tests` reports drift, **stop**. Either tests were added
without updating `tests/SNAPSHOT.txt`, or tests were silently skipped.
Either way it is a deploy-blocker.

---

## 4. Stage operator secrets (one time, before deploy)

The repo never stores deploy credentials. Two paths:

### Path A — sandbox / one-shot deploy

Drop a file named `.secrets.local.txt` at the repo root, formatted like
`.secrets.template.txt`. It is `.gitignore`d. `scripts/load-env.js` parses
it on every Expo / server start, so you do not need to re-enter values.

Required keys:

- `EXPO_TOKEN` — get from <https://expo.dev/accounts/[your-account]/settings/access-tokens>
- `KEYSTORE_CHOICE` — `A` (let EAS manage), `B` (upload existing), or `C` (generate local)

Optional overrides:

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — first-boot admin account; defaults to
  `jarren.manusai@outlook.com` / `changeme-rotate-on-first-signin`
- `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` — accepted as
  aliases of the above for backward compatibility

### Path B — long-lived dev environment

Use your environment's secret manager (Codespaces secrets, GitHub Actions
secrets, system keychain) to export the same env vars. `scripts/load-env.js`
reads from the process environment first, `.secrets.local.txt` second, and
`.env` last.

---

## 5. Bootstrap the EAS projectId (first deploy only)

Already done for this repo: `app.config.ts` ships with
`extra.eas.projectId = "7631dad9-d6f2-4006-b56d-8104211175c3"`.

If you fork the repo or wipe the EAS project, run:

```bash
bash scripts/bootstrap-eas-projectid.sh
```

The script tries `npx eas-cli init --non-interactive` first and falls
back to a direct EAS API call if `eas-cli` cannot rewrite the dynamic
TypeScript config (which it cannot — that is fix C-3 in the audit).

**Do not run `eas init` interactively from a Manus sandbox.** It blocks
on a TTY prompt that never returns.

---

## 6. Pre-deploy audit

```bash
pnpm verify:deploy
```

This runs the full audit: version cross-check across the three sources,
admin email correctness, EAS projectId presence, ephemeral-URL detection,
keystore-choice validation, test snapshot, and a 3-attempt retry on
`/api/version`. Output format is `N passed, M failed`. **Zero failures
required** before clicking Publish.

---

## 7. Publish

Click **Publish** in the Manus webdev UI (header, top-right). It will:

1. Build the APK via EAS Build (production profile, JDK 21)
2. Provision a persistent `*.manus.space` domain for the server
3. Update `EXPO_PUBLIC_API_URL` in the published bundle

**Never run** `eas build` directly from a Manus sandbox shell — the
build is long-lived and the sandbox will hibernate before it finishes.

---

## 8. After a successful APK install

Tag the release per `TAGGING.md`:

```bash
git tag -a v1.x.y -m "Release notes here"
git push origin v1.x.y
```

Tags only ever go on commits that have produced an APK that installed
and launched successfully on a real device. **Never** tag a commit that
has not been physically installed.

---

## Common first-run failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm verify:tests` reports `0 passed` | wrong directory or `pnpm install` was skipped | `cd` to repo root, run `pnpm install` |
| `verify:deploy` says `KEYSTORE_CHOICE` invalid | Typo in `.secrets.local.txt` | must be exactly `A`, `B`, or `C` |
| `verify:deploy` flags `*.manus.computer` URL | `EXPO_PUBLIC_API_URL` still points at sandbox preview | publish first, then set the persistent `*.manus.space` URL |
| Pre-commit hook blocks commit in Codespaces | Old hook version cached | `pnpm install` again to refresh `simple-git-hooks` |
| `eas init` hangs | Run from a sandbox shell instead of the bootstrap script | `bash scripts/bootstrap-eas-projectid.sh` |

---

For deeper context, see `MANUS_HANDOFF.txt` (deploy contract),
`AGENT_QUICKSTART.md` (agent cheat-sheet), `PUBLISHING.md` (publish
order of operations), and `TAGGING.md` (when to tag).
