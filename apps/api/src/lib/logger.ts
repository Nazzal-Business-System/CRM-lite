import pino from "pino";
import { env } from "../env";

const usePrettyLogs = !env.isProduction && process.stdout.isTTY;

export const logger = pino({
  level: env.isProduction ? "info" : "debug",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "req.headers.cookie",
      "JWT_SECRET",
      "DATABASE_URL",
      "DIRECT_URL",
    ],
    remove: true,
  },
  ...(usePrettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
