// Dependency helpers preserved from the website; see source-provenance.json. Server-only.
import { moduleById, requiredCoreForProduct } from "./catalog";
import type { DependencyPrompt, ModuleId, ProductId } from "./types";
const uniqueModules = (ids: readonly ModuleId[]): ModuleId[] => Array.from(new Set(ids));

/** Missing hard dependencies for a module given current selection. */
export function missingRequirements(
  moduleId: ModuleId,
  selected: readonly ModuleId[],
): ModuleId[] {
  const item = moduleById[moduleId];
  if (!item?.requires?.length) return [];
  const set = new Set(selected);
  return item.requires.filter((id) => !set.has(id));
}

/**
 * Operations needs Inventory plus either Procurement (for GRN) or Sales (for Delivery).
 * Spec: GRN → Procurement+Inventory; Delivery → Sales+Inventory.
 * Selecting Operations alone is meaningless — require Inventory always,
 * and at least one of Procurement or Sales for a meaningful fulfillment bridge.
 */
export function operationsDependencyGap(
  selected: readonly ModuleId[],
): { missingInventory: boolean; needsFulfillmentChoice: boolean } {
  const missingInventory = !selected.includes("erp-inventory");
  const hasProcure = selected.includes("erp-procurement");
  const hasSales = selected.includes("erp-sales");
  return {
    missingInventory,
    needsFulfillmentChoice: !hasProcure && !hasSales,
  };
}

export function getDependencyPrompt(
  selecting: ModuleId,
  selected: readonly ModuleId[],
): DependencyPrompt | null {
  if (selecting === "erp-operations") {
    const gap = operationsDependencyGap([...selected, selecting]);
    if (!gap.missingInventory && !gap.needsFulfillmentChoice) return null;

    if (gap.needsFulfillmentChoice) {
      // Do not force both Procurement and Sales — offer paths in the UI.
      return {
        selecting,
        missing: gap.missingInventory
          ? ["erp-inventory", "erp-procurement"]
          : ["erp-procurement"],
        messageKey: "operationsNeedsFulfillment",
        alternateMissing: gap.missingInventory
          ? ["erp-inventory", "erp-sales"]
          : ["erp-sales"],
      };
    }

    return {
      selecting,
      missing: ["erp-inventory"],
      messageKey: "operationsNeedsInventory",
    };
  }

  const missing = missingRequirements(selecting, selected);
  if (missing.length === 0) return null;

  const messageKey =
    selecting === "erp-procurement"
      ? "procurementNeedsInventory"
      : selecting === "erp-sales"
        ? "salesNeedsInventory"
        : selecting === "erp-ess"
          ? "essNeedsHr"
          : "genericRequires";

  return { selecting, missing, messageKey };
}

export function recommendedMissing(
  moduleId: ModuleId,
  selected: readonly ModuleId[],
): ModuleId[] {
  const item = moduleById[moduleId];
  if (!item?.recommends?.length) return [];
  const set = new Set(selected);
  return item.recommends.filter((id) => !set.has(id));
}

/** Ensure product core is always present for ERP/POS/IMS. */
export function withRequiredCore(
  product: ProductId,
  modules: readonly ModuleId[],
): ModuleId[] {
  const core = requiredCoreForProduct(product);
  if (!core) return uniqueModules(modules);
  return uniqueModules([core, ...modules]);
}

/**
 * When removing a module, also drop dependents that hard-require it.
 */
export function removeModuleCascading(
  modules: readonly ModuleId[],
  removing: ModuleId,
): ModuleId[] {
  let next = modules.filter((id) => id !== removing);
  let changed = true;
  while (changed) {
    changed = false;
    const set = new Set(next);
    const drop: ModuleId[] = [];
    for (const id of next) {
      const item = moduleById[id];
      if (!item?.requires?.length) continue;
      if (item.requires.some((req) => !set.has(req))) {
        drop.push(id);
      }
    }
    // Operations special: if neither procurement nor sales remains, drop operations
    if (
      set.has("erp-operations") &&
      !set.has("erp-procurement") &&
      !set.has("erp-sales")
    ) {
      drop.push("erp-operations");
    }
    if (drop.length) {
      next = next.filter((id) => !drop.includes(id));
      changed = true;
    }
  }
  return next;
}
