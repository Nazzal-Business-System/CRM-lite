import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSION_KEYS as P, type AuthUser } from "@nbs/shared";
import { ApiError, isServiceUnavailable } from "./api";
import { pricingCatalogOptions, pricingPricesOptions, pricingErrorKey, savedEstimateOptions, savedEstimatesOptions } from "./pricing";
const user = { id: "fixture", permissions: [P.PRICING_VIEW] } as AuthUser;
test("missing pricing endpoints are retryable service failures, never permission loss or missing records", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, { status: 404 }));
  for (const operation of [() => pricingPricesOptions(user).queryFn(), () => pricingCatalogOptions(user).queryFn(), () => savedEstimatesOptions(user, { page: 1, scope: "all", search: "" }).queryFn()]) {
    await assert.rejects(operation(), error => { assert.ok(error instanceof ApiError); assert.equal(error.status, 404); assert.equal(error.code, "PRICING_ENDPOINT_MISSING"); assert.equal(pricingErrorKey(error), "pricing.endpointMissing"); return true; });
  }
  await assert.rejects(savedEstimateOptions(user, "missing-record").queryFn(), error => { assert.equal(pricingErrorKey(error), "pricing.notFound"); return true; });
});
test("network transport, HTTP 503, and forbidden responses have distinct pricing recovery states", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fixture connection failure"); });
  await assert.rejects(pricingPricesOptions(user).queryFn(), error => { assert.ok(error instanceof ApiError); assert.equal(pricingErrorKey(error), "pricing.network"); assert.equal(isServiceUnavailable(error), true); assert.equal(error.status, 503); return true; });
  t.mock.restoreAll();
  for (const status of [503, 403]) {
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: status === 503 ? "SERVICE_UNAVAILABLE" : "FORBIDDEN" } }, { status }));
    await assert.rejects(pricingPricesOptions(user).queryFn(), error => { assert.equal(pricingErrorKey(error), status === 503 ? "pricing.unavailable" : "pricing.denied"); return true; });
    t.mock.restoreAll();
  }
});
