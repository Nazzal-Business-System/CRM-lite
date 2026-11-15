import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import { protectMarketClient } from "./market-access";
import { marketContext } from "./market-context";

// Validate the real generated query shapes. The only connection target is an unreachable
// loopback fixture; no environment URL, real credential or database mutation is used.
test("scoped queries and nested counts validate against the generated Prisma schema", async (t) => {
  const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://isolated:isolated@127.0.0.1:1/isolated", connectionTimeoutMillis:500 }) });
  t.after(async () => { await raw.$disconnect(); });
  raw.userSalesMarket.findMany = (async () => [{ marketCode: "JO" }]) as unknown as typeof raw.userSalesMarket.findMany;
  const client = protectMarketClient(raw);
  const actor = { id: "fixture", role: { name: "Sales", isSystem: true }, permissions: [] } as unknown as AuthUser;
  const readQueries = () => [
    client.company.findMany({ where: { AND: [{ name: { contains: "fixture" } }] }, include: { tasks: true, owner: { select: { id: true } }, _count: { select: { contacts: true, opportunities: true, tasks: true } } } }),
    client.company.findUnique({ where: { id: "fixture" } }),
    client.contact.findMany({ include: { company: true, _count: { select: { activities: true } } } }),
    client.opportunity.findMany({ include: { company: true, primaryContact: true } }),
    client.activity.findMany({ include: { company: true, contact: true, opportunity: true } }),
    client.task.findMany({ include: { company: true, contact: true, opportunity: true } }),
    client.researchEvidence.findMany(), client.hypothesis.findMany(), client.salesMarket.findMany(),
    client.opportunity.groupBy({ by: ["stage"], _count: { _all: true } }),
  ];
  await marketContext.run({ actor: () => actor }, async () => {
    const results = await Promise.allSettled(readQueries());
    for (const result of results) {
      assert.equal(result.status, "rejected", "the isolated connection must remain unreachable");
      if (result.status === "rejected") {
        assert.ok(!(result.reason instanceof Prisma.PrismaClientValidationError), "authorization query must validate against real Prisma types");
        assert.ok(["P1001", "ECONNREFUSED", "P2010", "SERVICE_UNAVAILABLE"].includes(String((result.reason as { code?: string }).code)) || /connect|connection|database server/i.test(String(result.reason)), "only the unreachable database boundary may fail");
      }
    }
  });
});

test("estimate ownership/market predicates validate against real generated Prisma types", async t => {
  const raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://isolated:isolated@127.0.0.1:1/isolated", connectionTimeoutMillis: 500 }) });
  t.after(async () => { await raw.$disconnect(); });
  raw.userSalesMarket.findMany = (async () => [{ marketCode: "JO" }]) as unknown as typeof raw.userSalesMarket.findMany;
  const client = protectMarketClient(raw);
  const actor = { id: "fixture", role: { name: "Sales", isSystem: true }, permissions: [PERMISSION_KEYS.PRICING_VIEW, PERMISSION_KEYS.COMPANIES_VIEW] } as unknown as AuthUser;
  await marketContext.run({ actor: () => actor }, async () => {
    const results = await Promise.allSettled([
      client.pricingEstimate.findUnique({ where: { id: "fixture" } }),
      client.pricingEstimate.findMany({ where: { title: { contains: "fixture", mode: "insensitive" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 }),
      client.pricingEstimate.count(),
    ]);
    for (const result of results) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") {
        assert.equal(result.reason instanceof Prisma.PrismaClientValidationError, false);
        assert.ok(["P1001", "ECONNREFUSED", "P2010", "SERVICE_UNAVAILABLE"].includes(String((result.reason as { code?: string }).code)) || /connect|connection|database server/i.test(String(result.reason)));
      }
    }
  });
});
