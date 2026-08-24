import {
  PERMISSION_DEFINITIONS,
  SALES_DEFAULT_PERMISSIONS,
  SYSTEM_ROLE_NAMES,
} from "@nbs/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { resolve } from "node:path";
import { hashPassword } from "../src/lib/password";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function upsertPermissions() {
  for (const definition of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        description: definition.description,
        category: definition.category,
      },
      update: {
        description: definition.description,
        category: definition.category,
      },
    });
  }
}

async function syncRolePermissions(roleId: string, keys: readonly string[]) {
  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true, key: true },
  });

  const existing = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permissionId: true },
  });

  const existingIds = new Set(existing.map((entry) => entry.permissionId));
  const nextIds = permissions.map((permission) => permission.id);

  await prisma.rolePermission.deleteMany({
    where: {
      roleId,
      permissionId: { notIn: nextIds },
    },
  });

  const toCreate = nextIds.filter((id) => !existingIds.has(id));
  if (toCreate.length > 0) {
    await prisma.rolePermission.createMany({
      data: toCreate.map((permissionId) => ({ roleId, permissionId })),
    });
  }
}

async function syncSalesPermissions(roleId: string) {
  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...SALES_DEFAULT_PERMISSIONS] } },
    select: { id: true },
  });

  const existing = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permissionId: true },
  });

  if (existing.length === 0) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
    });
    return;
  }

  const existingIds = new Set(existing.map((entry) => entry.permissionId));
  const missing = permissions.filter(
    (permission) => !existingIds.has(permission.id),
  );

  if (missing.length > 0) {
    await prisma.rolePermission.createMany({
      data: missing.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
    });
  }
}

async function bootstrapAdmin(adminRoleId: string) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator";

  if (!email || !password) {
    console.log(
      "Skipping admin bootstrap: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are not both set.",
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(
      `Bootstrap admin already exists for ${email}. Password was not changed.`,
    );
    return;
  }

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      roleId: adminRoleId,
      isActive: true,
    },
  });

  console.log(`Created bootstrap administrator: ${email}`);
}

async function main() {
  await upsertPermissions();

  const allPermissions = await prisma.permission.findMany({
    select: { key: true },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: SYSTEM_ROLE_NAMES.ADMIN },
    create: {
      name: SYSTEM_ROLE_NAMES.ADMIN,
      description: "Full access to NBS CRM, including user and role administration.",
      isSystem: true,
    },
    update: {
      isSystem: true,
    },
  });

  const salesRole = await prisma.role.upsert({
    where: { name: SYSTEM_ROLE_NAMES.SALES },
    create: {
      name: SYSTEM_ROLE_NAMES.SALES,
      description: "Operational CRM access without administration privileges.",
      isSystem: true,
    },
    update: {
      isSystem: true,
    },
  });

  await syncRolePermissions(
    adminRole.id,
    allPermissions.map((permission) => permission.key),
  );
  await syncSalesPermissions(salesRole.id);
  await bootstrapAdmin(adminRole.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
