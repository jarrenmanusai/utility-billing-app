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
});
