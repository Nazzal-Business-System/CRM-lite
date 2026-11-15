import {
  addonById,
  customModuleTiers,
  customSoftwareTiers,
  moduleById,
  POS_MANAGEMENT_BUNDLE_PRICE,
  presetById,
  requiredCoreForProduct,
} from "../catalog";
import type {
  AddonId,
  ConfigurationPayload,
  CustomModuleTierId,
  CustomSoftwareTierId,
  DependencyPrompt,
  EstimateResult,
  LineItem,
  ModuleId,
  PresetId,
  ProductId,
  SelectionState,
} from "../types";

function uniqueModules(ids: readonly ModuleId[]): ModuleId[] {
  return Array.from(new Set(ids));
}

function quoteAmount(quote: { kind: string; amount?: number }): {
  amount: number;
  isFloor: boolean;
} {
  if (quote.kind === "exact" && typeof quote.amount === "number") {
    return { amount: quote.amount, isFloor: false };
  }
  if (
    (quote.kind === "starting_from" || quote.kind === "per_session") &&
    typeof quote.amount === "number"
  ) {
    return { amount: quote.amount, isFloor: true };
  }
  return { amount: 0, isFloor: false };
}

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

function arraysEqualAsSets(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/**
 * Preset discount applies only while the selected module set still contains
 * every preset module (extras allowed). If any preset module is removed,
 * fall back to standalone component pricing.
 */
export function resolveActivePreset(
  product: ProductId,
  modules: readonly ModuleId[],
  preferredPresetId: PresetId | null,
): PresetId | null {
  if (!preferredPresetId) {
    // Auto-detect exact preset matches (no extras) for convenience
    for (const [id, preset] of Object.entries(presetById)) {
      if (preset.product !== product) continue;
      if (arraysEqualAsSets(preset.moduleIds, modules)) return id as PresetId;
    }
    return null;
  }

  const preset = presetById[preferredPresetId];
  if (!preset || preset.product !== product) return null;

  const selected = new Set(modules);
  const intact = preset.moduleIds.every((id) => selected.has(id));
  return intact ? preferredPresetId : null;
}

function moduleLineAmount(
  moduleId: ModuleId,
  coveredByPreset: ReadonlySet<ModuleId>,
): number | null {
  // null means covered by preset bundle line
  if (coveredByPreset.has(moduleId)) return null;
  if (moduleId === "pos-management") {
    // When not in management bundle, management delta is unused — POS Management
    // is only priced via the 850 bundle. Standalone shouldn't happen without core.
    return 200;
  }
  return quoteAmount(moduleById[moduleId].quote).amount;
}

export function calculateEstimate(state: SelectionState): EstimateResult {
  const lineItems: LineItem[] = [];
  let estimatedTotal = 0;
  let hasCustomQuotationItems = false;
  let hasStartingFromItems = false;

  if (!state.product) {
    return {
      lineItems: [],
      estimatedTotal: 0,
      hasCustomQuotationItems: false,
      hasStartingFromItems: false,
      presetApplied: null,
      currency: "JOD",
    };
  }

  if (state.product === "custom") {
    if (state.customSoftwareTier) {
      const tier = customSoftwareTiers[state.customSoftwareTier];
      const { amount, isFloor } = quoteAmount(tier.quote);
      lineItems.push({
        id: state.customSoftwareTier,
        kind: "custom-software",
        quote: tier.quote,
        amount,
        isEstimateFloor: isFloor,
      });
      estimatedTotal += amount;
      hasStartingFromItems = true;
    }
    for (const tierId of state.customModuleTier) {
      const tier = customModuleTiers[tierId];
      const { amount, isFloor } = quoteAmount(tier.quote);
      lineItems.push({
        id: tierId,
        kind: "custom-module",
        quote: tier.quote,
        amount,
        isEstimateFloor: isFloor,
      });
      estimatedTotal += amount;
      hasStartingFromItems = true;
    }
  } else {
    const modules = withRequiredCore(state.product, state.modules);
    const activePreset = resolveActivePreset(
      state.product,
      modules,
      state.presetId,
    );

    // Special: POS Management configuration is always the 850 bundle when both selected
    if (
      state.product === "pos" &&
      modules.includes("pos-core") &&
      modules.includes("pos-management")
    ) {
      lineItems.push({
        id: "pos-management-config",
        kind: "preset",
        quote: { kind: "exact", amount: POS_MANAGEMENT_BUNDLE_PRICE },
        amount: POS_MANAGEMENT_BUNDLE_PRICE,
        isEstimateFloor: false,
      });
      estimatedTotal += POS_MANAGEMENT_BUNDLE_PRICE;
    } else if (activePreset) {
      const preset = presetById[activePreset]!; // CRM strict indexed-access typing; no runtime change.
      const covered = new Set(preset.moduleIds);
      lineItems.push({
        id: activePreset,
        kind: "preset",
        quote: { kind: "exact", amount: preset.presetPrice },
        amount: preset.presetPrice,
        isEstimateFloor: false,
      });
      estimatedTotal += preset.presetPrice;

      for (const moduleId of modules) {
        if (covered.has(moduleId)) continue;
        // POS management shouldn't appear as extra under ERP etc.
        const amount = moduleLineAmount(moduleId, covered);
        if (amount === null) continue;
        const item = moduleById[moduleId];
        lineItems.push({
          id: moduleId,
          kind: "module",
          quote: item.quote,
          amount,
          isEstimateFloor: false,
        });
        estimatedTotal += amount;
      }
    } else {
      for (const moduleId of modules) {
        // Skip orphan pos-management priced alone — always with core via bundle path
        if (moduleId === "pos-management") continue;
        const item = moduleById[moduleId];
        const { amount } = quoteAmount(item.quote);
        lineItems.push({
          id: moduleId,
          kind: "module",
          quote: item.quote,
          amount,
          isEstimateFloor: false,
        });
        estimatedTotal += amount;
      }
    }

    for (const tierId of state.customModuleTier) {
      const tier = customModuleTiers[tierId];
      const { amount, isFloor } = quoteAmount(tier.quote);
      lineItems.push({
        id: tierId,
        kind: "custom-module",
        quote: tier.quote,
        amount,
        isEstimateFloor: isFloor,
      });
      estimatedTotal += amount;
      hasStartingFromItems = true;
    }
  }

  for (const addonId of state.addons) {
    const addon = addonById[addonId];
    if (!addon) continue;
    const { amount, isFloor } = quoteAmount(addon.quote);
    if (addon.quote.kind === "custom_quotation") {
      hasCustomQuotationItems = true;
    }
    if (isFloor || addon.quote.kind === "starting_from" || addon.quote.kind === "per_session") {
      hasStartingFromItems = true;
    }
    lineItems.push({
      id: addonId,
      kind: "addon",
      quote: addon.quote,
      amount,
      isEstimateFloor: isFloor || addon.quote.kind === "per_session",
    });
    estimatedTotal += amount;
  }

  const presetApplied =
    state.product === "pos" &&
    state.modules.includes("pos-core") &&
    state.modules.includes("pos-management")
      ? ("pos-management" as PresetId)
      : resolveActivePreset(
          state.product,
          withRequiredCore(state.product, state.modules),
          state.presetId,
        );

  return {
    lineItems,
    estimatedTotal,
    hasCustomQuotationItems,
    hasStartingFromItems,
    presetApplied,
    currency: "JOD",
  };
}

export function createEmptySelection(): SelectionState {
  return {
    product: null,
    presetId: null,
    modules: [],
    addons: [],
    customModuleTier: [],
    customSoftwareTier: null,
    customNotes: "",
  };
}

export function applyPreset(
  product: ProductId,
  presetId: PresetId,
): SelectionState {
  const preset = presetById[presetId];
  if (!preset || preset.product !== product) {
    return {
      ...createEmptySelection(),
      product,
      modules: withRequiredCore(product, []),
    };
  }
  return {
    product,
    presetId,
    modules: [...preset.moduleIds],
    addons: [],
    customModuleTier: [],
    customSoftwareTier: null,
    customNotes: "",
  };
}

export function toConfigurationPayload(
  state: SelectionState,
  estimate: EstimateResult,
): ConfigurationPayload | null {
  if (!state.product) return null;
  return {
    version: 1,
    product: state.product,
    presetId: estimate.presetApplied,
    modules: withRequiredCore(state.product, state.modules),
    addons: state.addons,
    customModuleTier: state.customModuleTier,
    customSoftwareTier: state.customSoftwareTier,
    customNotes: state.customNotes.trim(),
    claimedEstimate: estimate.estimatedTotal,
  };
}

const MODULE_IDS = new Set(Object.keys(moduleById));
const ADDON_IDS = new Set(Object.keys(addonById));
const CUSTOM_MODULE_TIERS = new Set(
  Object.keys(customModuleTiers) as CustomModuleTierId[],
);
const CUSTOM_SOFTWARE_TIERS = new Set(
  Object.keys(customSoftwareTiers) as CustomSoftwareTierId[],
);
const PRODUCTS = new Set<ProductId>(["erp", "pos", "ims", "custom"]);

/**
 * Reconstruct a trusted estimate from a client payload.
 * Ignores claimedEstimate; recalculates from known catalog IDs only.
 */
export function reconstructEstimateFromPayload(
  raw: unknown,
): { ok: true; payload: ConfigurationPayload; estimate: EstimateResult } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_payload" };
  }
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) return { ok: false, error: "unsupported_version" };

  const product = data.product;
  if (typeof product !== "string" || !PRODUCTS.has(product as ProductId)) {
    return { ok: false, error: "invalid_product" };
  }

  const modules = Array.isArray(data.modules)
    ? (data.modules.filter(
        (id): id is ModuleId => typeof id === "string" && MODULE_IDS.has(id),
      ) as ModuleId[])
    : [];

  const addons = Array.isArray(data.addons)
    ? (data.addons.filter(
        (id): id is AddonId => typeof id === "string" && ADDON_IDS.has(id),
      ) as AddonId[])
    : [];

  const customModuleTier = Array.isArray(data.customModuleTier)
    ? (data.customModuleTier.filter(
        (id): id is CustomModuleTierId =>
          typeof id === "string" && CUSTOM_MODULE_TIERS.has(id as CustomModuleTierId),
      ) as CustomModuleTierId[])
    : [];

  const customSoftwareTier =
    typeof data.customSoftwareTier === "string" &&
    CUSTOM_SOFTWARE_TIERS.has(data.customSoftwareTier as CustomSoftwareTierId)
      ? (data.customSoftwareTier as CustomSoftwareTierId)
      : null;

  const presetId =
    typeof data.presetId === "string" && presetById[data.presetId]
      ? (data.presetId as PresetId)
      : null;

  const customNotes =
    typeof data.customNotes === "string"
      ? data.customNotes.trim().slice(0, 2000)
      : "";

  const state: SelectionState = {
    product: product as ProductId,
    presetId,
    modules: withRequiredCore(product as ProductId, modules),
    addons,
    customModuleTier,
    customSoftwareTier,
    customNotes,
  };

  const estimate = calculateEstimate(state);
  const payload = toConfigurationPayload(state, estimate);
  if (!payload) return { ok: false, error: "empty_selection" };

  return { ok: true, payload, estimate };
}

export function formatConfigurationSummary(
  payload: ConfigurationPayload,
  estimate: EstimateResult,
  labels: {
    productNames: Record<ProductId, string>;
    moduleNames: Partial<Record<ModuleId, string>>;
    addonNames: Partial<Record<AddonId, string>>;
    customModuleNames: Partial<Record<CustomModuleTierId, string>>;
    customSoftwareNames: Partial<Record<CustomSoftwareTierId, string>>;
    estimatedLabel: string;
    jod: (n: number) => string;
  },
): string {
  const lines: string[] = [];
  lines.push(`Product: ${labels.productNames[payload.product]}`);
  if (payload.presetId) {
    lines.push(`Configuration: ${payload.presetId}`);
  } else {
    lines.push("Configuration: Custom");
  }
  lines.push("");
  if (payload.modules.length) {
    lines.push("Modules:");
    for (const id of payload.modules) {
      lines.push(`- ${labels.moduleNames[id] ?? id}`);
    }
  }
  if (payload.addons.length) {
    lines.push("");
    lines.push("Add-ons:");
    for (const id of payload.addons) {
      lines.push(`- ${labels.addonNames[id] ?? id}`);
    }
  }
  if (payload.customModuleTier.length) {
    lines.push("");
    lines.push("Custom modules:");
    for (const id of payload.customModuleTier) {
      lines.push(`- ${labels.customModuleNames[id] ?? id}`);
    }
  }
  if (payload.customSoftwareTier) {
    lines.push("");
    lines.push(
      `Custom software: ${labels.customSoftwareNames[payload.customSoftwareTier] ?? payload.customSoftwareTier}`,
    );
  }
  if (payload.customNotes) {
    lines.push("");
    lines.push(`Notes: ${payload.customNotes}`);
  }
  lines.push("");
  const suffix =
    estimate.hasStartingFromItems || estimate.hasCustomQuotationItems
      ? "+"
      : "";
  lines.push(
    `${labels.estimatedLabel}: ${labels.jod(estimate.estimatedTotal)}${suffix}`,
  );
  return lines.join("\n");
}
