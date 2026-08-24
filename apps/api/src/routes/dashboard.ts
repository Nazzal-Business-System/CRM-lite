import {
  importCommitSchema,
  importParseQuerySchema,
  PERMISSION_KEYS,
  researchListQuerySchema,
  type ImportEntity,
  type ResearchListQuery,
} from "@nbs/shared";
import { Router } from "express";
import multer from "multer";
import { badRequest } from "../lib/errors";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import { getDashboard } from "../services/dashboard.service";
import {
  buildTemplateWorkbook,
  COMPANY_AI_PROMPT,
  CONTACT_AI_PROMPT,
  commitImport,
  parseImportFile,
} from "../services/imports.service";
import { listResearch } from "../services/research.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requireAuth);
dashboardRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.DASHBOARD_VIEW),
  async (_req, res) => {
    const dashboard = await getDashboard();
    res.json({ data: { dashboard } });
  },
);

export const researchRouter = Router();
researchRouter.use(authenticate, requireAuth);
researchRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.COMPANIES_VIEW),
  validate(researchListQuerySchema, "query"),
  async (req, res) => {
    const result = await listResearch(parsedQuery<ResearchListQuery>(req));
    res.json({ data: result });
  },
);

export const importsRouter = Router();
importsRouter.use(authenticate, requireAuth);

importsRouter.get(
  "/template",
  requirePermission(PERMISSION_KEYS.IMPORTS_VIEW),
  validate(importParseQuerySchema, "query"),
  async (req, res) => {
    const entity = parsedQuery<{ entity: ImportEntity }>(req).entity;
    const buffer = await buildTemplateWorkbook(entity);
    const filename =
      entity === "CONTACTS" ? "nbs-contacts-import.xlsx" : "nbs-companies-import.xlsx";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  },
);

importsRouter.get(
  "/ai-prompt",
  requirePermission(PERMISSION_KEYS.IMPORTS_VIEW),
  validate(importParseQuerySchema, "query"),
  async (req, res) => {
    const entity = parsedQuery<{ entity: ImportEntity }>(req).entity;
    res.json({
      data: {
        prompt: entity === "CONTACTS" ? CONTACT_AI_PROMPT : COMPANY_AI_PROMPT,
      },
    });
  },
);

importsRouter.post(
  "/parse",
  requirePermission(PERMISSION_KEYS.IMPORTS_CREATE),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      throw badRequest("Choose a CSV or XLSX file to upload.");
    }
    const entity = req.body?.entity === "CONTACTS" ? "CONTACTS" : "COMPANIES";
    const preview = await parseImportFile(
      entity,
      req.file.originalname,
      req.file.buffer,
    );
    res.json({ data: { preview } });
  },
);

importsRouter.post(
  "/commit",
  requirePermission(PERMISSION_KEYS.IMPORTS_CREATE),
  validate(importCommitSchema),
  async (req, res) => {
    const result = await commitImport(req.body.entity, req.body, req.authUser!.id);
    res.json({ data: { result } });
  },
);
