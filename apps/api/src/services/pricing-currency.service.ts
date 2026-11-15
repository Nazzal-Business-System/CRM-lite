import { z } from "zod";
import { pricingExchangeSchema, type PricingCurrency, type PricingExchange } from "@nbs/shared";
import { AppError } from "../lib/errors";
import { calculatePricing } from "../pricing/engine";
import { getPricingPrices } from "../pricing/presentation";
const URL = "https://api.frankfurter.dev/v2/rates?base=JOD&quotes=USD,GBP";
const HOUR = 3600000;
const rowSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), base: z.literal("JOD"), quote: z.enum(["USD", "GBP"]), rate: z.number().finite().positive().max(1000000) });
export function createPricingRateService(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  let cache: Map<PricingCurrency, PricingExchange> | undefined;
  let pending: Promise<void> | undefined; let retryAfter = 0;
  async function refresh() {
    const response = await fetcher(URL, { signal: AbortSignal.timeout(6000), redirect: "error", headers: { Accept: "application/json" } });
    if (!response.ok || !response.body) throw new Error("Rate provider unavailable");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 32768) throw new Error("Rate response too large"); chunks.push(value); } } finally { await reader.cancel().catch(() => {}); }
    const rows = z.array(rowSchema).length(2).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (new Set(rows.map(row => row.quote)).size !== 2) throw new Error("Incomplete rates");
    const fetched = now(); const next = new Map<PricingCurrency, PricingExchange>();
    for (const row of rows) {
      const date = Date.parse(row.date + "T00:00:00Z");
      if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== row.date || date > fetched || fetched - date >= 96 * HOUR || Math.abs(row.rate * 1e8 - Math.round(row.rate * 1e8)) > 0.001) throw new Error("Invalid or stale rate");
      next.set(row.quote, pricingExchangeSchema.parse({ version: "fx-line-half-up-v1", base: "JOD", currency: row.quote, rate: row.rate, source: "Frankfurter v2", sourceUrl: "https://frankfurter.dev/", effectiveDate: row.date, retrievedAt: new Date(fetched).toISOString(), expiresAt: new Date(Math.min(fetched + 6 * HOUR, date + 96 * HOUR)).toISOString() }));
    }
    cache = next;
  }
  return { async get(currency: PricingCurrency): Promise<PricingExchange> {
    if (currency === "JOD") return { version: "fx-line-half-up-v1", base: "JOD", currency, rate: 1, source: "JOD catalog", sourceUrl: "", effectiveDate: null, retrievedAt: null, expiresAt: null };
    const cached = cache?.get(currency); if (cached && Date.parse(cached.expiresAt!) > now()) return { ...cached };
    try {
      if (!pending) {
        if (now() < retryAfter) throw new Error("Rate retry cooldown");
        pending = refresh().catch(error => { retryAfter = now() + 60000; throw error; }).finally(() => { pending = undefined; });
      }
      await pending; const result = cache?.get(currency); if (!result || Date.parse(result.expiresAt!) <= now()) throw new Error("Expired rates"); return { ...result };
    } catch { throw new AppError(503, cached ? "EXCHANGE_RATES_STALE" : "EXCHANGE_RATES_UNAVAILABLE", "Currency rates are unavailable or expired. Retry, or explicitly select JOD."); }
  } };
}
export const pricingRates = createPricingRateService();
// Exact integer arithmetic: JOD mills times rate at 8 decimal places, round half-up to minor units.
export function convertPricingAmount(amount: number, exchange: PricingExchange): number {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 1000)) || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.001) throw new Error("Unsupported pricing amount");
  if (exchange.currency === "JOD") return amount;
  const numerator = BigInt(Math.round(amount * 1000)) * BigInt(Math.round(exchange.rate * 1e8));
  const denominator = 1000n * 100000000n / 100n;
  const minor = (numerator + denominator / 2n) / denominator;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Converted amount exceeds precision");
  return Number(minor) / 100;
}
type Estimate = ReturnType<typeof calculatePricing>["data"];
function quote<T extends { kind: string; amount?: number }>(value: T, exchange: PricingExchange) { return value.amount === undefined ? { ...value } : { ...value, amount: convertPricingAmount(value.amount, exchange) }; }
export function convertPricingEstimate(base: Estimate, exchange: PricingExchange) {
  const lines = base.lineItems.map(line => ({ ...line, amount: convertPricingAmount(line.amount, exchange), quote: quote(line.quote, exchange) }));
  if (exchange.currency === "JOD") return { ...base, lineItems: lines };
  const total = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100;
  const components = base.bundleSavings === 0 ? total : Math.max(total, convertPricingAmount(base.componentOnlyTotal, exchange));
  return { ...base, currency: exchange.currency, lineItems: lines, estimatedTotal: total, componentOnlyTotal: components, bundleSavings: Math.round((components - total) * 100) / 100 };
}
export function convertPricingPrices(exchange: PricingExchange) {
  const base = getPricingPrices().data;
  const items = <T extends { quote: { kind: string; amount?: number } }>(values: T[]) => values.map(item => ({ ...item, quote: quote(item.quote, exchange) }));
  return { ...base, currency: exchange.currency, exchange, products: base.products.map(item => ({ ...item, quote: quote(item.quote, exchange), typicalQuote: item.typicalQuote ? quote(item.typicalQuote, exchange) : null })),
    modules: items(base.modules), addons: items(base.addons), customModuleTiers: items(base.customModuleTiers), customSoftwareTiers: items(base.customSoftwareTiers),
    presets: base.presets.map(item => { const converted = quote(item.quote, exchange); const componentTotal = Math.max(converted.amount, convertPricingAmount(item.componentTotal, exchange)); return { ...item, quote: converted, componentTotal, savings: Math.round((componentTotal - converted.amount) * 1000) / 1000 }; }),
  };
}
