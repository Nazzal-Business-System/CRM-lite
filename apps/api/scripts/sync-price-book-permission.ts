import "../src/load-env";
import { env } from "../src/env";
import { prisma } from "../src/lib/prisma";
import { verifyChild } from "./isolated-dev-guard";
import { inspectPriceBookPermission, provisionPriceBookPermission } from "../src/services/price-book-permission.service";
try {
    const args = process.argv.slice(2);
    const apply = args[0] === "--apply";
    if (apply ? args.length !== 2 : args.length !== 1 || args[0] !== "--check")
        throw new Error("Invalid arguments");
    const target = await verifyChild(env.DATABASE_URL);
    await verifyChild(process.env.DIRECT_URL!);
    if (apply && args[1] !== "--confirm-target=" + target.fingerprint)
        throw new Error("Target mismatch");
    const readiness = await prisma.$transaction(async (tx) => { if (!apply)
        await tx.$executeRaw `SET TRANSACTION READ ONLY`;
    else {
        await verifyChild(env.DATABASE_URL);
        await verifyChild(process.env.DIRECT_URL!);
    } return apply ? provisionPriceBookPermission(tx) : inspectPriceBookPermission(tx); });
    console.log(JSON.stringify({ mode: apply ? "apply" : "check (read-only)", branch: target.branch, targetFingerprint: target.fingerprint, ...readiness }));
}
catch {
    console.error("Price-book permission operation blocked or failed. No partial transaction committed; credentials suppressed.");
    process.exitCode = 1;
}
finally {
    await prisma.$disconnect();
}
