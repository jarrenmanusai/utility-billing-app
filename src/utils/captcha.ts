/**
 * Pure stateless CAPTCHA system. No third-party dependency.
 *
 * Three layers:
 *   1. Math challenge — server issues "7 + 5 = ?", client must reply "12".
 *   2. Honeypot — invisible field; humans never fill it, bots do.
 *   3. Time-to-submit — humans take >= 1.5s to read+fill the form.
 *
 * The challenge token is a stateless HMAC-signed JSON payload.
 */
import crypto from "node:crypto";

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_FILL_MS = 1500; // 1.5s

export interface CaptchaChallenge {
  question: string;
  token: string;
}

export interface CaptchaSubmission {
  token: string;
  answer: string;
  honeypot?: string;
}

interface ChallengePayload {
  a: string; // expected answer
  iat: number; // issued at
  n: string; // nonce
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  console.warn("[captcha] JWT_SECRET missing — using ephemeral fallback");
  return (process.env as any).__CAPTCHA_FALLBACK__ ??= crypto.randomBytes(32).toString("hex");
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

export function issueChallenge(): CaptchaChallenge {
  const ops = ["+", "-", "×"] as const;
  const op = ops[Math.floor(Math.random() * ops.length)]!;
  let a = Math.floor(Math.random() * 9) + 1;
  let b = Math.floor(Math.random() * 9) + 1;
  let answer: number;

  switch (op) {
    case "+":
      answer = a + b;
      break;
    case "-":
      if (b > a) [a, b] = [b, a];
      answer = a - b;
      break;
    case "×":
      answer = a * b;
      break;
  }

  const payload: ChallengePayload = {
    a: String(answer!),
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
  reason: string | null;
  failureKind: "ok" | "honeypot" | "too_fast" | "expired" | "bad_signature" | "wrong_answer" | "missing";
}

export function verifySubmission(sub: CaptchaSubmission): CaptchaVerificationResult {
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
