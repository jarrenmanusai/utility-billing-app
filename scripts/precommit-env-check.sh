#!/usr/bin/env bash
# scripts/precommit-env-check.sh
#
# Pre-commit hook that runs `pnpm check:env` ONLY on developer
# workstations — not inside the Manus webdev sandbox (which
# auto-injects OAUTH_SERVER_URL etc. and would block every checkpoint).
#
# Skip conditions (any one of these → skip silently):
#   - Manus sandbox env detected (DEPLOY_WASMER_OWNER, MANUS_RUN_ID,
#     or /opt/.manus exists)
#   - User explicitly opted out: MANUS_PRECOMMIT_SKIP=1
#   - CI environment: CI=true or GITHUB_ACTIONS=true
#
# Otherwise the hook fails the commit if `pnpm check:env` reports
# conflicts, and prints exactly how to fix them.

set -e

if [[ "${MANUS_PRECOMMIT_SKIP:-}" == "1" ]]; then
  exit 0
fi

if [[ -n "${DEPLOY_WASMER_OWNER:-}" ]] || [[ -n "${MANUS_RUN_ID:-}" ]] || [[ -d "/opt/.manus" ]]; then
  # Inside Manus webdev sandbox — skip the env conflict check, since
  # the sandbox runtime injects values that the deploy contract
  # forbids. The agent handles those via webdev_request_secrets at
  # deploy time, not at commit time.
  exit 0
fi

if [[ "${CI:-}" == "true" ]] || [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  exit 0
fi

# Local developer machine — run the check.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[precommit] pnpm not found — skipping env check"
  exit 0
fi

if [[ ! -f scripts/check-env-conflicts.ts ]]; then
  echo "[precommit] check-env-conflicts.ts missing — skipping"
  exit 0
fi

echo "[precommit] Running pnpm check:env (set MANUS_PRECOMMIT_SKIP=1 to skip)…"
if ! pnpm --silent check:env; then
  echo
  echo "[precommit] Env conflicts detected. See output above."
  echo "[precommit] To bypass once:    MANUS_PRECOMMIT_SKIP=1 git commit ..."
  echo "[precommit] To bypass always:  git commit --no-verify"
  echo "[precommit] To resolve:        run pnpm fix:env, then apply via webdev_request_secrets"
  exit 1
fi
