import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSION_KEYS } from "@nbs/shared";
import type { NextFunction, Request, Response } from "express";
import { requirePermission } from "./require-permission";

test("sales performance authorization accepts its admin permission", () => {
  let called = false;
  const request = { authUser: { permissions: [PERMISSION_KEYS.SALES_PERFORMANCE_VIEW] } } as Request;
  requirePermission(PERMISSION_KEYS.SALES_PERFORMANCE_VIEW)(request, {} as Response, (() => { called = true; }) as NextFunction);
  assert.equal(called, true);
});

test("sales performance authorization rejects a non-admin permission set", () => {
  const request = { authUser: { permissions: [PERMISSION_KEYS.DASHBOARD_VIEW] } } as Request;
  assert.throws(
    () => requirePermission(PERMISSION_KEYS.SALES_PERFORMANCE_VIEW)(request, {} as Response, (() => undefined) as NextFunction),
    (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 403,
  );
});
