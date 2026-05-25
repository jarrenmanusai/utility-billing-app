/**
 * Single source of truth for the displayed app version.
 *
 * Bump this constant whenever a new release is deployed.
 * Also keep `version` in app.config.ts in sync — that one is used by the native
 * build system (Android versionName / iOS CFBundleShortVersionString), while
 * this constant is used by the in-app UI (About screen, headers, debug strings).
 *
 * Why a separate constant?
 *  - In web preview / hot-reload, `Constants.expoConfig.version` is read once at
 *    bundle time and can stale. Reading from this module guarantees the value
 *    is always re-evaluated on each render.
 *  - Keeping a hand-bumped string makes the changelog explicit per release.
 */
export const APP_VERSION = "1.2.2";
export const APP_NAME = "UtilityFlow";
export const APP_TAGLINE = "Smart Utility Billing for Landlords";
export const APP_AUTHOR = "John Warren Perez";
