import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { PERMISSION_KEYS as P, PRICING_CATALOG_VERSION, PRODUCT_STRUCTURE_VERSION, type AuthUser } from "@nbs/shared";
import { env } from "../env";
import { marketRequestContext } from "../lib/market-context";
import { errorHandler } from "../middleware/error-handler";
import { pricingRouter } from "./pricing";
import { priceBookAccessRouter } from "./price-book-access";
import { installMarketStore } from "../test/market-store";
import { publishedPriceBook } from "../pricing/price-books";
test("native API closes legacy price bypasses, enforces explicit grants/defaults and preserves auth on unavailable/unpublished books", async (t) => {
    assert.equal(new URL(env.DATABASE_URL).port, "1");
    const previous = env.PRICING_MODE;
    env.PRICING_MODE = "price_books";
    t.after(() => { env.PRICING_MODE = previous; });
    const f = installMarketStore(t);
    const partner = { id: "partner", permissions: [P.PRICING_VIEW, P.PRICING_ESTIMATES_CREATE], role: { id: "sales-role", name: "Sales", isSystem: true } } as AuthUser;
    const admin = { ...partner, id: "admin", permissions: [...partner.permissions, P.PRICING_PRICEBOOKS_MANAGE], role: { id: "admin-role", name: "Admin", isSystem: true, description: null } };
    let actor: AuthUser | undefined;
    const app = express();
    app.use(express.json(), marketRequestContext, (req, _res, next) => { req.authUser = actor; next(); });
    app.use("/pricing", pricingRouter);
    app.use("/admin", priceBookAccessRouter);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
    const send = (path: string, body?: unknown, method = body ? "POST" : "GET") => fetch(origin + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const configuration = { configurationVersion: 1, product: "erp", modules: ["erp-core"], addons: [], customModuleTier: [], customSoftwareTier: null, customNotes: "" };
    const priceBook = { id: "JO", version: PRICING_CATALOG_VERSION, structureVersion: PRODUCT_STRUCTURE_VERSION };
    assert.equal((await send("/pricing/price-books/JO/prices")).status, 401);
    actor = { ...partner, permissions: [] };
    assert.equal((await send("/pricing/price-books/JO/prices")).status, 403);
    actor = admin;
    assert.equal((await send("/pricing/price-books/JO/prices")).status, 403);
    assert.equal((await send("/admin/users/partner/price-books", { scope: "international", defaultBookId: "JO" }, "PUT")).status, 200);
    actor = partner;
    assert.equal((await send("/admin/users/partner/price-books", { scope: "selected", bookIds: [], defaultBookId: null }, "PUT")).status, 403);
    const access = await send("/pricing/price-books");
    assert.equal(access.status, 200);
    const data = (await access.json() as {
        data: {
            books: Array<{
                id: string;
                published: boolean;
            }>;
            defaultBookId: string;
        };
    }).data;
    assert.equal(data.defaultBookId, "JO");
    assert.equal(data.books.length, 3);
    assert.equal(data.books.find(b => b.id === "US")?.published, true);
    const prices = await send("/pricing/price-books/JO/prices");
    assert.equal(prices.status, 200);
    assert.equal(prices.headers.get("cache-control"), "no-store");
    assert.equal((await prices.json() as {
        data: {
            products: Array<{
                id: string;
                quote: {
                    amount: number;
                };
            }>;
        };
    }).data.products.find(p => p.id === "erp")?.quote.amount, 750);
    assert.equal((await send("/pricing/price-books/default/prices")).status, 200);
    assert.equal((await send("/pricing/price-books/calculate", { priceBook, configuration })).status, 200);
    assert.equal((await send("/pricing/price-books/US/prices")).status, 200);
    assert.equal((await send("/pricing/price-books/OTHER/prices")).status, 400);
    assert.equal((await send("/pricing/price-books/calculate", { priceBook, configuration, rate: 1 })).status, 400);
    for (const [path, body] of [["/pricing/prices", undefined], ["/pricing/exchange-rates", undefined], ["/pricing/calculate", { ...configuration, catalogVersion: PRICING_CATALOG_VERSION }], ["/pricing/calculate-converted", { configuration: { ...configuration, catalogVersion: PRICING_CATALOG_VERSION }, currency: "USD" }]] as const) {
        const response = await send(path, body);
        assert.equal(response.status, 409);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.ok(!(await response.text()).includes('"amount"'));
    }
    const save = await send("/pricing/estimates", { title: "Fixture", notes: "", companyId: null, priceBook, configuration });
    assert.equal(save.status, 201);
    const saved = (await save.json() as {
        data: {
            estimate: {
                id: string;
                result: {
                    priceBook: {
                        id: string;
                    };
                };
            };
        };
    }).data.estimate;
    assert.equal(saved.result.priceBook.id, "JO");
    assert.equal((await send("/pricing/estimates/" + saved.id)).status, 200);
    for (const id of ["US", "UK"] as const) {
        const book = publishedPriceBook(id);
        const payload = { title: "Native draft fixture", notes: "", companyId: null, priceBook: { id, version: book.version, structureVersion: book.structureVersion }, configuration };
        const created = await send("/pricing/estimates", payload); assert.equal(created.status, 201);
        const row = (await created.json() as { data: { estimate: { id: string; result: { currency: string; estimatedTotal: number; priceBook: { reviewStatus: string } } } } }).data.estimate;
        assert.equal(row.result.currency, book.currency); assert.equal(row.result.estimatedTotal, id === "US" ? 1500 : 1100); assert.equal(row.result.priceBook.reviewStatus, "draft_v1");
        assert.equal((await send("/pricing/estimates/" + row.id)).status, 200);
        assert.equal((await send("/pricing/estimates/" + row.id + "/copies", payload)).status, 201);
    }
    f.setOutage(true);
    const outage = await send("/pricing/price-books/JO/prices");
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get("set-cookie"), null);
    f.setOutage(false);
    actor = admin;
    assert.equal((await send("/admin/users/partner/price-books", { scope: "selected", bookIds: [], defaultBookId: null }, "PUT")).status, 200);
    actor = partner;
    assert.equal((await send("/pricing/estimates/" + saved.id)).status, 404);
    assert.equal((await send("/pricing/price-books/JO/prices")).status, 403);
    env.PRICING_MODE = "legacy_fx";
    assert.equal((await send("/pricing/price-books")).status, 503);
    assert.equal((await send("/pricing/prices")).status, 200);
});
