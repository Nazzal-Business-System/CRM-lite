import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthUser } from "@nbs/shared";
import type { RequestHandler } from "express";

export interface MarketContext {
  actor: () => AuthUser | undefined;
  maintenance?: boolean;
  codes?: Promise<string[]>;
}
export const marketContext = new AsyncLocalStorage<MarketContext>();
export const marketRequestContext: RequestHandler = (req, _res, next) => {
  marketContext.run({ actor: () => req.authUser }, next);
};
// Explicit for approved operator scripts only; never exposed by an API input.
export function withMarketMaintenance<T>(work: () => T): T {
  return marketContext.run({ actor: () => undefined, maintenance: true }, work);
}
