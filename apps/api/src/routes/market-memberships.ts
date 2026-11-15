import { PERMISSION_KEYS, replaceMarketMembershipsSchema } from "@nbs/shared";
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../middleware/validate";
import { assertMarketMembershipAdmin, listUserMarkets, replaceUserMarkets } from "../services/market-memberships.service";

import { listSalesMarkets } from "../services/markets.service";

export const marketMembershipsRouter = Router();
marketMembershipsRouter.use(authenticate, requireAuth);
marketMembershipsRouter.get("/sales-markets", requirePermission(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS), async (req, res) => {
  assertMarketMembershipAdmin(req.authUser!);
  res.json({ data: { markets: await listSalesMarkets() } });
});
marketMembershipsRouter.get("/users/:userId/markets", requirePermission(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS), async (req, res) => {
  const userId = z.string().min(1).max(128).parse(req.params.userId);
  res.json({ data: { memberships: await listUserMarkets(userId, req.authUser!) } });
});
marketMembershipsRouter.put("/users/:userId/markets", requirePermission(PERMISSION_KEYS.MARKETS_MANAGE_MEMBERSHIPS), validate(replaceMarketMembershipsSchema), async (req, res) => {
  const userId = z.string().min(1).max(128).parse(req.params.userId);
  res.json({ data: await replaceUserMarkets(userId, req.body.marketCodes, req.authUser!, req.body.defaultMarketCode) });
});
