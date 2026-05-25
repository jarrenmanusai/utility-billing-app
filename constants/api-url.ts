/**
 * Pure, dependency-free helper that resolves the public API base URL from
 * environment variables. Extracted from constants/oauth.ts so it can be
 * unit-tested in isolation (without pulling in expo-linking / react-native).
 *
 * Resolution order (first non-empty wins):
 *   1. EXPO_PUBLIC_API_URL          ← canonical name (MANUS_HANDOFF.txt)
 *   2. EXPO_PUBLIC_API_BASE_URL     ← legacy name (older code)
 *
 * Returns "" when neither is set so callers can fall back to relative URLs
 * or platform-specific derivation (e.g. window.location on web).
 *
 * Also exposes `normalizeApiBaseUrl` which trims trailing slashes — kept
 * separate so the raw resolution and the trim step can be tested
 * independently.
 */

export function readApiBaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.EXPO_PUBLIC_API_URL ?? env.EXPO_PUBLIC_API_BASE_URL ?? "";
}

export function normalizeApiBaseUrl(raw: string): string {
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  return normalizeApiBaseUrl(readApiBaseUrlFromEnv(env));
}
