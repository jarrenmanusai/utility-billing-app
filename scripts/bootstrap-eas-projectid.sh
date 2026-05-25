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
#   Run it ONCE on your local laptop (or in a Codespace), commit, push,
#   then forget.
#
# WHY THE API FALLBACK EXISTS:
#   `eas init` will only auto-write extra.eas.projectId into static
#   (JSON) configs. If app.config.ts is a dynamic config (TypeScript),
#   eas-cli refuses with: "Cannot automatically write to dynamic config
#   at: app.config.ts". When that happens this script falls back to
#   the EAS API, fetches the projectId, and patches app.config.ts
#   itself so the operator never has to hand-edit.
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

echo "Step 1/4: invoking eas init (you may be asked to confirm the slug/owner)..."
echo

# `eas init` writes extra.eas.projectId into static (JSON) configs but
# refuses to touch dynamic (.ts) configs. We try it first; if it bails,
# we fall back to the API path below.
EXPO_TOKEN="$EXPO_TOKEN" npx --yes eas-cli@latest init || \
  echo "  (eas-cli init returned non-zero — will try API fallback below)"

# --- API fallback for dynamic-config writes ---------------------------------

if ! grep -q "projectId" app.config.ts; then
  echo
  echo "Step 2/4: eas init did not write to app.config.ts (dynamic config)."
  echo "          Falling back to API: fetching projectId from Expo and"
  echo "          patching app.config.ts directly..."
  PID=$(
    EXPO_TOKEN="$EXPO_TOKEN" npx --yes eas-cli@latest project:info --json 2>/dev/null \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(o.id||o.projectId||'')}catch(e){process.exit(1)}})" \
      || true
  )
  if [[ -z "$PID" ]]; then
    echo
    echo "ERROR: could not determine projectId from Expo API." >&2
    echo "  This usually means either:" >&2
    echo "    a) The project does not yet exist on Expo — re-run \`eas init\` and" >&2
    echo "       answer the interactive prompts to create it; OR" >&2
    echo "    b) Your EXPO_TOKEN does not have access to the project." >&2
    echo "  As a manual workaround, edit app.config.ts to add:" >&2
    echo "    extra: { eas: { projectId: \"<paste-uuid-from-expo.dev>\" } }," >&2
    echo "  near the top of the config object, then re-run this script." >&2
    exit 1
  fi
  PID="$PID" node -e "
    const fs=require('fs');
    let s=fs.readFileSync('app.config.ts','utf8');
    if (s.includes('projectId')) { console.log('  already patched'); process.exit(0); }
    const insert='  extra: { eas: { projectId: \\\"'+process.env.PID+'\\\" } },\n';
    if (/newArchEnabled:\s*true,/.test(s)) {
      s=s.replace(/(newArchEnabled:\s*true,)/, '\$1\n'+insert);
    } else if (/const\s+config\s*:\s*ExpoConfig\s*=\s*\{/.test(s)) {
      s=s.replace(/(const\s+config\s*:\s*ExpoConfig\s*=\s*\{)/, '\$1\n'+insert);
    } else {
      console.error('ERROR: could not find an insertion point in app.config.ts');
      process.exit(1);
    }
    fs.writeFileSync('app.config.ts', s);
    console.log('  ✓ patched app.config.ts');
  "
fi

# --- final verification ------------------------------------------------------

if ! grep -q "projectId" app.config.ts; then
  echo
  echo "ERROR: app.config.ts still has no projectId after init+fallback." >&2
  echo "  Run \`grep -n projectId app.config.ts\` to confirm. If empty, edit by hand:" >&2
  echo "    extra: { eas: { projectId: \"<uuid>\" } }" >&2
  exit 1
fi

NEW_PID=$(grep -oE 'projectId\s*:\s*['"'"'"][^'"'"'"]+['"'"'"]' app.config.ts | head -1 || true)
echo
echo "Step 3/4: projectId injected — $NEW_PID"

# --- commit & push -----------------------------------------------------------

echo
echo "Step 4/4: committing and pushing..."
git add app.config.ts
git commit -m "chore(eas): bootstrap projectId for non-interactive agent builds"
git push origin "$(git rev-parse --abbrev-ref HEAD)"

echo
echo "✓ DONE. The next agent run will pass \`pnpm verify:deploy\`'s"
echo "  EAS projectId check and proceed straight to non-interactive build."
