import "../src/load-env";
import { env } from "../src/env";
import { prisma } from "../src/lib/prisma";
import { inspectDemoPermissions, provisionDemoPermissions } from "../src/services/demo-permissions.service";
import { verifyChild } from "./isolated-dev-guard";

// Prepared rehearsal tool only: explicitly rejects the shared parent before any query/write.
try {
  const args = process.argv.slice(2);
  const apply = args[0] === "--apply";
  const adminOnly = args.includes("--admin-only");
  if (!apply && args[0] !== "--check") throw new Error("Choose --check or --apply.");
  const roleArgs = args.filter(arg => arg.startsWith("--sales-partner-role-id="));
  const roleIds = roleArgs.map(arg => arg.slice("--sales-partner-role-id=".length));
  const confirm = args.filter(arg => arg.startsWith("--confirm-target="));
  if (args.length !== 1 + roleArgs.length + confirm.length + Number(adminOnly) || confirm.length !== (apply ? 1 : 0) || (adminOnly ? roleIds.length !== 0 : !roleIds.length) || roleIds.some(id => !id || id.length > 128)) throw new Error("Invalid arguments.");
  if (!process.env.DIRECT_URL) throw new Error("Explicit migration URL is required.");
  const runtime = await verifyChild(env.DATABASE_URL);
  await verifyChild(process.env.DIRECT_URL);
  if (apply && confirm[0] !== `--confirm-target=${runtime.fingerprint}`) throw new Error("Target mismatch.");
  const readiness = await prisma.$transaction(async tx => {
    if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return apply ? provisionDemoPermissions(tx, roleIds, adminOnly) : inspectDemoPermissions(tx, roleIds, adminOnly);
  });
  console.log(JSON.stringify({ mode: apply ? "apply" : "check (read-only)", branch: runtime.branch, targetFingerprint: runtime.fingerprint, ...readiness }, null, 2));
} catch {
  console.error("Demo permission synchronization blocked or failed. Verify child target, explicit approved role IDs, arguments and connectivity. No partial operation is committed. Credentials suppressed.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
