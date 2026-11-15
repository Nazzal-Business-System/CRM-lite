import assert from "node:assert/strict";
import test from "node:test";
import { createPricingRateService, convertPricingAmount, convertPricingEstimate, convertPricingPrices } from "./pricing-currency.service";
import { pricingExchangeSchema, PRICING_CATALOG_VERSION, convertedPricingRequestSchema } from "@nbs/shared";
import { calculatePricing } from "../pricing/engine";
const time = Date.parse("2026-11-14T12:00:00Z");
const rows = [{ date: "2026-11-14", base: "JOD", quote: "USD", rate: 1.4104 }, { date: "2026-11-14", base: "JOD", quote: "GBP", rate: 1.0634 }];
const exchange = (rate = 1.4104) => pricingExchangeSchema.parse({ version: "fx-line-half-up-v1", base: "JOD", currency: "USD", rate, source: "Frankfurter v2", sourceUrl: "https://frankfurter.dev/", effectiveDate: "2026-11-14", retrievedAt: new Date(time).toISOString(), expiresAt: new Date(time + 21600000).toISOString() });
const configuration = { configurationVersion: 1, catalogVersion: PRICING_CATALOG_VERSION, product: "erp", modules: ["erp-core", "erp-inventory", "erp-sales", "erp-operations"], addons: ["staff-training"], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
test("server rates coalesce, cache six hours, expire closed, throttle retries, and JOD survives outages", async () => {
  let clock = time; let calls = 0; let outage = false;
  const service = createPricingRateService(async () => { calls++; if (outage) throw new Error("fixture outage"); return Response.json(rows); }, () => clock);
  const [usd, gbp] = await Promise.all([service.get("USD"), service.get("GBP")]); assert.equal(calls, 1); assert.equal(usd.rate, 1.4104); assert.equal(gbp.rate, 1.0634);
  await service.get("USD"); assert.equal(calls, 1); clock += 6 * 3600000; outage = true;
  await assert.rejects(service.get("USD"), { status: 503, code: "EXCHANGE_RATES_STALE" }); await assert.rejects(service.get("GBP"), { status: 503 }); assert.equal(calls, 2);
  assert.equal((await service.get("JOD")).rate, 1); clock += 60001; outage = false; assert.equal((await service.get("USD")).rate, 1.4104); assert.equal(calls, 3);
});
test("invalid, stale, future, incomplete, excessive precision and non-success rate payloads fail closed", async () => {
  for (const invalid of [[], [rows[0], rows[0]], rows.map(row => ({ ...row, date: "2026-11-09" })), rows.map(row => ({ ...row, date: "2026-11-15" })), rows.map(row => ({ ...row, date: "2026-02-30" })), rows.map(row => ({ ...row, rate: 0 })), rows.map(row => ({ ...row, rate: 1.123456789 })), rows.map(row => ({ ...row, base: "USD" }))]) {
    const service = createPricingRateService(async () => Response.json(invalid), () => time); await assert.rejects(service.get("USD"), { status: 503 });
  }
  for (const response of [new Response("outage", { status: 503 }), new Response("bad json"), new Response("x".repeat(33000))]) await assert.rejects(createPricingRateService(async () => response, () => time).get("GBP"), { status: 503 });
});
test("exact half-up conversion preserves JOD, sums rounded lines, reconciles savings and converts all catalog options", async () => {
  assert.equal(convertPricingAmount(1.005, exchange(1)), 1.01); assert.equal(convertPricingAmount(0.005, exchange(1)), 0.01);
  assert.equal(convertPricingAmount(750, exchange()), 1057.8); assert.throws(() => convertPricingAmount(NaN, exchange()));
  const jod = await createPricingRateService(async () => { throw new Error("must not fetch"); }).get("JOD");
  const original = calculatePricing(configuration).data; assert.deepEqual(convertPricingEstimate(original, jod), original);
  const converted = convertPricingEstimate(original, exchange());
  assert.equal(Math.round(converted.estimatedTotal * 100), converted.lineItems.reduce((sum, line) => sum + Math.round(line.amount * 100), 0));
  assert.equal(Math.round(converted.componentOnlyTotal * 100) - Math.round(converted.estimatedTotal * 100), Math.round(converted.bundleSavings * 100));
  assert.equal(converted.presetApplied, original.presetApplied); const prices = convertPricingPrices(exchange()); assert.equal(prices.currency, "USD"); assert.equal(prices.products[0]?.quote.amount, 1057.8);
  for (const group of [prices.modules, prices.addons, prices.customModuleTiers, prices.customSoftwareTiers]) for (const item of group) if ("amount" in item.quote) assert.ok(Number.isFinite(item.quote.amount));
  assert.equal(convertedPricingRequestSchema.safeParse({ configuration, currency: "EUR" }).success, false);
  assert.equal(convertedPricingRequestSchema.safeParse({ configuration, currency: "USD", rate: 1 }).success, false);
});
