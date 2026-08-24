import {
  createOpportunitySchema,
  opportunityListQuerySchema,
  PERMISSION_KEYS,
  updateOpportunitySchema,
  type OpportunityListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunity,
  listOpportunities,
  updateOpportunity,
} from "../services/opportunities.service";

export const opportunitiesRouter = Router();

opportunitiesRouter.use(authenticate, requireAuth);

opportunitiesRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.OPPORTUNITIES_VIEW),
  validate(opportunityListQuerySchema, "query"),
  async (req, res) => {
    const result = await listOpportunities(parsedQuery<OpportunityListQuery>(req));
    res.json({ data: result });
  },
);

opportunitiesRouter.get(
  "/:id",
  requirePermission(PERMISSION_KEYS.OPPORTUNITIES_VIEW),
  async (req, res) => {
    const opportunity = await getOpportunity(String(req.params.id));
    res.json({ data: { opportunity } });
  },
);

opportunitiesRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.OPPORTUNITIES_CREATE),
  validate(createOpportunitySchema),
  async (req, res) => {
    const opportunity = await createOpportunity(req.body);
    res.status(201).json({ data: { opportunity } });
  },
);

opportunitiesRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.OPPORTUNITIES_UPDATE),
  validate(updateOpportunitySchema),
  async (req, res) => {
    const opportunity = await updateOpportunity(String(req.params.id), req.body);
    res.json({ data: { opportunity } });
  },
);

opportunitiesRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.OPPORTUNITIES_DELETE),
  async (req, res) => {
    await deleteOpportunity(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);
