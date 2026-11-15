import {
  importTemplateQuerySchema,
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
  buildImportPrompt,
  buildTemplateCsv,
  commitImport,
  parseImportFile,
} from "../services/imports.service";
import { listResearch } from "../services/research.service";
import { marketRequestContext } from "../lib/market-context";

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
importsRouter.use(authenticate, requireAuth, (_req,res,next)=>{res.set("Cache-Control","no-store");next();});

importsRouter.get(
  "/template",
  requirePermission(PERMISSION_KEYS.IMPORTS_VIEW),
  validate(importTemplateQuerySchema, "query"),
  async (req, res) => {
    const entity = parsedQuery<{ entity: ImportEntity }>(req).entity;
    const {format} = parsedQuery<{entity: ImportEntity;format:"xlsx"|"csv"}>(req);
    const buffer = format === "csv" ? buildTemplateCsv(entity) : await buildTemplateWorkbook(entity);
    const filename =
      `nbs-${entity === "CONTACTS" ? "contacts" : "companies"}-import.${format}`;
    res.setHeader(
      "Content-Type",
      format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
        prompt: await buildImportPrompt(entity),
      },
    });
  },
);

importsRouter.post(
  "/parse",
  requirePermission(PERMISSION_KEYS.IMPORTS_CREATE),
  upload.single("file"),
  // Multipart stream callbacks may resume outside the original AsyncLocalStorage scope.
  // Restore this authenticated request's context before any scoped database operation.
  marketRequestContext,
  async (req, res) => {
    if (!req.file) {
      throw badRequest("Choose a CSV or XLSX file to upload.");
    }
    const {entity} = importParseQuerySchema.parse(req.body);
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
    const result = await commitImport(req.body.entity, req.body, req.authUser!);
    res.json({ data: { result } });
  },
);
