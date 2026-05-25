# UtilityFlow — Release Tagging Procedure

> **Tag releases AFTER a successful APK ships, not before.** A tag that
> points at code which never produced a working APK is worse than no
> tag — `MANUS_HANDOFF.txt §0` instructs the next agent to clone the
> "latest tag", and a bad tag silently pins them to broken code.

## When to tag

Tag **only when ALL of the following are true**:

1. `package.json`, `app.config.ts`, and `constants/app-version.ts` all
   agree on the same version (verified by `pnpm verify:deploy`).
2. `pnpm verify:deploy` reports **0 failures** in a clean
   production-shape env (DATABASE_URL set, JWT_SECRET ≥32 chars,
   OAUTH_SERVER_URL + OWNER_OPEN_ID empty/unset, EXPO_PUBLIC_API_URL set).
3. The tRPC server is deployed and `curl https://<domain>/api/version`
   returns the matching version.
4. The Android APK has been built via `eas build --platform android
   --profile production` and **at least one successful install** has
   been confirmed (sign-in works end-to-end).
5. `pnpm test` reports all tests passing.

If any of the above is false, **do not tag**. Bump `app-version.ts` /
`app.config.ts` / `package.json` to the next patch version and re-deploy.

## How to tag

After all the conditions above are met:

```bash
# Locally or in the sandbox
cd /path/to/utility-billing-app
git fetch --all
git checkout main
git pull --ff-only origin main

# Confirm the version one more time
node -e "console.log(require('./package.json').version)"
# → 1.6.0

# Create an annotated tag (NOT a lightweight tag — annotated tags
# carry the message and are signed-able)
git tag -a v1.6.0 -m "Release v1.6.0

- Native Android APK distribution
- Email + password authentication only (no Manus OAuth)
- 3 Drizzle migrations applied (0000-0002)
- Server domain: <fill in *.manus.space URL after publish>
- APK SHA-256: <fill in after EAS Build completes>
"

# Push the tag (mirror to BOTH remotes)
git push origin v1.6.0
git push user_github v1.6.0
```

## How the tag is consumed

The next Manus agent / human dev follows `MANUS_HANDOFF.txt §0` step 2:

> Clone the repo. ALWAYS check out the LATEST tag (vX.Y.Z). If the
> repo has zero tags, build from `main` and tag it as the current
> `constants/app-version.ts` value before proceeding.

So a correctly placed tag means the next deploy clones a known-good
checkpoint. A bad tag means the next deploy clones broken code.

## Rolling back a bad tag

If you discover *after* tagging that the release is broken (rare —
`verify:deploy` should catch most issues):

```bash
# Delete locally
git tag -d v1.6.0

# Delete on both remotes
git push origin :refs/tags/v1.6.0
git push user_github :refs/tags/v1.6.0
```

Then bump to the next patch version (e.g., `1.6.1`) before re-tagging.
**Do not re-use a tag name** that pointed at different code — anyone
who fetched the bad tag will silently keep the broken version.

## Tag history

| Tag | Date | APK SHA-256 | Server domain | Notes |
|-----|------|-------------|---------------|-------|
| (none yet) | — | — | — | Pending first successful APK ship |

(Update this table on every successful tag.)
