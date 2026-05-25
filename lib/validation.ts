/**
 * Shared validators for landlord registration and admin tenant creation.
 *
 * Both the React Native client and the tRPC server import from this file so
 * the same rules run on both sides — preventing "passes on client but fails
 * on server" surprises and keeping the user-facing error messages consistent.
 *
 * Two concerns are handled here:
 *
 *  1. Philippine mobile numbers (PH only)
 *     - Accepted input formats:
 *         +63 9XX XXX XXXX     (E.164 with country code, optional spaces)
 *         09XX XXX XXXX        (local format, optional spaces)
 *         63 9XX XXX XXXX      (without leading +, treated as +63...)
 *     - Real PH mobile prefixes start with `9` (the digit after +63 / 0).
 *       PLDT/Smart/Globe/DITO etc. all use a 10-digit subscriber number
 *       beginning with 9. We deliberately reject landlines (2..8) since
 *       admins want a reachable mobile.
 *     - Output: a single canonical E.164 string (`+639XXXXXXXXX`, 13 chars)
 *       that's stored in the DB regardless of input format. This makes
 *       lookups, deduplication, and SMS sending trivial.
 *
 *  2. "Legitimate" email
 *     - Rejects obvious typos (e.g. `me@gmial.con`) by:
 *         a) requiring exactly one `@` with non-empty local + domain parts
 *         b) requiring at least one `.` in the domain part
 *         c) requiring a TLD that is alphabetic and at least 2 chars
 *         d) banning consecutive dots, leading/trailing dots, and spaces
 *         e) banning common throwaway/disposable mail providers
 *     - We can't actually *prove* an inbox exists without sending mail, but
 *       these checks weed out the vast majority of fat-fingered submissions.
 */

// ---------------------------------------------------------------------------
// Phone (Philippines)
// ---------------------------------------------------------------------------

/** Strict E.164 form for a PH mobile number. */
export const PH_E164_REGEX = /^\+639\d{9}$/;

/**
 * Normalise any user-entered PH mobile number to canonical E.164.
 *
 * Returns `null` when the input is not a valid PH mobile number (the caller
 * should surface a friendly error). Whitespace, dashes, and parentheses are
 * tolerated in input.
 *
 * @example
 * normalizePhPhone("0917 555 1234")   // "+639175551234"
 * normalizePhPhone("+63 917-555-1234") // "+639175551234"
 * normalizePhPhone("63 9175551234")    // "+639175551234"
 * normalizePhPhone("0817 555 1234")    // null  (landline prefix)
 * normalizePhPhone("0917555123")       // null  (too short)
 */
export function normalizePhPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  // Strip everything that isn't a digit or a leading +.
  const trimmed = raw.replace(/[\s\-()]/g, "").trim();
  if (!trimmed) return null;

  let digits: string;
  if (trimmed.startsWith("+63")) {
    digits = trimmed.slice(3);
  } else if (trimmed.startsWith("63")) {
    // User typed "63 9..." without the +. We accept it.
    digits = trimmed.slice(2);
  } else if (trimmed.startsWith("09")) {
    // Local form: drop the leading 0 → 9XXXXXXXXX
    digits = trimmed.slice(1);
  } else {
    return null;
  }

  // Must now be exactly 10 digits beginning with 9 (PH mobile range).
  if (!/^9\d{9}$/.test(digits)) return null;

  return "+63" + digits;
}

/**
 * Type guard: is this string a valid PH mobile number in any accepted form?
 * Use for boolean checks; use `normalizePhPhone` when you need the canonical
 * value to store.
 */
export function isValidPhPhone(raw: string): boolean {
  return normalizePhPhone(raw) !== null;
}

/**
 * Live formatter for the registration form. Takes the raw text the user has
 * typed and returns a human-readable string with grouping (e.g. spacing every
 * 3-3-4 digits in the local segment) **without** changing what they typed
 * fundamentally — they can still see/correct their input.
 *
 * We deliberately keep this lightweight: just enforce a `+63 ` prefix when
 * the user starts with `+`, and add hair spaces between digit groups.
 */
export function formatPhPhoneInput(raw: string): string {
  // Allow only digits and a single leading +.
  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.indexOf("+") > 0) cleaned = cleaned.replace(/\+/g, "");

  if (cleaned.startsWith("+63")) {
    const rest = cleaned.slice(3).slice(0, 10);
    const a = rest.slice(0, 3);
    const b = rest.slice(3, 6);
    const c = rest.slice(6, 10);
    return ["+63", a, b, c].filter(Boolean).join(" ");
  }
  if (cleaned.startsWith("09")) {
    const rest = cleaned.slice(0, 11);
    const a = rest.slice(0, 4);
    const b = rest.slice(4, 7);
    const c = rest.slice(7, 11);
    return [a, b, c].filter(Boolean).join(" ");
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Disposable / throwaway domains we never want as a registration email.
 * Not exhaustive — these are the most-abused free temp-mail services we've
 * seen in the wild. Add to this list as needed.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "yopmail.com",
  "trashmail.com",
  "tempmail.com",
  "temp-mail.org",
  "fakeinbox.com",
  "getnada.com",
  "maildrop.cc",
  "throwawaymail.com",
  "mintemail.com",
  "spamgourmet.com",
  "dispostable.com",
  "mohmal.com",
  "moakt.com",
  "mailcatch.com",
  "tempr.email",
  "emailondeck.com",
]);

/**
 * Common typo'd TLDs that nearly always indicate a fat-finger
 * (".con" instead of ".com" etc.). We reject these explicitly so the user is
 * forced to fix the typo rather than getting a "no such inbox" later.
 */
const TLD_TYPOS = new Set([
  "con", // .com
  "vom", // .com
  "comm", // .com
  "cim", // .com
  "ney", // .net
  "nrt", // .net
  "ner", // .net
  "ogr", // .org
  "ort", // .org
  "ofg", // .org
]);

/**
 * Shape: <local>@<domain>.<tld>, with at least one dot in the domain and a
 * 2-24 char alphabetic TLD. Disallows whitespace, consecutive dots, and
 * leading/trailing dots in the local part.
 *
 * This is deliberately stricter than RFC 5322 — we don't want to allow
 * obscure-but-legal forms like `"a..b"@host` because in practice they're
 * almost always typos, not intent.
 */
const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+\-]+(?<!\.)@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export interface EmailCheckResult {
  ok: boolean;
  /** Lowercased and trimmed email when ok=true, otherwise null. */
  normalized: string | null;
  /** Friendly user-facing reason when ok=false. */
  reason: string | null;
}

/**
 * Validate that `raw` is a syntactically real, non-disposable email address.
 *
 * The intent is "looks like a legit, deliverable email" — see the file
 * header for the full rule list. Returns a structured result so the form can
 * surface a specific message ("We don't allow disposable emails", etc.).
 */
export function checkEmail(raw: string): EmailCheckResult {
  if (typeof raw !== "string") {
    return { ok: false, normalized: null, reason: "Email is required." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, normalized: null, reason: "Email is required." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, normalized: null, reason: "Email cannot contain spaces." };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      ok: false,
      normalized: null,
      reason: "Please enter a valid email address (e.g. you@example.com).",
    };
  }
  const lower = trimmed.toLowerCase();
  const at = lower.lastIndexOf("@");
  const domain = lower.slice(at + 1);
  const tld = domain.split(".").pop() ?? "";
  if (TLD_TYPOS.has(tld)) {
    return {
      ok: false,
      normalized: null,
      reason: `Did you mean to type ".com" or ".net"? ".${tld}" doesn't look right.`,
    };
  }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false,
      normalized: null,
      reason: "Disposable email addresses are not allowed. Please use a permanent inbox.",
    };
  }
  return { ok: true, normalized: lower, reason: null };
}

/** Boolean shortcut around `checkEmail`. */
export function isValidEmail(raw: string): boolean {
  return checkEmail(raw).ok;
}
