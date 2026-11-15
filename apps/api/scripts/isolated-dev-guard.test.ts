import assert from "node:assert/strict";
import test from "node:test";
import { validateChildUrl } from "./isolated-dev-guard";

const child = "postgresql://fixture_user:NOT_A_REAL_PASSWORD@ep-lively-dew-ax64x3u4.c-4.us-east-2.aws.neon.tech/neondb?sslmode=verify-full";
test("isolated runner accepts only the pinned child direct/pooled endpoints", () => {
  assert.equal(validateChildUrl(child), "2c5896552552");
  assert.equal(validateChildUrl(child.replace("ax64x3u4.", "ax64x3u4-pooler.")), "ca9f4d3d5695");
});
test("isolated runner fails closed for parent, unrelated targets and missing TLS", () => {
  for (const value of ["", child.replace("ep-lively-dew-ax64x3u4", "ep-orange-bar-ax1ln5oe-pooler"), child.replace("/neondb", "/other"), child.replace("verify-full", "require"), `${child}&hostaddr=127.0.0.1`]) {
    assert.throws(() => validateChildUrl(value));
  }
});
