import { DEFAULT_API_PORT } from "@nbs/shared";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters."),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGINS: z.string().min(1, "CORS_ORIGINS is required."),
  COOKIE_NAME: z.string().min(1).default("nbs_crm_session"),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const cookieSecure =
  parsed.data.COOKIE_SECURE === "true"
    ? true
    : parsed.data.COOKIE_SECURE === "false"
      ? false
      : parsed.data.NODE_ENV === "production";

if (parsed.data.COOKIE_SAMESITE === "none" && !cookieSecure) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true.");
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  cookieSecure,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
};

if (env.corsOrigins.includes("*")) {
  throw new Error("CORS_ORIGINS cannot include * when using credentialed cookies.");
}
