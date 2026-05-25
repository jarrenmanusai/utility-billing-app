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

function buildFixSecrets(): SecretSpec[] {
  const fixes: SecretSpec[] = [];

  if (process.env.OAUTH_SERVER_URL) {
    fixes.push({
      key: "OAUTH_SERVER_URL",
      value: "",
      preventMatching: true,
      description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth",
    });
  }

  if (process.env.OWNER_OPEN_ID) {
    fixes.push({
      key: "OWNER_OPEN_ID",
      value: "",
      preventMatching: true,
      description: "MUST be empty per MANUS_HANDOFF.txt §1 — disables Manus OAuth",
    });
  }

  const jwt = process.env.JWT_SECRET ?? "";
  if (!jwt || jwt.length < 32) {
    fixes.push({
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
    fixes.push({
      key: "EXPO_PUBLIC_API_URL",
      value: "<PRODUCTION_HTTPS_URL>",
      preventMatching: true,
      description:
        "Public HTTPS URL of the deployed tRPC server (resolves _API_URL ↔ _API_BASE_URL drift)",
    });
  }

  return fixes;
}

function main() {
  const secrets = buildFixSecrets();

  if (secrets.length === 0) {
    console.error("// No env conflicts detected. Nothing to fix.");
    console.error("// Ready to run: pnpm verify:deploy");
    process.exit(0);
  }

  // The shape matches webdev_request_secrets({ secrets: [...] })
  const payload = { secrets };
  const output = PRETTY ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);

  // Print a brief instruction header to stderr so it doesn't pollute
  // the JSON when piped to a tool.
  console.error(`// Pass this payload to webdev_request_secrets:`);
  console.error(`//   ${secrets.length} override${secrets.length > 1 ? "s" : ""} required`);
  if (!INCLUDE_JWT && secrets.some((s) => s.key === "JWT_SECRET")) {
    console.error(
      `// JWT_SECRET placeholder is intentional — replace with: $(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")`,
    );
    console.error(
      `// Or re-run: pnpm fix:env --include-jwt   (be aware: secret will appear in shell output)`,
    );
  }
  console.error(`// After applying, run: webdev_restart_server then pnpm verify:deploy`);
  console.error(``);

  // The actual payload goes to stdout so it can be piped:
  //   pnpm fix:env --pretty | tee fix-payload.json
  console.log(output);
}

main();
