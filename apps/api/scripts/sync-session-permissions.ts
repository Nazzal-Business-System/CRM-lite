import "../src/load-env";
import { createHash } from "node:crypto";
import { env } from "../src/env";
import { prisma } from "../src/lib/prisma";
import { inspectSessionPermissions, provisionSessionPermissions } from "../src/services/session-permissions.service";

const args = process.argv.slice(2);
const check = args.length === 0 || (args.length === 1 && args[0] === "--check");
const apply = args.length === 2 && args[0] === "--apply" && args[1]?.startsWith("--confirm-target=");
const database = new URL(env.DATABASE_URL);
const target = createHash("sha256").update(database.hostname + database.pathname).digest("hex").slice(0, 12);
try {
  if (!check && !apply) throw new Error("Use --check, or --apply --confirm-target=<fingerprint from check>.");
  if (apply && args[1] !== `--confirm-target=${target}`) throw new Error("Target confirmation does not match; no changes were made.");
  const readiness = await prisma.$transaction(async (tx) => {
    if (check) {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return inspectSessionPermissions(tx);
    }
    return provisionSessionPermissions(tx);
  });
  const ready = readiness.adminRoleReady && readiness.missingPermissions.length === 0 && readiness.missingAdminGrants.length === 0;
  console.log(JSON.stringify({ ready, mode: check ? "check (read-only)" : "apply", database: database.pathname.slice(1), targetFingerprint: target, ...readiness }, null, 2));
  if (!readiness.adminRoleReady) process.exitCode = 1;
} catch {
  // Do not print driver messages that may contain connection details.
  console.error("Session permission synchronization did not complete. Check arguments, target, database connectivity, and the existing system Admin role. No partial provisioning is committed.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
