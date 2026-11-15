import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

import { protectMarketClient } from "./market-access";

export const prisma = protectMarketClient(new PrismaClient({ adapter }));
