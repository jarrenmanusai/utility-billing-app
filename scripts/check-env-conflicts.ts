/**
 * scripts/check-env-conflicts.ts
 *
 * Pre-flight check that runs BEFORE `pnpm verify:deploy`.
 *
 * The Manus webdev sandbox auto-injects three env vars whose runtime
 * defaults violate this project's deploy contract:
 *
 *   - OAUTH_SERVER_URL   (must be empty/unset per MANUS_HANDOFF.txt §1)
 *   - OWNER_OPEN_ID      (must be empty/unset per MANUS_HANDOFF.txt §1)
 *   - JWT_SECRET (22ch)  (must be ≥32 chars per MANUS_HANDOFF.txt §4)
 *
 * This script detects those conflicts and prints the EXACT
 * `webdev_request_secrets` tool call the agent needs to make to
 * resolve them. See MANUS_HANDOFF.txt §4b for the full rationale.
 *
 * Exit code 0 → no conflicts, safe to continue.
 * Exit code 1 → conflicts present, agent must override before proceeding.
 *
 * Usage:
 *   pnpm check:env
 */
import "dotenv/config";

// v1.6.2: keys that the Manus runtime now classifies as built-in secrets
// and refuses webdev_request_secrets overrides for. Operators must edit
// these via the Settings → Secrets UI. The MANUS_RUNTIME_BUILTINS_LOCKED
// flag downgrades the related conflicts to non-blocking warnings.
const LOCKED_BUILTIN_KEYS = new Set(["OAUTH_SERVER_URL", "OWNER_OPEN_ID", "JWT_SECRET"]);
const BUILTINS_LOCKED =
  /^(1|true|yes|on)$/i.test(process.env.MANUS_RUNTIME_BUILTINS_LOCKED ?? "");

type Conflict = {
  key: string;
  reason: string;
  fix: string;
  /** True for keys the runtime refuses to let webdev_request_secrets edit. */
  lockedBuiltin?: boolean;
};
const conflicts: Conflict[] = [];

function generateStrongJwtSecret(): string {
  // Lazy require so this script stays self-contained and fast even if
  // node_modules is partially installed.
  const { randomBytes } = require("node:crypto");
  return randomBytes(48).toString("hex");
}

function checkOauthVars() {
  const url = process.env.OAUTH_SERVER_URL;
  const ownerOpenId = process.env.OWNER_OPEN_ID;

  // The OAuth gate in server/_core/index.ts requires BOTH URL and ownerOpenId
  // to be truthy before mounting routes. If only one is set, the gate is
  // already closed — we still surface it but as a softer note.
  const gateOpen = Boolean(url) && Boolean(ownerOpenId);

  if (url && gateOpen) {
    conflicts.push({
      key: "OAUTH_SERVER_URL",
      reason: `set to "${url}" with OWNER_OPEN_ID also set — OAuth gate is OPEN; MUST be empty/unset (MANUS_HANDOFF.txt §1)`,
      fix:
        `// LANE 1 (preferred):\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "OAUTH_SERVER_URL",\n    value: "",\n    preventMatching: true,\n    description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth"\n  }]\n})\n` +
        `// LANE 2 (fallback if Lane 1 returns "Cannot edit built-in secrets"):\n` +
        `//   Settings → Secrets → OAUTH_SERVER_URL → Edit → set value to empty string → Save\n` +
        `//   webdev_restart_server, re-run pnpm check:env\n` +
        `// LANE 3 (last resort, if UI also blocks):\n` +
        `//   Add MANUS_RUNTIME_BUILTINS_LOCKED=1 to .secrets.local.txt and confirm\n` +
        `//   with the operator that shipping with the OAuth gate open is acceptable.`,
      lockedBuiltin: true,
    });
  }

  if (ownerOpenId && gateOpen) {
    conflicts.push({
      key: "OWNER_OPEN_ID",
      reason: `set to "${ownerOpenId.slice(0, 8)}…" with OAUTH_SERVER_URL also set — OAuth gate is OPEN; MUST be empty/unset (MANUS_HANDOFF.txt §1)`,
      fix:
        `// LANE 1 (preferred):\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "OWNER_OPEN_ID",\n    value: "",\n    preventMatching: true,\n    description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth"\n  }]\n})\n` +
        `// LANE 2 (fallback if Lane 1 returns "Cannot edit built-in secrets"):\n` +
        `//   Settings → Secrets → OWNER_OPEN_ID → Edit → set value to empty string → Save\n` +
        `//   webdev_restart_server, re-run pnpm check:env\n` +
        `// LANE 3 (last resort): MANUS_RUNTIME_BUILTINS_LOCKED=1 (see OAUTH_SERVER_URL note above).`,
      lockedBuiltin: true,
    });
  }
}

function checkJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    conflicts.push({
      key: "JWT_SECRET",
      reason: "missing — required for session cookies, CAPTCHA HMAC, password resets",
      fix:
        `// Generate a fresh 96-char hex secret, then:\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "JWT_SECRET",\n    value: "<output of: node -e \\"console.log(require('crypto').randomBytes(48).toString('hex'))\\">",\n    preventMatching: true,\n    description: "Production JWT signing secret"\n  }]\n})`,
    });
    return;
  }
  if (secret.length < 32) {
    conflicts.push({
      key: "JWT_SECRET",
      reason: `len=${secret.length} (require ≥32 chars) — Manus runtime auto-injects a 22-char placeholder`,
      fix:
        `// Generate a fresh 96-char hex secret first:\n` +
        `//   node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))'\n` +
        `// LANE 1 (preferred):\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "JWT_SECRET",\n    value: "<paste 96-char hex here>",\n    preventMatching: true,\n    description: "Production JWT signing secret (overrides 22-char built-in)"\n  }]\n})\n` +
        `// LANE 2 (fallback if Lane 1 returns "Cannot edit built-in secrets"):\n` +
        `//   Settings → Secrets → JWT_SECRET → Edit → paste 96-char hex → Save\n` +
        `//   webdev_restart_server, re-run pnpm check:env\n` +
        `// LANE 3 (last resort, weak signing key in production):\n` +
        `//   Add MANUS_RUNTIME_BUILTINS_LOCKED=1 to .secrets.local.txt to acknowledge\n` +
        `//   that overrides are blocked. The deploy will proceed but session cookies\n` +
        `//   will use the runtime's 22-char placeholder — ROTATE on first opportunity.`,
      lockedBuiltin: true,
    });
  }
}

function checkApiUrlMismatch() {
  const url = process.env.EXPO_PUBLIC_API_URL;
  const legacy = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (url && legacy && url !== legacy) {
    conflicts.push({
      key: "EXPO_PUBLIC_API_URL ↔ EXPO_PUBLIC_API_BASE_URL",
      reason: `mismatch: _API_URL=${url}  ≠  _API_BASE_URL=${legacy}`,
      fix:
        `// Unset whichever is wrong (or set both to the production HTTPS URL):\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "EXPO_PUBLIC_API_URL",\n    value: "<production HTTPS URL>",\n    preventMatching: true,\n    description: "Public HTTPS URL of the deployed tRPC server"\n  }]\n})`,
    });
  }
}

/**
 * Flag ephemeral sandbox URLs as conflicts. The Manus webdev sandbox
 * exposes its dev server at `https://<port>-<hash>.manus.computer`.
 * That URL stops resolving as soon as the sandbox hibernates, so
 * shipping it baked into an APK guarantees the released app breaks
 * within minutes of the next deploy. Only `*.manus.space` (or a
 * customer-owned domain) should be used as `EXPO_PUBLIC_API_URL` for
 * a production build.
 */
function checkApiUrlEphemeral() {
  const url = process.env.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!url) return;
  if (/\.manus\.computer(\b|\/|$)/i.test(url)) {
    conflicts.push({
      key: "EXPO_PUBLIC_API_URL",
      reason: `ephemeral sandbox URL detected (${url}) — *.manus.computer expires when the sandbox hibernates and MUST NOT be shipped in an APK`,
      fix:
        `// 1) Click "Publish" in the Manus webdev UI (provisions a *.manus.space domain).\n` +
        `// 2) Once Publish completes, override with the *.manus.space URL:\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "EXPO_PUBLIC_API_URL",\n    value: "https://<your-app>-<id>.manus.space",\n    preventMatching: true,\n    description: "Stable production HTTPS URL of the deployed tRPC server"\n  }]\n})\n` +
        `// 3) Verify it returns the right version: curl https://<your-app>-<id>.manus.space/api/version`,
    });
  }
  if (/^http:\/\//i.test(url)) {
    conflicts.push({
      key: "EXPO_PUBLIC_API_URL",
      reason: `non-HTTPS URL (${url}) — Android cleartext traffic is blocked by default`,
      fix:
        `// Use the HTTPS variant of your production server:\n` +
        `webdev_request_secrets({\n  secrets: [{\n    key: "EXPO_PUBLIC_API_URL",\n    value: "https://<your-app>-<id>.manus.space",\n    preventMatching: true,\n    description: "Production HTTPS URL of the deployed tRPC server"\n  }]\n})`,
    });
  }
}

function main() {
  console.log("== check:env (pre-flight) ==");

  checkOauthVars();
  checkJwtSecret();
  checkApiUrlMismatch();
  checkApiUrlEphemeral();

  if (conflicts.length === 0) {
    console.log("  ✓  no env conflicts detected");
    if (BUILTINS_LOCKED) {
      console.log("  ⚠  MANUS_RUNTIME_BUILTINS_LOCKED=1 set; built-in checks will WARN (not fail) downstream.");
    }
    console.log("\nReady to run: pnpm verify:deploy");
    return;
  }

  // v1.6.2: separate locked-built-in conflicts from operator-fixable ones.
  const lockedConflicts = conflicts.filter((c) => c.lockedBuiltin);
  const fixableConflicts = conflicts.filter((c) => !c.lockedBuiltin);

  // If MANUS_RUNTIME_BUILTINS_LOCKED is set, locked conflicts become
  // warnings (still printed, but do not contribute to exit-code 1).
  const blockingCount = BUILTINS_LOCKED
    ? fixableConflicts.length
    : conflicts.length;

  console.log(
    `  ✗  ${conflicts.length} env conflict${conflicts.length > 1 ? "s" : ""} detected\n` +
      (BUILTINS_LOCKED && lockedConflicts.length > 0
        ? `      (${lockedConflicts.length} locked-built-in → WARN per MANUS_RUNTIME_BUILTINS_LOCKED=1; ${fixableConflicts.length} blocking)\n`
        : ``),
  );

  for (const c of conflicts) {
    const tag =
      c.lockedBuiltin && BUILTINS_LOCKED
        ? "WARN (locked built-in, acknowledged)"
        : c.lockedBuiltin
          ? "FAIL (locked built-in — see UI fallback)"
          : "FAIL";
    console.log(`    ─ [${tag}] ${c.key}: ${c.reason}`);
    console.log(`      FIX:`);
    for (const line of c.fix.split("\n")) {
      console.log(`        ${line}`);
    }
    console.log();
  }

  console.log("After applying overrides, run:");
  console.log("  webdev_restart_server({ brief: \"reload after secret override\" })");
  console.log("  pnpm check:env       # confirm conflicts cleared");
  console.log("  pnpm verify:deploy   # full audit");
  console.log("\nDO NOT edit scripts/load-env.js to delete or override env vars.");
  console.log("See MANUS_HANDOFF.txt §4b for the full rationale.");

  // Helpful one-liner for generating the JWT secret without leaving the shell:
  if (conflicts.some((c) => c.key === "JWT_SECRET")) {
    const example = generateStrongJwtSecret();
    console.log(`\nExample fresh JWT_SECRET (do not commit, copy into the tool call):`);
    console.log(`  ${example.slice(0, 16)}…${example.slice(-16)}  (${example.length} chars)`);
  }

  if (blockingCount === 0 && BUILTINS_LOCKED) {
    console.log(
      `\nAll remaining conflicts are locked built-ins acknowledged via\n` +
        `MANUS_RUNTIME_BUILTINS_LOCKED=1. Treating as warnings.`,
    );
    return; // exit 0
  }

  process.exit(1);
}

main();
