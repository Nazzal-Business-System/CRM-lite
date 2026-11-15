import { randomUUID } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env";

interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const options: SignOptions = {
    jwtid: randomUUID(),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): string {
  return verifyLegacyClaims(token).sub;
}

export function verifyLegacyClaims(token: string): { sub: string; iat: number; exp: number } {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string" ||
    typeof payload.iat !== "number" || !Number.isFinite(payload.iat) ||
    typeof payload.exp !== "number" || !Number.isFinite(payload.exp) ||
    payload.iat > Date.now() / 1000 || payload.exp <= payload.iat
  ) {
    throw new Error("Invalid token payload.");
  }

  return { sub: payload.sub, iat: payload.iat as number, exp: payload.exp as number };
}

export function expiryToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid JWT_EXPIRES_IN duration.");
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      throw new Error("Invalid JWT_EXPIRES_IN duration unit.");
  }
}
