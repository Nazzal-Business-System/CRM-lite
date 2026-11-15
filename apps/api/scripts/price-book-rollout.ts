import { createHash } from "node:crypto";
export const PRICE_BOOK_MIGRATION = "20261114180000_market_price_books";
const checksum = "54513d5171957a6e19d2f3963a9dd6027f4c793016773998f13455eba556af13";
export function guardPriceBookMigration(mode: string, pending: string[], sql: string) {
    if (pending.includes(PRICE_BOOK_MIGRATION) && mode !== "check" && mode !== "migrate-price-books")
        throw new Error("Use the dedicated reviewed price-book migration operation.");
    if (mode === "migrate-price-books" && (pending.length !== 1 || pending[0] !== PRICE_BOOK_MIGRATION || createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex") !== checksum))
        throw new Error("Price-book migration order/checksum mismatch.");
}
