import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSION_DEFINITIONS } from "@nbs/shared";
import { permissionCategoryLabel, permissionActionLabel } from "./permission-labels";
import { enMessages } from "../i18n/messages/en";
import { arMessages } from "../i18n/messages/ar";
import { translate } from "../i18n/config";

test("every permission category/action has explicit EN/AR localization, without key fallbacks", () => {
  for (const messages of [enMessages, arMessages]) {
    const t = (key: string) => {
      const value = translate(messages, key);
      assert.notEqual(value, key, `Missing translation: ${key}`);
      return value;
    };
    for (const permission of PERMISSION_DEFINITIONS) {
      const category = permissionCategoryLabel(permission.category, t);
      const action = permissionActionLabel(permission.actionLabel, t);
      assert.ok(!category.includes("roles.") && !action.includes("roles."));
      if (messages === arMessages) { assert.match(category, /[\u0600-\u06ff]/); assert.match(action, /[\u0600-\u06ff]/); }
    }
    assert.ok(permissionCategoryLabel("Sessions", t));
  }
});
test("new or unavailable translations degrade to readable labels, never raw translation keys", () => {
  assert.equal(permissionCategoryLabel("Pricing", key => key), "Pricing");
  assert.equal(permissionActionLabel("Manage price-book access", key => key), "Manage price book access");
  assert.equal(permissionActionLabel("roles.permissions.future_action", key => key), "Future action");
  assert.equal(permissionCategoryLabel("NewCategory", key => key), "New Category");
});
