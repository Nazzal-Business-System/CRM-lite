import { PERMISSION_KEYS, salesPerformanceQuerySchema, type SalesPerformanceQuery } from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import { getSalesPerformance, getSalespersonPerformance } from "../services/sales-performance.service";

export const salesPerformanceRouter = Router();
salesPerformanceRouter.use(authenticate, requireAuth, requirePermission(PERMISSION_KEYS.SALES_PERFORMANCE_VIEW));

salesPerformanceRouter.get("/", validate(salesPerformanceQuerySchema, "query"), async (req, res) => {
  res.json({ data: { performance: await getSalesPerformance(parsedQuery<SalesPerformanceQuery>(req)) } });
});

salesPerformanceRouter.get("/:userId", validate(salesPerformanceQuerySchema, "query"), async (req, res) => {
  res.json({ data: { performance: await getSalespersonPerformance(req.params.userId as string, parsedQuery<SalesPerformanceQuery>(req)) } });
});
