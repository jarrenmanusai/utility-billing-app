/**
 * Custom environment loader that prioritizes system environment variables
 * over .env file values. This ensures that Manus platform-injected variables
 * are not overridden by placeholder values in .env
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a key=value file into process.env (only setting keys that aren't already set).
 * Used for .env (committed defaults) and .secrets.local.txt (operator pre-stage).
 * The first call wins per key — i.e., earlier files take precedence over later ones.
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, ""); // strip optional quotes
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Precedence (highest to lowest):
//   1. Already-set system env (Manus runtime, shell exports) — NEVER overridden
//   2. .env (committed defaults)
//   3. .secrets.local.txt (operator-pre-staged, gitignored)
//
// We load .env first so committed defaults take precedence over local secret
// files (which is the standard 12-factor pattern: defaults committed, real
// values supplied per-environment). For operator-supplied secrets like
// EXPO_TOKEN that don't appear in .env at all, .secrets.local.txt fills them.
loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), ".secrets.local.txt"));
loadEnvFile(path.resolve(process.cwd(), ".secrets.local"));

// Map system variables to Expo public variables.
// Notes:
//   * The new canonical API URL var is EXPO_PUBLIC_API_URL (per
//     MANUS_HANDOFF.txt + DEPLOY_PREREQUISITES.md). Older code reads
//     EXPO_PUBLIC_API_BASE_URL. We bridge the two in BOTH directions so
//     either name works regardless of which one the operator set.
//   * OAuth-era keys are kept for backward compatibility but production
//     deploys must leave OAUTH_SERVER_URL / OWNER_OPEN_ID UNSET (enforced
//     by `pnpm verify:deploy`).
const mappings = {
  VITE_APP_ID: "EXPO_PUBLIC_APP_ID",
  VITE_OAUTH_PORTAL_URL: "EXPO_PUBLIC_OAUTH_PORTAL_URL",
  OAUTH_SERVER_URL: "EXPO_PUBLIC_OAUTH_SERVER_URL",
  OWNER_OPEN_ID: "EXPO_PUBLIC_OWNER_OPEN_ID",
  OWNER_NAME: "EXPO_PUBLIC_OWNER_NAME",
};

for (const [systemVar, expoVar] of Object.entries(mappings)) {
  if (process.env[systemVar] && !process.env[expoVar]) {
    process.env[expoVar] = process.env[systemVar];
  }
}

// Two-way bridge between EXPO_PUBLIC_API_URL and EXPO_PUBLIC_API_BASE_URL.
// Whichever the operator sets, the other gets the same value so every
// runtime (server, client, EAS build) reads a consistent URL.
if (process.env.EXPO_PUBLIC_API_URL && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  process.env.EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;
}
if (process.env.EXPO_PUBLIC_API_BASE_URL && !process.env.EXPO_PUBLIC_API_URL) {
  process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
}
