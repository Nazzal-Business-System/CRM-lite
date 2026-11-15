import { Router, type ErrorRequestHandler } from "express";
import { priceBookCatalogQuerySchema, nativePricingRequestSchema, priceBookParamsSchema, priceBookVersionQuerySchema, type PriceBookId, PERMISSION_KEYS, pricingCurrencyQuerySchema, convertedPricingRequestSchema, createPricingEstimateSchema, pricingEstimateListQuerySchema, pricingEstimateParamsSchema, pricingRequestSchema, type PricingEstimateListQuery } from "@nbs/shared";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { parsedQuery, validate } from "../middleware/validate";
import { pricingService } from "../services/pricing.service";
import { archivePricingEstimate, copyPricingEstimate, createPricingEstimate, getPricingEstimate, listPricingEstimates } from "../services/pricing-estimates.service";

import { pricingRates, convertPricingEstimate, convertPricingPrices } from "../services/pricing-currency.service";

import { env } from "../env";
import { requireLegacyPricing } from "../lib/price-book-access";
import { getAuthorizedPriceBookCatalog, listAuthorizedPriceBooks, getAuthorizedPriceBookPrices, calculateAuthorizedPriceBook } from "../services/price-books.service";

export const pricingRouter = Router();
// Express forwards JSON parser errors before ordinary router middleware executes.
// Keep malformed/oversized pricing payloads structured without altering other routers.
export const pricingBodyError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  const kind = error && typeof error === "object" && "type" in error ? error.type : null;
  if (kind === "entity.parse.failed" || kind === "entity.too.large") {
    res.set("Cache-Control", "no-store").status(kind === "entity.too.large" ? 413 : 400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid pricing request body." } });
    return;
  }
  next(error);
};
pricingRouter.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
pricingRouter.use(authenticate, requireAuth, requirePermission(PERMISSION_KEYS.PRICING_VIEW));
pricingRouter.get("/price-books", async(req,res)=>{res.json({data:await listAuthorizedPriceBooks(req.authUser!)});});
pricingRouter.get("/price-books/default/prices",validate(priceBookVersionQuerySchema,"query"),async(req,res)=>{res.json({data:await getAuthorizedPriceBookPrices(req.authUser!,undefined,parsedQuery<{version?:string}>(req).version)});});
pricingRouter.get("/price-books/:bookId/prices",validate(priceBookParamsSchema,"params"),validate(priceBookVersionQuerySchema,"query"),async(req,res)=>{res.json({data:await getAuthorizedPriceBookPrices(req.authUser!,String(req.params.bookId) as PriceBookId,parsedQuery<{version?:string}>(req).version)});});
pricingRouter.post("/price-books/calculate",validate(nativePricingRequestSchema),async(req,res)=>{res.json({data:await calculateAuthorizedPriceBook(req.authUser!,req.body)});});
pricingRouter.get("/price-books/:bookId/catalog",validate(priceBookParamsSchema,"params"),async(req,res)=>{res.json({data:await getAuthorizedPriceBookCatalog(req.authUser!,String(req.params.bookId) as PriceBookId)});});
pricingRouter.get("/catalog", validate(priceBookCatalogQuerySchema,"query"), async(req,res)=>{res.json(env.PRICING_MODE==="price_books"?{data:await getAuthorizedPriceBookCatalog(req.authUser!,parsedQuery<{bookId?:PriceBookId}>(req).bookId)}:pricingService.catalog());});
pricingRouter.get("/prices", validate(pricingCurrencyQuerySchema, "query"), async (req, res) => { requireLegacyPricing(); const { currency } = parsedQuery<{ currency: "JOD" | "USD" | "GBP" }>(req); res.json({ data: convertPricingPrices(await pricingRates.get(currency)) }); });
pricingRouter.get("/exchange-rates", validate(pricingCurrencyQuerySchema, "query"), async (req, res) => { requireLegacyPricing(); const { currency } = parsedQuery<{ currency: "JOD" | "USD" | "GBP" }>(req); res.json({ data: await pricingRates.get(currency) }); });
pricingRouter.post("/calculate-converted", validate(convertedPricingRequestSchema), async (req, res) => { requireLegacyPricing(); const jod = pricingService.calculate(req.body.configuration).data; const exchange = await pricingRates.get(req.body.currency); res.json({ data: { ...convertPricingEstimate(jod, exchange), exchange, jod } }); });
pricingRouter.post("/calculate", validate(pricingRequestSchema), (req, res) => { requireLegacyPricing(); res.json(pricingService.calculate(req.body)); });
pricingRouter.post("/estimates", requirePermission(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE), validate(createPricingEstimateSchema), async (req, res) => {
  res.status(201).json({ data: { estimate: await createPricingEstimate(req.body) } });
});
pricingRouter.get("/estimates", validate(pricingEstimateListQuerySchema, "query"), async (req, res) => {
  res.json({ data: await listPricingEstimates(parsedQuery<PricingEstimateListQuery>(req)) });
});
pricingRouter.get("/estimates/:id", validate(pricingEstimateParamsSchema, "params"), async (req, res) => {
  res.json({ data: { estimate: await getPricingEstimate(String(req.params.id)) } });
});
pricingRouter.post("/estimates/:id/copies", requirePermission(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE), validate(pricingEstimateParamsSchema, "params"), validate(createPricingEstimateSchema), async (req, res) => {
  res.status(201).json({ data: { estimate: await copyPricingEstimate(String(req.params.id), req.body) } });
});

pricingRouter.delete("/estimates/:id", requirePermission(PERMISSION_KEYS.PRICING_ESTIMATES_CREATE), validate(pricingEstimateParamsSchema, "params"), async (req, res) => {
  res.json({ data: await archivePricingEstimate(String(req.params.id)) });
});
