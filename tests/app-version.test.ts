import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { APP_VERSION, APP_NAME } from "../constants/app-version";

/**
 * Guards the app-version single source of truth.
 *
 * Catches three common slip-ups:
 *  1) Constant left empty or with placeholder
 *  2) Constant drifts from app.config.ts (Android versionName / iOS bundle short)
 *  3) Name still says "UtilityBill" instead of the current brand
 */
describe("app-version constants", () => {
  it("APP_VERSION is a non-empty semver-shaped string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("APP_NAME is set to the current brand 'UtilityFlow'", () => {
    expect(APP_NAME).toBe("UtilityFlow");
  });

  it("APP_VERSION matches the `version` field in app.config.ts", () => {
    const configPath = resolve(__dirname, "../app.config.ts");
    const source = readFileSync(configPath, "utf8");
    const match = source.match(/version:\s*"([^"]+)"/);
    expect(match, "Could not locate version in app.config.ts").not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });

  it("APP_VERSION matches the `version` field in package.json", () => {
    // The Manus Publish Mobile App card and EAS Build's Android
    // versionName / iOS CFBundleShortVersionString both read this field;
    // it MUST stay in lock-step with constants/app-version.ts.
    const pkgPath = resolve(__dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    expect(pkg.version, "package.json missing version field").toBeDefined();
    expect(pkg.version).toBe(APP_VERSION);
  });
});

describe("API base URL env var bridge", () => {
  // We assert against the pure helper directly so the test does not have
  // to import constants/oauth.ts (which transitively pulls in
  // expo-linking / react-native and breaks under vitest's vite
  // transform).
  const importHelper = async () => await import("../constants/api-url");

  it("reads EXPO_PUBLIC_API_URL (the canonical/documented name)", async () => {
    const { resolveApiBaseUrl } = await importHelper();
    expect(
      resolveApiBaseUrl({ EXPO_PUBLIC_API_URL: "https://docs-name.example.com" }),
    ).toBe("https://docs-name.example.com");
  });

  it("reads EXPO_PUBLIC_API_BASE_URL (the legacy name) when only that is set", async () => {
    const { resolveApiBaseUrl } = await importHelper();
    expect(
      resolveApiBaseUrl({ EXPO_PUBLIC_API_BASE_URL: "https://legacy-name.example.com" }),
    ).toBe("https://legacy-name.example.com");
  });

  it("prefers EXPO_PUBLIC_API_URL over EXPO_PUBLIC_API_BASE_URL when both are set", async () => {
    const { resolveApiBaseUrl } = await importHelper();
    expect(
      resolveApiBaseUrl({
        EXPO_PUBLIC_API_URL: "https://canonical.example.com",
        EXPO_PUBLIC_API_BASE_URL: "https://legacy.example.com",
      }),
    ).toBe("https://canonical.example.com");
  });

  it("returns empty string when neither var is set (caller falls back)", async () => {
    const { resolveApiBaseUrl } = await importHelper();
    expect(resolveApiBaseUrl({})).toBe("");
  });

  it("trims trailing slash(es)", async () => {
    const { resolveApiBaseUrl } = await importHelper();
    expect(
      resolveApiBaseUrl({ EXPO_PUBLIC_API_URL: "https://api.example.com/" }),
    ).toBe("https://api.example.com");
    expect(
      resolveApiBaseUrl({ EXPO_PUBLIC_API_URL: "https://api.example.com///" }),
    ).toBe("https://api.example.com");
  });
});
