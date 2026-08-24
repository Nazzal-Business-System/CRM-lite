import type { CookieOptions, Response } from "express";
import { env } from "../env";
import { expiryToMs } from "./jwt";

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: expiryToMs(env.JWT_EXPIRES_IN),
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}
