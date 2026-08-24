import "./load-env";

import type { Server } from "node:http";
import { createApp } from "./app";
import { env } from "./env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

type ApiBootState = typeof globalThis & {
  __nbsCrmApiServer?: Server;
};

const boot = globalThis as ApiBootState;

await startApi();

async function closePreviousServer(): Promise<void> {
  const previous = boot.__nbsCrmApiServer;
  if (!previous) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    previous.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  boot.__nbsCrmApiServer = undefined;
}

async function startApi(): Promise<void> {
  let started = false;
  let listenPort = 4000;

  function describeStartupError(error: unknown): string {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = String((error as { code?: string }).code);
      if (code === "EADDRINUSE") {
        return `Port ${listenPort} is already in use. Stop the other process or change PORT.`;
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return "Unknown startup error.";
  }

  function failStartup(error: unknown): never {
    console.error(`API failed to start: ${describeStartupError(error)}`);
    process.exit(1);
  }

  process.on("uncaughtException", (error) => {
    if (!started) {
      failStartup(error);
    }
    console.error("Unhandled exception");
  });

  process.on("unhandledRejection", (reason) => {
    if (!started) {
      failStartup(reason);
    }
    console.error("Unhandled rejection");
  });

  try {
    await closePreviousServer();

    listenPort = env.PORT;
    const app = createApp();
    const localUrl = `http://127.0.0.1:${env.PORT}`;

    const server = app.listen(env.PORT, env.HOST, () => {
      started = true;
      boot.__nbsCrmApiServer = server;
      console.log(`API listening on ${localUrl}`);
      logger.info({ port: env.PORT, host: env.HOST }, `API listening on ${localUrl}`);
    });

    server.on("error", (error) => {
      if (started) {
        return;
      }
      failStartup(error);
    });

    async function shutdown(signal: string) {
      logger.info({ signal }, "Shutting down");
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    }

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    failStartup(error);
  }
}
