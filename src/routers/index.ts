/**
 * Root tRPC router — merges all domain-specific routers.
 */

import { router } from "../middlewares/trpc.js";
import { authRouter } from "./auth.js";
import { landlordRouter } from "./landlord.js";
import { tenantRouter } from "./tenant.js";
import { adminRouter } from "./admin.js";

export const appRouter = router({
  auth: authRouter,
  landlord: landlordRouter,
  tenant: tenantRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
