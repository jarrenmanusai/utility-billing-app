#!/usr/bin/env bash
# scripts/bootstrap-eas-projectid.sh
#
# ONE-TIME-ONLY bootstrap: creates the EAS project on expo.dev and
# injects extra.eas.projectId into app.config.ts. After this runs once
# successfully, every future `eas build` (including agent-driven ones in
# the Manus sandbox) can be fully `--non-interactive`.
#
# WHY THIS EXISTS:
#   `eas init` requires an interactive TTY (project-naming prompt) the
#   FIRST time it's invoked for a project. The Manus sandbox does not
#   have a real TTY — its terminal is a stream wrapped by the agent —
#   so this step structurally cannot be done from inside an agent run.
#   Run it ONCE on your local laptop, commit, push, then forget.
#
# USAGE (operator's local machine — NOT the Manus sandbox):
#   1. Clone the repo if you don't already have it:
#        git clone https://github.com/jarrenmanusai/utility-billing-app.git
#        cd utility-billing-app
#   2. Have your Expo personal access token ready
#      (https://expo.dev/accounts/<you>/settings/access-tokens).
#   3. Run:
#        export EXPO_TOKEN=<your-token>
#        bash scripts/bootstrap-eas-projectid.sh
#   4. Answer any prompts (typically: confirm the slug, confirm the owner).
#   5. The script auto-commits and pushes the new projectId.
#   6. You're done forever — every future agent build is hands-off.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- pre-flight checks -------------------------------------------------------

if [[ ! -f app.config.ts ]]; then
  echo "ERROR: app.config.ts not found. Run this from the repo root." >&2
  exit 1
fi

if grep -q "projectId" app.config.ts; then
  echo "✓ app.config.ts already has a projectId. Nothing to do."
  echo "  Current line:"
  grep -n "projectId" app.config.ts | sed 's/^/    /'
  exit 0
fi

if [[ -z "${EXPO_TOKEN:-}" ]]; then
  echo "ERROR: EXPO_TOKEN is not set." >&2
  echo "  Get one at https://expo.dev/accounts/<you>/settings/access-tokens" >&2
  echo "  Then: export EXPO_TOKEN=<paste-here>" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is not on PATH. Install Node.js 20+." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not on PATH." >&2
  exit 1
fi

echo "== EAS projectId bootstrap =="
echo "   Repo:        $(pwd)"
echo "   Branch:      $(git rev-parse --abbrev-ref HEAD)"
echo "   HEAD:        $(git rev-parse --short HEAD)"
echo

# --- run the bootstrap -------------------------------------------------------

echo "Step 1/3: invoking eas init (you may be asked to confirm the slug/owner)..."
echo

# `eas init` writes extra.eas.projectId into app.config.ts.
EXPO_TOKEN="$EXPO_TOKEN" npx --yes eas-cli@latest init

# --- verify the write --------------------------------------------------------

if ! grep -q "projectId" app.config.ts; then
  echo
  echo "ERROR: eas init completed but app.config.ts still has no projectId." >&2
  echo "  Run \`grep -n projectId app.config.ts\` to confirm. If empty, re-run." >&2
  exit 1
fi

NEW_PID=$(grep -oE 'projectId\s*:\s*['"'"'"][^'"'"'"]+['"'"'"]' app.config.ts | head -1 || true)
echo
echo "Step 2/3: projectId injected — $NEW_PID"

# --- commit & push -----------------------------------------------------------

echo
echo "Step 3/3: committing and pushing..."
git add app.config.ts
git commit -m "chore(eas): bootstrap projectId for non-interactive agent builds"
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo
echo "✓ DONE. The next agent run will pass \`pnpm verify:deploy\`'s"
echo "  EAS projectId check and proceed straight to non-interactive build."
