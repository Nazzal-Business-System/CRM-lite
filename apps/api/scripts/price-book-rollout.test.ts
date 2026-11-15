import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { guardPriceBookMigration, PRICE_BOOK_MIGRATION } from "./price-book-rollout";
test("price-book migration requires its dedicated operation, sole pending migration and pinned SQL", () => {
    const sql = readFileSync(new URL("../prisma/migrations/20261114180000_market_price_books/migration.sql", import.meta.url), "utf8");
    assert.doesNotThrow(() => guardPriceBookMigration("check", [PRICE_BOOK_MIGRATION], sql));
    assert.doesNotThrow(() => guardPriceBookMigration("migrate-price-books", [PRICE_BOOK_MIGRATION], sql));
    assert.doesNotThrow(() => guardPriceBookMigration("migrate-price-books", [PRICE_BOOK_MIGRATION], sql.replaceAll("\n", "\r\n")));
    for (const mode of ["migrate", "migrate-pricing", "migrate-partners"])
        assert.throws(() => guardPriceBookMigration(mode, [PRICE_BOOK_MIGRATION], sql));
    for (const pending of [[], ["unexpected"], [PRICE_BOOK_MIGRATION, "unexpected"]])
        assert.throws(() => guardPriceBookMigration("migrate-price-books", pending, sql));
    assert.throws(() => guardPriceBookMigration("migrate-price-books", [PRICE_BOOK_MIGRATION], `${sql}\n-- altered`));
});
