/**
 * Custom email/password authentication utilities for UtilityBill.
 *
 * Three roles share this auth:
 *   - landlord: registers via /register; pending until admin approves
 *   - tenant:   created by their landlord (no self-registration)
 *   - admin:    auto-promoted via OWNER_OPEN_ID through Manus OAuth (handled elsewhere)
 *
 * Token: HS256 JWT signed with JWT_SECRET. 30-day expiration.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface AppTokenPayload {
  userId: number;
  role: "landlord" | "tenant" | "admin";
  email: string;
}

function getSecret(): string {
  return process.env.JWT_SECRET || "utilitybill-dev-secret-change-in-prod";
}

export function signAppToken(payload: AppTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL_SECONDS });
}

export async function verifyAppToken(
  token: string,
): Promise<AppTokenPayload | null> {
  try {
    const decoded = jwt.verify(token, getSecret()) as AppTokenPayload;
    if (!decoded || typeof decoded.userId !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateRandomToken(bytes = 32): string {
  // Web Crypto, available on Node 19+
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Get domain part of an email (lowercase). */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}
