// In-memory Prisma boundary for session tests: never opens a database connection.
import type { TestContext } from "node:test";
import type { Prisma, Session } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { userAccessInclude } from "../lib/serialize";
type User = Prisma.UserGetPayload<{ include: typeof userAccessInclude }>;

export function sessionStore(t: TestContext) {
  let user: User = {
    accountType: "INTERNAL", defaultMarketCode: null, marketMemberships: [],
    id: "test-user", name: "Test", email: "test@example.com", passwordHash: "verified-hash",
    roleId: "sales", isActive: true, sessionVersion: 0, legacyInvalidBefore: null,
    lastLoginAt: null, createdAt: new Date(), updatedAt: new Date(),
    role: { id: "sales", name: "Sales", description: null, isSystem: true, createdAt: new Date(), updatedAt: new Date(), permissions: [] },
  };
  const users = new Map<string, User>([[user.id, user]]);
  const rows = new Map<string, Session>();
  const audits: Record<string, unknown>[] = [];
  let auditOutage = false;
  let managementOutage = false;
  let lastListArgs: Prisma.SessionFindManyArgs | undefined;
  let outage = false;
  let touchOutage = false;
  let writes = 0;
  let beforeTouch: (() => void) | undefined;
  const check = () => { if (outage) throw new Error("database unavailable"); };
  const include = (row: Session | undefined) => row ? { ...row, user: { ...users.get(row.userId)! } } : null;
  const matches = (row: Session, where: Prisma.SessionWhereInput = {}): boolean => {
    if (typeof where.id === "string" && row.id !== where.id) return false;
    if (typeof where.id === "object" && where.id.not === row.id) return false;
    if (where.userId && where.userId !== row.userId) return false;
    if (where.tokenHash && where.tokenHash !== row.tokenHash) return false;
    if (where.revokedAt === null && row.revokedAt) return false;
    if (where.revokedAt && typeof where.revokedAt === "object" && "not" in where.revokedAt && !row.revokedAt) return false;
    if (typeof where.isLegacy === "boolean" && row.isLegacy !== where.isLegacy) return false;
    if (where.lastActivityAt instanceof Date && where.lastActivityAt.getTime() !== row.lastActivityAt.getTime()) return false;
    if (where.idleExpiresAt && row.idleExpiresAt <= (where.idleExpiresAt as { gt: Date }).gt) return false;
    if (where.absoluteExpiresAt && row.absoluteExpiresAt <= (where.absoluteExpiresAt as { gt: Date }).gt) return false;
    if (where.createdAt) {
      const range = where.createdAt as { gte?: Date; lte?: Date };
      if (range.gte && row.createdAt < range.gte) return false;
      if (range.lte && row.createdAt > range.lte) return false;
    }
    const target = users.get(row.userId)!;
    if (where.user) {
      const condition = where.user as Prisma.UserWhereInput;
      if (typeof condition.isActive === "boolean" && target.isActive !== condition.isActive) return false;
      if (typeof condition.sessionVersion === "number" && target.sessionVersion !== condition.sessionVersion) return false;
      if (condition.OR && !condition.OR.some((entry) => {
        const name = entry.name as { contains?: string } | undefined;
        const email = entry.email as { contains?: string } | undefined;
        return Boolean(name?.contains && target.name.toLowerCase().includes(name.contains.toLowerCase())) ||
          Boolean(email?.contains && target.email.toLowerCase().includes(email.contains.toLowerCase()));
      })) return false;
    }
    return true;
  };
  const originals = {
    list: prisma.session.findMany, count: prisma.session.count, first: prisma.session.findFirst,
    find: prisma.session.findUnique, create: prisma.session.create, upsert: prisma.session.upsert,
    update: prisma.session.updateMany, userFind: prisma.user.findUnique, userUpdate: prisma.user.update,
    transaction: prisma.$transaction, raw: prisma.$queryRaw, audit: prisma.auditLog.create,
    mode: env.SESSION_TOKEN_MODE, legacy: env.ACCEPT_LEGACY_JWT,
  };
  const create = (data: Session) => {
    check();
    const row = Object.assign({ id: `session-${rows.size + 1}`, isLegacy: false, revokedAt: null, revocationReason: null, userAgent: null }, data);
    rows.set(row.tokenHash, row);
    return include(row)!;
  };
  prisma.session.findUnique = (async ({ where }: { where: { tokenHash: string } }) => { check(); return include(rows.get(where.tokenHash)); }) as unknown as typeof prisma.session.findUnique;
  prisma.session.create = (async ({ data }: { data: Session }) => create(data)) as unknown as typeof prisma.session.create;
  prisma.session.upsert = (async ({ where, create: data }: { where: { tokenHash: string }; create: Session }) => { check(); return include(rows.get(where.tokenHash)) ?? create(data); }) as unknown as typeof prisma.session.upsert;
  prisma.session.updateMany = (async ({ where, data }: { where: Prisma.SessionWhereInput; data: Partial<Session> }) => {
    const hook = beforeTouch; beforeTouch = undefined; hook?.();
    check(); if (touchOutage) throw new Error("activity write failed");
    let count = 0;
    for (const [hash, row] of rows) {
      if (!matches(row, where)) continue;
      rows.set(hash, { ...row, ...data }); count += 1;
    }
    writes += 1;
    return { count };
  }) as unknown as typeof prisma.session.updateMany;
  prisma.session.findFirst = (async ({ where }: Prisma.SessionFindFirstArgs) => {
    check(); if (managementOutage) throw new Error("session reads unavailable");
    return include([...rows.values()].find((row) => matches(row, where)));
  }) as unknown as typeof prisma.session.findFirst;
  prisma.session.findMany = (async (args: Prisma.SessionFindManyArgs) => {
    check(); if (managementOutage) throw new Error("session reads unavailable");
    lastListArgs = args;
    return [...rows.values()].filter((row) => matches(row, args.where))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.size)).map((row) => include(row));
  }) as unknown as typeof prisma.session.findMany;
  prisma.session.count = (async ({ where }: Prisma.SessionCountArgs) => {
    check(); if (managementOutage) throw new Error("session reads unavailable");
    return [...rows.values()].filter((row) => matches(row, where)).length;
  }) as unknown as typeof prisma.session.count;
  prisma.user.findUnique = (async ({ where }: { where: { id?: string; email?: string } }) => {
    check(); const target = where.id ? users.get(where.id) : [...users.values()].find((entry) => entry.email === where.email);
    return target ? { ...target } : null;
  }) as unknown as typeof prisma.user.findUnique;
  prisma.user.update = (async ({ where, data }: { where: { id: string }; data: Omit<Partial<User>, "sessionVersion"> & { sessionVersion?: number | { increment: number } } }) => {
    check();
    const { sessionVersion, ...rest } = data;
    const target = users.get(where.id)!;
    const updated = { ...target, ...rest, sessionVersion: typeof sessionVersion === "object" ? target.sessionVersion + sessionVersion.increment : sessionVersion ?? target.sessionVersion };
    users.set(updated.id, updated);
    if (updated.id === user.id) user = updated;
    return { ...updated };
  }) as unknown as typeof prisma.user.update;
  prisma.$queryRaw = (async () => { check(); return []; }) as unknown as typeof prisma.$queryRaw;
  prisma.$transaction = (async (fn: (tx: typeof prisma) => Promise<unknown>) => {
    check();
    const savedUser = { ...user }; const savedRows = new Map(rows); const savedUsers = new Map(users); const auditCount = audits.length;
    try { return await fn(prisma); } catch (error) { user = savedUser; users.clear(); savedUsers.forEach((entry, id) => users.set(id, entry)); rows.clear(); savedRows.forEach((row, hash) => rows.set(hash, row)); audits.length = auditCount; throw error; }
  }) as unknown as typeof prisma.$transaction;
  prisma.auditLog.create = (async ({ data }: { data: Record<string, unknown> }) => { check(); if (auditOutage) throw new Error("audit unavailable"); audits.push(data); return {}; }) as unknown as typeof prisma.auditLog.create;
  t.after(() => {
    prisma.session.findMany = originals.list; prisma.session.count = originals.count; prisma.session.findFirst = originals.first;
    prisma.session.findUnique = originals.find; prisma.session.create = originals.create;
    prisma.session.upsert = originals.upsert; prisma.session.updateMany = originals.update;
    prisma.user.findUnique = originals.userFind; prisma.user.update = originals.userUpdate;
    prisma.$transaction = originals.transaction; prisma.$queryRaw = originals.raw; prisma.auditLog.create = originals.audit;
    env.SESSION_TOKEN_MODE = originals.mode; env.ACCEPT_LEGACY_JWT = originals.legacy;
  });
  env.SESSION_TOKEN_MODE = "opaque"; env.ACCEPT_LEGACY_JWT = "true";
  return {
    beforeTouch: (hook: () => void) => { beforeTouch = hook; },
    rows, audits, get lastListArgs() { return lastListArgs; },
    get user() { return user; }, setUser: (patch: Partial<User>) => { user = { ...user, ...patch }; users.set(user.id, user); },
    addUser: (patch: Partial<User> & { id: string }) => { const added = { ...user, ...patch }; users.set(added.id, added); return added; },
    setAuditOutage: (value: boolean) => { auditOutage = value; },
    setManagementOutage: (value: boolean) => { managementOutage = value; },
    setOutage: (value: boolean) => { outage = value; }, setTouchOutage: (value: boolean) => { touchOutage = value; },
    get writes() { return writes; },
  };
}
