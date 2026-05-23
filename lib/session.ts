/**
 * Cross-platform session storage for the custom email/password auth.
 * Uses AsyncStorage on every platform — simpler than mixing SecureStore + localStorage
 * because our app's auth model already requires the token in the Authorization header.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "utilitybill.session.token";
const USER_KEY = "utilitybill.session.user";

export type SessionUser = {
  id: number;
  email: string | null;
  name: string | null;
  role: "landlord" | "tenant" | "admin";
  status: "pending" | "active" | "frozen" | "deleted";
  landlordId: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  lastSignedIn?: string | Date;
};

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.warn("[Session] setToken failed", err);
  }
}

export async function clearToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function getCachedUser(): Promise<SessionUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export async function setCachedUser(user: SessionUser): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn("[Session] setCachedUser failed", err);
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch {}
}

export async function clearSession(): Promise<void> {
  await Promise.all([clearToken(), clearCachedUser()]);
}
