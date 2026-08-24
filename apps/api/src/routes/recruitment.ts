import {
  createRecruitmentCandidateSchema,
  PERMISSION_KEYS,
  recruitmentListQuerySchema,
  updateRecruitmentCandidateSchema,
  type RecruitmentListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import {
  createRecruitmentCandidate,
  deleteRecruitmentCandidate,
  getRecruitmentCandidate,
  getRecruitmentMetrics,
  listRecruitmentCandidates,
  updateRecruitmentCandidate,
} from "../services/recruitment.service";

export const recruitmentRouter = Router();

recruitmentRouter.use(authenticate, requireAuth);

recruitmentRouter.get(
  "/metrics",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_VIEW),
  async (_req, res) => {
    const metrics = await getRecruitmentMetrics();
    res.json({ data: { metrics } });
  },
);

recruitmentRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_VIEW),
  validate(recruitmentListQuerySchema, "query"),
  async (req, res) => {
    const result = await listRecruitmentCandidates(
      parsedQuery<RecruitmentListQuery>(req),
    );
    res.json({ data: result });
  },
);

recruitmentRouter.get(
  "/:id",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_VIEW),
  async (req, res) => {
    const candidate = await getRecruitmentCandidate(String(req.params.id));
    res.json({ data: { candidate } });
  },
);

recruitmentRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_CREATE),
  validate(createRecruitmentCandidateSchema),
  async (req, res) => {
    const candidate = await createRecruitmentCandidate(
      req.body,
      req.authUser!.id,
    );
    res.status(201).json({ data: { candidate } });
  },
);

recruitmentRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_UPDATE),
  validate(updateRecruitmentCandidateSchema),
  async (req, res) => {
    const candidate = await updateRecruitmentCandidate(
      String(req.params.id),
      req.body,
    );
    res.json({ data: { candidate } });
  },
);

recruitmentRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.RECRUITMENT_DELETE),
  async (req, res) => {
    const result = await deleteRecruitmentCandidate(String(req.params.id));
    res.json({ data: result });
  },
);
