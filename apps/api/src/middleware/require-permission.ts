import type { PermissionKey } from "@nbs/shared";
import { hasPermission } from "@nbs/shared";
import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../lib/errors";

export function requirePermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      throw unauthorized();
    }

    if (!hasPermission(req.authUser.permissions, key)) {
      throw forbidden();
    }

    next();
  };
}
