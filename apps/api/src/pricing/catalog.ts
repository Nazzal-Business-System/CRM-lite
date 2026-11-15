import type {
  AddonDef,
  AddonId,
  CatalogItem,
  CustomModuleTierId,
  CustomSoftwareTierId,
  ModuleId,
  PresetDef,
  PriceQuote,
  ProductId,
} from "./types";

/** Public starting references for comparison cards (not ERP Core alone). */
export const publicStartingPrices: Record<
  ProductId,
  { readonly amount: number; readonly noteKey: string }
> = {
  pos: { amount: 650, noteKey: "fromCore" },
  ims: { amount: 750, noteKey: "fromCore" },
  erp: { amount: 1450, noteKey: "fromMeaningfulConfig" },
  custom: { amount: 1000, noteKey: "fromFocused" },
};

export const productAccents: Record<ProductId, "cobalt" | "violet" | "cyan" | "emerald"> = {
  erp: "cobalt",
  pos: "violet",
  ims: "cyan",
  custom: "emerald",
};

export const ERP_CORE: ModuleId = "erp-core";
export const POS_CORE: ModuleId = "pos-core";
export const IMS_CORE: ModuleId = "ims-core";

export const erpModules: readonly CatalogItem[] = [
  {
    id: "erp-core",
    product: "erp",
    quote: { kind: "exact", amount: 750 },
    required: true,
    honesty: "complete",
    featureKeys: [
      "organization",
      "auth",
      "rbac",
      "dashboard",
      "audit",
      "searchNotifications",
      "bilingual",
      "foundation",
    ],
  },
  {
    id: "erp-inventory",
    product: "erp",
    quote: { kind: "exact", amount: 550 },
    honesty: "limitations",
    featureKeys: [
      "products",
      "warehouses",
      "balances",
      "movements",
      "reservations",
      "transfers",
      "visibility",
    ],
  },
  {
    id: "erp-procurement",
    product: "erp",
    quote: { kind: "exact", amount: 400 },
    requires: ["erp-inventory"],
    honesty: "complete",
    featureKeys: ["vendors", "purchaseOrders", "workflow", "records", "warehouseContext"],
  },
  {
    id: "erp-sales",
    product: "erp",
    quote: { kind: "exact", amount: 450 },
    requires: ["erp-inventory"],
    honesty: "complete",
    featureKeys: ["customers", "salesOrders", "workflow", "reservations", "records"],
  },
  {
    id: "erp-operations",
    product: "erp",
    quote: { kind: "exact", amount: 350 },
    requires: ["erp-inventory"],
    honesty: "complete",
    featureKeys: ["goodsReceipt", "delivery", "stockWorkflows", "fulfillmentBridge"],
  },
  {
    id: "erp-finance",
    product: "erp",
    quote: { kind: "exact", amount: 550 },
    recommends: ["erp-accounting"],
    honesty: "complete",
    featureKeys: ["ar", "ap", "invoices", "bills", "payments", "aging"],
  },
  {
    id: "erp-accounting",
    product: "erp",
    quote: { kind: "exact", amount: 550 },
    honesty: "limitations",
    featureKeys: ["coa", "journals", "ledger", "trialBalance", "posting"],
  },
  {
    id: "erp-hr",
    product: "erp",
    quote: { kind: "exact", amount: 600 },
    honesty: "complete",
    featureKeys: [
      "employees",
      "departments",
      "attendance",
      "leave",
      "payroll",
      "contracts",
      "documents",
    ],
  },
  {
    id: "erp-ess",
    product: "erp",
    quote: { kind: "exact", amount: 200 },
    requires: ["erp-hr"],
    honesty: "complete",
    featureKeys: ["selfProfile", "selfAttendance", "selfLeave", "selfPayroll", "selfDocs"],
  },
  {
    id: "erp-crm",
    product: "erp",
    quote: { kind: "exact", amount: 350 },
    recommends: ["erp-sales"],
    honesty: "limitations",
    featureKeys: ["leads", "opportunities", "activities", "pipeline"],
  },
  {
    id: "erp-projects",
    product: "erp",
    quote: { kind: "exact", amount: 300 },
    honesty: "complete",
    featureKeys: ["projects", "tasks", "milestones"],
  },
  {
    id: "erp-support",
    product: "erp",
    quote: { kind: "exact", amount: 300 },
    honesty: "limitations",
    featureKeys: ["tickets", "categories", "comments", "assignment"],
  },
  {
    id: "erp-knowledge",
    product: "erp",
    quote: { kind: "exact", amount: 200 },
    honesty: "complete",
    featureKeys: ["articles", "categories", "tags", "publish"],
  },
  {
    id: "erp-reporting",
    product: "erp",
    quote: { kind: "exact", amount: 250 },
    honesty: "limitations",
    featureKeys: ["summaries", "charts", "moduleAware", "onScreen"],
  },
] as const;

export const posModules: readonly CatalogItem[] = [
  {
    id: "pos-core",
    product: "pos",
    quote: { kind: "exact", amount: 650 },
    required: true,
    honesty: "limitations",
    featureKeys: [
      "terminal",
      "catalog",
      "cart",
      "sales",
      "stock",
      "barcodeSoftware",
      "payments",
      "history",
      "shifts",
      "reports",
      "bilingual",
      "receipts",
      "browserPrint",
    ],
  },
  {
    id: "pos-management",
    product: "pos",
    quote: { kind: "exact", amount: 200 },
    requires: ["pos-core"],
    honesty: "complete",
    featureKeys: ["voids", "refunds", "partialRefunds", "approvals", "managerControls", "mgmtReports"],
  },
] as const;

/** POS Management is sold as a full configuration at 850, not Core+200 à la carte in the UI. */
export const POS_MANAGEMENT_BUNDLE_PRICE = 850;

export const imsModules: readonly CatalogItem[] = [
  {
    id: "ims-core",
    product: "ims",
    quote: { kind: "exact", amount: 750 },
    required: true,
    honesty: "limitations",
    featureKeys: [
      "products",
      "categories",
      "suppliers",
      "warehouses",
      "quantity",
      "movements",
      "lowStock",
      "notifications",
      "dashboard",
      "reports",
      "rbac",
      "bilingual",
    ],
  },
  {
    id: "ims-purchasing",
    product: "ims",
    quote: { kind: "exact", amount: 300 },
    requires: ["ims-core"],
    honesty: "limitations",
    featureKeys: ["purchaseOrders", "items", "receiving", "supplierWorkflow", "stockUpdate"],
  },
  {
    id: "ims-reorder",
    product: "ims",
    quote: { kind: "exact", amount: 200 },
    requires: ["ims-core"],
    honesty: "limitations",
    featureKeys: ["reorderRules", "draftPlanning", "manualTrigger"],
  },
  {
    id: "ims-import-export",
    product: "ims",
    quote: { kind: "exact", amount: 100 },
    requires: ["ims-core"],
    honesty: "limitations",
    featureKeys: ["csvExport", "jsonExport", "csvImport"],
  },
] as const;

export const allModules: readonly CatalogItem[] = [
  ...erpModules,
  ...posModules,
  ...imsModules,
];

export const moduleById: Readonly<Record<ModuleId, CatalogItem>> = Object.fromEntries(
  allModules.map((m) => [m.id, m]),
) as Readonly<Record<ModuleId, CatalogItem>>;

export const presets: readonly PresetDef[] = [
  {
    id: "erp-operations",
    product: "erp",
    moduleIds: [
      "erp-core",
      "erp-inventory",
      "erp-procurement",
      "erp-sales",
      "erp-operations",
    ],
    componentTotal: 2500,
    presetPrice: 2350,
  },
  {
    id: "erp-business",
    product: "erp",
    moduleIds: [
      "erp-core",
      "erp-inventory",
      "erp-procurement",
      "erp-sales",
      "erp-operations",
      "erp-finance",
      "erp-accounting",
      "erp-reporting",
    ],
    componentTotal: 3850,
    presetPrice: 3600,
    recommended: true,
  },
  {
    id: "erp-complete",
    product: "erp",
    moduleIds: [
      "erp-core",
      "erp-inventory",
      "erp-procurement",
      "erp-sales",
      "erp-operations",
      "erp-finance",
      "erp-accounting",
      "erp-hr",
      "erp-ess",
      "erp-reporting",
    ],
    componentTotal: 4650,
    presetPrice: 4300,
  },
  {
    id: "pos-core",
    product: "pos",
    moduleIds: ["pos-core"],
    componentTotal: 650,
    presetPrice: 650,
  },
  {
    id: "pos-management",
    product: "pos",
    moduleIds: ["pos-core", "pos-management"],
    componentTotal: 850,
    presetPrice: 850,
    recommended: true,
  },
  {
    id: "ims-core",
    product: "ims",
    moduleIds: ["ims-core"],
    componentTotal: 750,
    presetPrice: 750,
  },
  {
    id: "ims-purchasing",
    product: "ims",
    moduleIds: ["ims-core", "ims-purchasing"],
    componentTotal: 1050,
    presetPrice: 1050,
  },
  {
    id: "ims-operations",
    product: "ims",
    moduleIds: ["ims-core", "ims-purchasing", "ims-reorder"],
    componentTotal: 1250,
    presetPrice: 1200,
  },
] as const;

export const presetById: Readonly<Record<string, PresetDef>> = Object.fromEntries(
  presets.map((p) => [p.id, p]),
);

export const addons: readonly AddonDef[] = [
  { id: "custom-report", quote: { kind: "starting_from", amount: 150 } },
  { id: "custom-dashboard", quote: { kind: "starting_from", amount: 250 } },
  { id: "report-export-pack", quote: { kind: "starting_from", amount: 150 } },
  { id: "data-migration", quote: { kind: "starting_from", amount: 150 } },
  { id: "custom-document", quote: { kind: "starting_from", amount: 100 } },
  {
    id: "email-notifications",
    quote: { kind: "starting_from", amount: 150 },
    externalCostNote: true,
  },
  {
    id: "whatsapp-integration",
    quote: { kind: "starting_from", amount: 250 },
    externalCostNote: true,
  },
  { id: "third-party-api", quote: { kind: "starting_from", amount: 300 } },
  {
    id: "payment-gateway",
    quote: { kind: "starting_from", amount: 350 },
    externalCostNote: true,
  },
  { id: "custom-approval", quote: { kind: "starting_from", amount: 250 } },
  { id: "staff-training", quote: { kind: "per_session", amount: 100 } },
] as const;

export const addonById: Readonly<Record<string, AddonDef>> = Object.fromEntries(
  addons.map((a) => [a.id, a]),
);

export const customModuleTiers: Readonly<
  Record<CustomModuleTierId, { readonly quote: PriceQuote }>
> = {
  "focused-module": { quote: { kind: "starting_from", amount: 400 } },
  "business-module": { quote: { kind: "starting_from", amount: 700 } },
  "advanced-module": { quote: { kind: "starting_from", amount: 1200 } },
};

export const customSoftwareTiers: Readonly<
  Record<CustomSoftwareTierId, { readonly quote: PriceQuote }>
> = {
  "focused-workflow": { quote: { kind: "starting_from", amount: 1000 } },
  "connected-system": { quote: { kind: "starting_from", amount: 2500 } },
  "larger-platform": { quote: { kind: "starting_from", amount: 5000 } },
};

export const erpGrowthModuleIds: readonly ModuleId[] = [
  "erp-crm",
  "erp-projects",
  "erp-support",
  "erp-knowledge",
];

export const erpCoreBusinessModuleIds: readonly ModuleId[] = [
  "erp-inventory",
  "erp-procurement",
  "erp-sales",
  "erp-operations",
  "erp-finance",
  "erp-accounting",
  "erp-hr",
  "erp-ess",
  "erp-reporting",
];

/** Presentation groups for ERP module catalogue / builder (no price impact). */
export const erpModuleGroups = [
  {
    id: "foundation",
    moduleIds: ["erp-core"] as const satisfies readonly ModuleId[],
  },
  {
    id: "operations",
    moduleIds: [
      "erp-inventory",
      "erp-procurement",
      "erp-sales",
      "erp-operations",
    ] as const satisfies readonly ModuleId[],
  },
  {
    id: "finance",
    moduleIds: ["erp-finance", "erp-accounting"] as const satisfies readonly ModuleId[],
  },
  {
    id: "people",
    moduleIds: ["erp-hr", "erp-ess"] as const satisfies readonly ModuleId[],
  },
  {
    id: "growth",
    moduleIds: [
      "erp-crm",
      "erp-projects",
      "erp-support",
      "erp-knowledge",
    ] as const satisfies readonly ModuleId[],
  },
  {
    id: "insights",
    moduleIds: ["erp-reporting"] as const satisfies readonly ModuleId[],
  },
] as const;

export const addonGroups = [
  {
    id: "data-reporting",
    addonIds: [
      "custom-report",
      "custom-dashboard",
      "report-export-pack",
      "data-migration",
    ] as const satisfies readonly AddonId[],
  },
  {
    id: "communication",
    addonIds: [
      "email-notifications",
      "whatsapp-integration",
      "third-party-api",
      "payment-gateway",
    ] as const satisfies readonly AddonId[],
  },
  {
    id: "workflow",
    addonIds: [
      "custom-approval",
      "custom-document",
      "staff-training",
    ] as const satisfies readonly AddonId[],
  },
] as const;

export function modulesForProduct(product: ProductId): readonly CatalogItem[] {
  if (product === "erp") return erpModules;
  if (product === "pos") return posModules;
  if (product === "ims") return imsModules;
  return [];
}

export function presetsForProduct(product: ProductId): readonly PresetDef[] {
  return presets.filter((p) => p.product === product);
}

export function requiredCoreForProduct(product: ProductId): ModuleId | null {
  if (product === "erp") return ERP_CORE;
  if (product === "pos") return POS_CORE;
  if (product === "ims") return IMS_CORE;
  return null;
}
