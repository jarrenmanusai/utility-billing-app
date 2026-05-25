/**
 * scripts/fix-env-conflicts.ts
 *
 * Companion to `scripts/check-env-conflicts.ts`.
 *
 * Where `check:env` only DETECTS conflicts and prints human-readable
 * fix instructions, `fix:env` EMITS the exact JSON payload an agent
 * can feed to `webdev_request_secrets` to resolve every conflict in
 * one shot.
 *
 * It does NOT call any tool itself — the script is environment-agnostic
 * and can run from any sandbox. The agent is expected to take the
 * printed JSON and pass it as the `secrets` argument of
 * `webdev_request_secrets`.
 *
 * Usage:
 *   pnpm fix:env                 # prints JSON to stdout
 *   pnpm fix:env --pretty        # prints pretty-formatted JSON
 *   pnpm fix:env --include-jwt   # also include a freshly generated JWT_SECRET
 *
 * The `--include-jwt` flag is OPT-IN because writing a freshly minted
 * secret to stdout is the kind of thing that ends up in shell history
 * and chat logs. By default, the script emits a placeholder for
 * JWT_SECRET that the agent fills in via its own RNG.
 */
import "dotenv/config";

type SecretSpec = {
  key: string;
  value: string;
  preventMatching: true;
  description: string;
};

const args = new Set(process.argv.slice(2));
const PRETTY = args.has("--pretty");
const INCLUDE_JWT = args.has("--include-jwt");

function generateStrongJwtSecret(): string {
  const { randomBytes } = require("node:crypto");
  return randomBytes(48).toString("hex");
}

// v1.6.2: identify keys that the Manus runtime classifies as built-in
// secrets and refuses webdev_request_secrets overrides for. Treat these
// as "need UI fallback" rather than tool-payload entries.
const LOCKED_BUILTIN_KEYS = new Set(["OAUTH_SERVER_URL", "OWNER_OPEN_ID", "JWT_SECRET"]);

function buildFixSecrets(): { fixes: SecretSpec[]; lockedFallback: SecretSpec[] } {
  const fixes: SecretSpec[] = [];
  const lockedFallback: SecretSpec[] = [];

  function add(spec: SecretSpec) {
    if (LOCKED_BUILTIN_KEYS.has(spec.key)) {
      lockedFallback.push(spec);
    } else {
      fixes.push(spec);
    }
  }

  if (process.env.OAUTH_SERVER_URL) {
    add({
      key: "OAUTH_SERVER_URL",
      value: "",
      preventMatching: true,
      description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth",
    });
  }

  if (process.env.OWNER_OPEN_ID) {
    add({
      key: "OWNER_OPEN_ID",
      value: "",
      preventMatching: true,
      description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth",
    });
  }

  const jwt = process.env.JWT_SECRET ?? "";
  if (!jwt || jwt.length < 32) {
    add({
      key: "JWT_SECRET",
      value: INCLUDE_JWT ? generateStrongJwtSecret() : "<GENERATE_96_CHAR_HEX_AND_PASTE_HERE>",
      preventMatching: true,
      description: "Production JWT signing secret (overrides Manus runtime placeholder)",
    });
  }

  // EXPO_PUBLIC_API_URL drift: only emit a fix if BOTH names are set
  // and disagree. We deliberately do NOT auto-pick a value — the agent
  // must choose the canonical production URL.
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (apiUrl && apiBase && apiUrl !== apiBase) {
    add({
      key: "EXPO_PUBLIC_API_URL",
      value: "<PRODUCTION_HTTPS_URL>",
      preventMatching: true,
      description:
        "Public HTTPS URL of the deployed tRPC server (resolves _API_URL ↔ _API_BASE_URL drift)",
    });
  }

  return { fixes, lockedFallback };
}

function main() {
  const { fixes, lockedFallback } = buildFixSecrets();
  const totalCount = fixes.length + lockedFallback.length;

  if (totalCount === 0) {
    console.error("// No env conflicts detected. Nothing to fix.");
    console.error("// Ready to run: pnpm verify:deploy");
    process.exit(0);
  }

  // ---------------------------------------------------------------------
  // PRIMARY LANE — webdev_request_secrets payload (tool-fixable conflicts)
  // ---------------------------------------------------------------------
  if (fixes.length > 0) {
    const payload = { secrets: fixes };
    const output = PRETTY ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    console.error(`// === LANE 1: webdev_request_secrets (${fixes.length} override${fixes.length > 1 ? "s" : ""}) ===`);
    console.error(`// Pass this payload to webdev_request_secrets, then webdev_restart_server.`);
    console.error(``);
    console.log(output);
    console.error(``);
  } else {
    console.error(`// === LANE 1: webdev_request_secrets ===`);
    console.error(`// (none required — all conflicts are locked-built-in keys, see Lane 2)`);
    console.error(``);
  }

  // ---------------------------------------------------------------------
  // FALLBACK LANE — locked-built-in keys that webdev_request_secrets cannot
  // override. Print human instructions for the UI fallback path.
  // ---------------------------------------------------------------------
  if (lockedFallback.length > 0) {
    console.error(`// === LANE 2: locked built-in secrets (UI fallback) ===`);
    console.error(`// The Manus runtime refuses webdev_request_secrets for these keys:`);
    for (const s of lockedFallback) {
      const valuePreview =
        s.key === "JWT_SECRET" && !INCLUDE_JWT
          ? "<paste fresh 96-char hex from: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\">"
          : JSON.stringify(s.value);
      console.error(`//   - ${s.key}  →  ${valuePreview}`);
    }
    console.error(`//`);
    console.error(`// Operator action (cannot be done by the agent):`);
    console.error(`//   1. Open the Manus webdev panel → Settings → Secrets`);
    console.error(`//   2. For each key listed above, click Edit and paste the value.`);
    console.error(`//   3. webdev_restart_server({ brief: "reload after UI secret edit" })`);
    console.error(`//   4. pnpm verify:deploy   # confirm 0 failed`);
    console.error(`//`);
    console.error(`// If the UI also refuses edits, set MANUS_RUNTIME_BUILTINS_LOCKED=1 in`);
    console.error(`// .secrets.local.txt to acknowledge the constraint. The audit will`);
    console.error(`// downgrade these checks to WARN. Note: with OAuth still gate-open,`);
    console.error(`// /api/oauth/* WILL mount in production — confirm with the operator`);
    console.error(`// before shipping. JWT_SECRET will use the runtime placeholder —`);
    console.error(`// rotate at the earliest opportunity.`);
    console.error(``);
  }

  console.error(`// After applying both lanes (where applicable), run:`);
  console.error(`//   webdev_restart_server`);
  console.error(`//   pnpm verify:deploy`);
}

main();
