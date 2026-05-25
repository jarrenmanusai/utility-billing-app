/**
 * Pure client+server CAPTCHA system. No third-party dependency.
 *
 * Three layers stack here. Each on its own is weak; together they catch
 * essentially every script-driven registration spam attempt:
 *
 *   1. Math challenge — server issues `7 + 5 = ?`, client must reply `12`.
 *   2. Honeypot — the form ships an invisible field; humans never fill it,
 *      naive bots dump every input. We reject any submission with it set.
 *   3. Time-to-submit — humans take >= 1.5s to read+fill the form. We
 *      embed a server-issued `issuedAt` in the challenge and reject any
 *      submission that comes back impossibly fast (< 1.5s).
 *
 * The challenge token is a stateless HMAC-signed JSON payload. The server
 * does not need to keep any session state between issuing and verifying —
 * the signature itself proves the challenge came from us, and the embedded
 * `issuedAt` + 10-minute TTL prevent token reuse far in the future.
 */
import crypto from "node:crypto";

import { ENV } from "../server/_core/env";

const TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for slow form filling
const MIN_FILL_MS = 1500; // 1.5s — typical bot floor; humans well exceed this

/** What the client receives from `auth.captcha`. */
export interface CaptchaChallenge {
  /** Human-readable prompt (e.g. "What is 7 + 5?"). */
  question: string;
  /** Opaque signed token; the client just echoes it back on submit. */
  token: string;
}

/** What the client sends back when submitting a form. */
export interface CaptchaSubmission {
  token: string;
  /** The user-typed answer to the math question. Stored as string. */
  answer: string;
  /** The honeypot input. Should be empty. */
  honeypot?: string;
}

interface ChallengePayload {
  /** The expected answer (number, but stored as string for JSON safety). */
  a: string;
  /** Issued-at, ms since epoch. */
  iat: number;
  /** Random nonce so two identical questions get different tokens. */
  n: string;
}

function getSecret(): string {
  // Reuse the existing JWT/cookie secret. If it's ever empty (dev), fall back
  // to a process-stable random string so signatures still verify within a run.
  if (ENV.cookieSecret && ENV.cookieSecret.length >= 16) return ENV.cookieSecret;
  // eslint-disable-next-line no-console
  console.warn("[captcha] JWT_SECRET missing — using ephemeral fallback");
  return process.env.__CAPTCHA_FALLBACK__ ??= crypto.randomBytes(32).toString("hex");
}

function sign(payload: ChallengePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): ChallengePayload | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as ChallengePayload;
    if (typeof parsed.a !== "string" || typeof parsed.iat !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Build a fresh challenge. Operands are picked to be friendly to non-native
 * speakers and humans on small screens — single-digit add/multiply only.
 */
export function issueChallenge(): CaptchaChallenge {
  const ops = ["+", "-", "×"] as const;
  const op = ops[Math.floor(Math.random() * ops.length)]!;
  let a = Math.floor(Math.random() * 9) + 1; // 1..9
  let b = Math.floor(Math.random() * 9) + 1; // 1..9
  let answer: number;

  switch (op) {
    case "+":
      answer = a + b;
      break;
    case "-":
      // Ensure non-negative result for nicer UX.
      if (b > a) [a, b] = [b, a];
      answer = a - b;
      break;
    case "×":
      answer = a * b;
      break;
  }

  const payload: ChallengePayload = {
    a: String(answer),
    iat: Date.now(),
    n: crypto.randomBytes(8).toString("base64url"),
  };

  return {
    question: `What is ${a} ${op} ${b}?`,
    token: sign(payload),
  };
}

export interface CaptchaVerificationResult {
  ok: boolean;
  /** Human-readable reason on failure. Safe to show to the user. */
  reason: string | null;
  /** Internal label for logging/metrics; never shown to the user. */
  failureKind: "ok" | "honeypot" | "too_fast" | "expired" | "bad_signature" | "wrong_answer" | "missing";
}

/**
 * Validate a submission against all three layers. Returns a structured
 * result so the caller can both show a friendly message AND log which layer
 * caught the bot (useful for tuning).
 */
export function verifySubmission(sub: CaptchaSubmission): CaptchaVerificationResult {
  // Layer 2 — honeypot. If filled at all, it's a bot.
  if (sub.honeypot && sub.honeypot.trim()) {
    return {
      ok: false,
      reason: "Submission rejected. Please refresh the page and try again.",
      failureKind: "honeypot",
    };
  }

  if (!sub.token) {
    return {
      ok: false,
      reason: "Verification challenge missing — please refresh and try again.",
      failureKind: "missing",
    };
  }

  const payload = verify(sub.token);
  if (!payload) {
    return {
      ok: false,
      reason: "Verification challenge invalid — please refresh and try again.",
      failureKind: "bad_signature",
    };
  }

  // Layer 3 — too-fast submit. Bots fire forms in <100ms; humans are >>1.5s.
  const elapsed = Date.now() - payload.iat;
  if (elapsed < MIN_FILL_MS) {
    return {
      ok: false,
      reason: "That was too quick — please try again.",
      failureKind: "too_fast",
    };
  }
  if (elapsed > TTL_MS) {
    return {
      ok: false,
      reason: "Verification expired — please refresh and try again.",
      failureKind: "expired",
    };
  }

  // Layer 1 — math answer.
  const provided = (sub.answer ?? "").trim();
  if (provided !== payload.a) {
    return {
      ok: false,
      reason: "Incorrect answer to the verification question.",
      failureKind: "wrong_answer",
    };
  }

  return { ok: true, reason: null, failureKind: "ok" };
}
