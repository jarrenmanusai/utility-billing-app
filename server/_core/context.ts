import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyAppToken } from "../auth";
import { getUserById } from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  // 1. Try custom JWT (Authorization: Bearer <token>) for landlord/tenant/admin auth.
  // This is the primary auth path for all Sevalla/standalone deployments.
  try {
    const authHeader = opts.req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifyAppToken(token);
      if (payload?.userId) {
        const dbUser = await getUserById(payload.userId);
        if (dbUser && dbUser.status === "active") {
          user = dbUser;
        }
      }
    }
  } catch (err) {
    // ignore — fall through to OAuth if configured
  }

  // 2. Fallback: Manus OAuth (only when OAUTH_SERVER_URL is configured).
  // On Sevalla/standalone deployments, this path is never reached because
  // OAUTH_SERVER_URL is unset per the deploy contract.
  if (!user && ENV.oAuthServerUrl && ENV.ownerOpenId) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
