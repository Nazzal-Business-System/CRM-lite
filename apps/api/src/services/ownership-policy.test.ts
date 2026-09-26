import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSION_KEYS } from "@nbs/shared";
import { assertOwnerUpdateAllowed, ownerForCreate } from "./ownership-policy";

const sales = { id: "sales-a", permissions: [PERMISSION_KEYS.OWNERSHIP_REQUESTS_CREATE] };
const admin = { id: "admin", permissions: [PERMISSION_KEYS.OWNERSHIP_ASSIGN] };

test("Sales-created assignable records are owned by the current Sales user", () => {
  assert.equal(ownerForCreate(sales, undefined), sales.id);
  assert.equal(ownerForCreate(sales, sales.id), sales.id);
});

test("Sales cannot create a record assigned to another user", () => {
  assert.throws(() => ownerForCreate(sales, "sales-b"), /only assign new records to yourself/i);
});

test("Sales cannot directly reassign an existing record", () => {
  assert.throws(() => assertOwnerUpdateAllowed(sales, "sales-b", sales.id), /request ownership instead/i);
  assert.throws(() => assertOwnerUpdateAllowed(sales, sales.id, "sales-b"), /request ownership instead/i);
});

test("Unchanged ownership is accepted and authorized admins can reassign", () => {
  assert.doesNotThrow(() => assertOwnerUpdateAllowed(sales, "sales-a", "sales-a"));
  assert.doesNotThrow(() => assertOwnerUpdateAllowed(admin, "sales-a", "sales-b"));
  assert.equal(ownerForCreate(admin, "sales-b"), "sales-b");
});
