import {
  companyListQuerySchema,
  createCompanySchema,
  createEvidenceSchema,
  createHypothesisSchema,
  PERMISSION_KEYS,
  updateCompanySchema,
  updateEvidenceSchema,
  updateHypothesisSchema,
  type CompanyListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  listCompanyOptions,
  updateCompany,
} from "../services/companies.service";
import {
  createEvidence,
  createHypothesis,
  deleteEvidence,
  deleteHypothesis,
  listEvidenceForCompany,
  listHypothesesForCompany,
  updateEvidence,
  updateHypothesis,
} from "../services/research.service";

export const companiesRouter = Router();

companiesRouter.use(authenticate, requireAuth);

companiesRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  validate(companyListQuerySchema, "query"),
  async (req, res) => {
    const result = await listCompanies(parsedQuery<CompanyListQuery>(req));
    res.json({ data: result });
  },
);

companiesRouter.get(
  "/options",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const companies = await listCompanyOptions(search);
    res.json({ data: { companies } });
  },
);

companiesRouter.get(
  "/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  async (req, res) => {
    const company = await getCompany(String(req.params.id));
    res.json({ data: { company } });
  },
);

companiesRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.COMPANIES_CREATE),
  validate(createCompanySchema),
  async (req, res) => {
    const company = await createCompany(req.body);
    res.status(201).json({ data: { company } });
  },
);

companiesRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  validate(updateCompanySchema),
  async (req, res) => {
    const company = await updateCompany(String(req.params.id), req.body);
    res.json({ data: { company } });
  },
);

companiesRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_DELETE),
  async (req, res) => {
    await deleteCompany(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);

companiesRouter.get(
  "/:id/evidence",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  async (req, res) => {
    const evidence = await listEvidenceForCompany(String(req.params.id));
    res.json({ data: { evidence } });
  },
);

companiesRouter.post(
  "/:id/evidence",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  validate(createEvidenceSchema),
  async (req, res) => {
    const evidence = await createEvidence(
      String(req.params.id),
      req.authUser!.id,
      req.body,
    );
    res.status(201).json({ data: { evidence } });
  },
);

companiesRouter.get(
  "/:id/hypotheses",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  async (req, res) => {
    const hypotheses = await listHypothesesForCompany(String(req.params.id));
    res.json({ data: { hypotheses } });
  },
);

companiesRouter.post(
  "/:id/hypotheses",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  validate(createHypothesisSchema),
  async (req, res) => {
    const hypothesis = await createHypothesis(
      String(req.params.id),
      req.authUser!.id,
      req.body,
    );
    res.status(201).json({ data: { hypothesis } });
  },
);

export const researchMutationsRouter = Router();

researchMutationsRouter.use(authenticate, requireAuth);

researchMutationsRouter.patch(
  "/evidence/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  validate(updateEvidenceSchema),
  async (req, res) => {
    const evidence = await updateEvidence(String(req.params.id), req.body);
    res.json({ data: { evidence } });
  },
);

researchMutationsRouter.delete(
  "/evidence/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  async (req, res) => {
    await deleteEvidence(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);

researchMutationsRouter.patch(
  "/hypotheses/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  validate(updateHypothesisSchema),
  async (req, res) => {
    const hypothesis = await updateHypothesis(String(req.params.id), req.body);
    res.json({ data: { hypothesis } });
  },
);

researchMutationsRouter.delete(
  "/hypotheses/:id",
  requirePermission(PERMISSION_KEYS.COMPANIES_UPDATE),
  async (req, res) => {
    await deleteHypothesis(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);
