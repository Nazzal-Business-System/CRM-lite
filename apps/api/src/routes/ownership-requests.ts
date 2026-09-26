import {
  createOwnershipRequestSchema,
  ownershipRequestQuerySchema,
  PERMISSION_KEYS,
  reviewOwnershipRequestSchema,
  type OwnershipEntityType,
  type OwnershipRequestQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import { createOwnershipRequest, getMyPendingOwnershipRequest, listOwnershipRequests, reviewOwnershipRequest } from "../services/ownership.service";

export const ownershipRequestsRouter = Router();
ownershipRequestsRouter.use(authenticate, requireAuth);

ownershipRequestsRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.OWNERSHIP_REQUESTS_VIEW),
  validate(ownershipRequestQuerySchema, "query"),
  async (req, res) => res.json({ data: await listOwnershipRequests(parsedQuery<OwnershipRequestQuery>(req)) }),
);

ownershipRequestsRouter.get("/mine/pending", async (req, res) => {
  const entityType = String(req.query.entityType) as OwnershipEntityType;
  const entityId = String(req.query.entityId ?? "");
  const parsed = createOwnershipRequestSchema.parse({ entityType, entityId });
  res.json({ data: { request: await getMyPendingOwnershipRequest(req.authUser!.id, parsed.entityType, parsed.entityId) } });
});

ownershipRequestsRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.OWNERSHIP_REQUESTS_CREATE),
  validate(createOwnershipRequestSchema),
  async (req, res) => {
    const request = await createOwnershipRequest(req.authUser!, req.body.entityType, req.body.entityId);
    res.status(201).json({ data: { request } });
  },
);

ownershipRequestsRouter.post(
  "/:id/review",
  requirePermission(PERMISSION_KEYS.OWNERSHIP_REQUESTS_MANAGE),
  validate(reviewOwnershipRequestSchema),
  async (req, res) => {
    const request = await reviewOwnershipRequest(req.authUser!.id, String(req.params.id), req.body.decision, req.body.rejectionReason);
    res.json({ data: { request } });
  },
);
