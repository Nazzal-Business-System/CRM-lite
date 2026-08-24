import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env";

interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.sub !== "string"
  ) {
    throw new Error("Invalid token payload.");
  }

  return payload.sub;
}

export function expiryToMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return 8 * 60 * 60 * 1000;
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
      return 8 * 60 * 60 * 1000;
  }
}
