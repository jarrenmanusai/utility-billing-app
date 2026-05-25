/**
 * Shared validators for landlord registration and admin tenant creation.
 *
 * Two concerns are handled here:
 *
 *  1. Philippine mobile numbers (PH only)
 *     - Accepted input formats:
 *         +63 9XX XXX XXXX     (E.164 with country code, optional spaces)
 *         09XX XXX XXXX        (local format, optional spaces)
 *         63 9XX XXX XXXX      (without leading +, treated as +63...)
 *     - Output: a single canonical E.164 string (+639XXXXXXXXX, 13 chars)
 *
 *  2. "Legitimate" email
 *     - Rejects obvious typos (e.g. me@gmial.con)
 *     - Bans common throwaway/disposable mail providers
 */

// ---------------------------------------------------------------------------
// Phone (Philippines)
// ---------------------------------------------------------------------------

export const PH_E164_REGEX = /^\+639\d{9}$/;

/**
 * Normalise any user-entered PH mobile number to canonical E.164.
 * Returns null when the input is not a valid PH mobile number.
 */
export function normalizePhPhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/[\s\-()]/g, "").trim();
  if (!trimmed) return null;

  let digits: string;
  if (trimmed.startsWith("+63")) {
    digits = trimmed.slice(3);
  } else if (trimmed.startsWith("63")) {
    digits = trimmed.slice(2);
  } else if (trimmed.startsWith("09")) {
    digits = trimmed.slice(1);
  } else {
    return null;
  }

  if (!/^9\d{9}$/.test(digits)) return null;
  return "+63" + digits;
}

export function isValidPhPhone(raw: string): boolean {
  return normalizePhPhone(raw) !== null;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

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

const TLD_TYPOS = new Set([
  "con", "vom", "comm", "cim", "ney", "nrt", "ner", "ogr", "ort", "ofg",
]);

const EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+\-]+(?<!\.)@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

export interface EmailCheckResult {
  ok: boolean;
  normalized: string | null;
  reason: string | null;
}

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

export function isValidEmail(raw: string): boolean {
  return checkEmail(raw).ok;
}
