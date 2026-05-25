# Installing the GitHub Actions CI workflow

The Manus webdev agent cannot push files under `.github/workflows/` (GitHub
blocks that without explicit `workflow` scope on the auth token). So the CI
workflow must be added once, manually, by you. After that, every future
push runs lint / typecheck / tests / `check:env` automatically.

## One-time setup (~60 seconds)

1. Open https://github.com/jarrenmanusai/utility-billing-app
2. Click **Add file** -> **Create new file**
3. In the filename box, type: `.github/workflows/ci.yml`
   (note the leading dot - GitHub will autocomplete the directory)
4. Paste the contents of the YAML block below into the editor
5. Click **Commit changes...** -> **Commit directly to the `main` branch** -> **Commit changes**
6. Done. Future pushes will trigger the workflow automatically.

## Workflow file contents

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:
    name: Static checks (lint + typecheck + tests)
    runs-on: ubuntu-22.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm check
      - run: pnpm test

  verify-deploy-dry-run:
    name: verify-deploy (env-only checks, no DB)
    runs-on: ubuntu-22.04
    timeout-minutes: 5
    needs: static
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Cross-check version files
        run: |
          set -e
          PKG=$(node -p "require('./package.json').version")
          APP=$(grep -oP "APP_VERSION\s*=\s*['\"]\K[0-9.]+" constants/app-version.ts)
          if [ "$PKG" != "$APP" ]; then
            echo "::error::Version drift: package.json=$PKG vs APP_VERSION=$APP"
            exit 1
          fi
      - name: check:env
        env:
          JWT_SECRET: ci-dummy-jwt-secret-only-for-ci-must-be-32-chars-or-longer-aaaaaaaaa
        run: pnpm check:env
```

## Why we cannot auto-install this

The Manus webdev sandbox pushes commits using GitHub App credentials.
GitHub Apps cannot create or update files under `.github/workflows/`
unless they have the `workflows` permission, which the Manus app
deliberately doesn't request (defense in depth - prevents an agent from
adding a malicious workflow that exfiltrates secrets).

Adding it once via the web UI is the standard workaround.

## Verifying it works

After committing the workflow:

1. Go to the **Actions** tab on the repo
2. You should see a `ci` run kicking off for the previous commit
3. Wait ~3 minutes
4. Both jobs should pass green

If anything fails, the agent can reproduce locally with:
```
pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm check:env
```
