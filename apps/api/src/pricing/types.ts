/**
 * Pricing V2 — typed commercial catalog & calculation types.
 * Amounts are whole JOD integers. Display copy lives in messages.
 */

export const PRICING_CURRENCY = "JOD" as const;

export type PricingAccent = "cobalt" | "violet" | "cyan" | "emerald";

export type ProductId = "erp" | "pos" | "ims" | "custom";

export type PriceKind =
  | "exact"
  | "starting_from"
  | "custom_quotation"
  | "per_session";

export type PriceQuote =
  | { readonly kind: "exact"; readonly amount: number }
  | { readonly kind: "starting_from"; readonly amount: number }
  | { readonly kind: "custom_quotation" }
  | { readonly kind: "per_session"; readonly amount: number }
  | { readonly kind: "range"; readonly from: number; readonly to?: number };

export type ImplementationHonesty =
  | "complete"
  | "limitations"
  | "partial"
  | "custom_only"
  | "not_sold";

export type ModuleId =
  | "erp-core"
  | "erp-inventory"
  | "erp-procurement"
  | "erp-sales"
  | "erp-operations"
  | "erp-finance"
  | "erp-accounting"
  | "erp-hr"
  | "erp-ess"
  | "erp-crm"
  | "erp-projects"
  | "erp-support"
  | "erp-knowledge"
  | "erp-reporting"
  | "pos-core"
  | "pos-management"
  | "ims-core"
  | "ims-purchasing"
  | "ims-reorder"
  | "ims-import-export";

export type PresetId =
  | "erp-operations"
  | "erp-business"
  | "erp-complete"
  | "pos-core"
  | "pos-management"
  | "ims-core"
  | "ims-purchasing"
  | "ims-operations";

export type AddonId =
  | "custom-report"
  | "custom-dashboard"
  | "report-export-pack"
  | "data-migration"
  | "custom-document"
  | "email-notifications"
  | "whatsapp-integration"
  | "third-party-api"
  | "payment-gateway"
  | "custom-approval"
  | "staff-training";

export type CustomModuleTierId =
  | "focused-module"
  | "business-module"
  | "advanced-module";

export type CustomSoftwareTierId =
  | "focused-workflow"
  | "connected-system"
  | "larger-platform";

export type CatalogItem = {
  readonly id: string;
  readonly product: ProductId;
  readonly quote: PriceQuote;
  readonly required?: boolean;
  readonly requires?: readonly ModuleId[];
  readonly recommends?: readonly ModuleId[];
  readonly honesty?: ImplementationHonesty;
  /** Message key suffix under pricingV2.modules.{id}.* */
  readonly featureKeys: readonly string[];
};

export type PresetDef = {
  readonly id: PresetId;
  readonly product: ProductId;
  readonly moduleIds: readonly ModuleId[];
  /** Bundle price when the preset set is intact (exact JOD). */
  readonly presetPrice: number;
  /** Sum of standalone component prices (for strike / savings display). */
  readonly componentTotal: number;
  readonly recommended?: boolean;
};

export type AddonDef = {
  readonly id: AddonId;
  readonly quote: PriceQuote;
  readonly externalCostNote?: boolean;
};

export type SelectionState = {
  readonly product: ProductId | null;
  readonly presetId: PresetId | null;
  /** Selected sellable modules (always includes required core when applicable). */
  readonly modules: readonly ModuleId[];
  readonly addons: readonly AddonId[];
  readonly customModuleTier: readonly CustomModuleTierId[];
  readonly customSoftwareTier: CustomSoftwareTierId | null;
  /** Free-text custom notes (not priced). */
  readonly customNotes: string;
};

export type LineItem = {
  readonly id: string;
  readonly kind: "module" | "addon" | "custom-module" | "custom-software" | "preset";
  readonly quote: PriceQuote;
  /** Amount contributing to numeric estimate (0 if custom/unknown). */
  readonly amount: number;
  readonly isEstimateFloor: boolean;
};

export type EstimateResult = {
  readonly lineItems: readonly LineItem[];
  /** Sum of known numeric floors (exact + starting_from amounts). */
  readonly estimatedTotal: number;
  readonly hasCustomQuotationItems: boolean;
  readonly hasStartingFromItems: boolean;
  readonly presetApplied: PresetId | null;
  readonly currency: typeof PRICING_CURRENCY;
};

export type DependencyPrompt = {
  readonly selecting: ModuleId;
  readonly missing: readonly ModuleId[];
  readonly messageKey: string;
  /** Optional alternate dependency set (e.g. Operations + Sales path). */
  readonly alternateMissing?: readonly ModuleId[];
};

/** Serializable payload for contact handoff (client → server). */
export type ConfigurationPayload = {
  readonly version: 1;
  readonly product: ProductId;
  readonly presetId: PresetId | null;
  readonly modules: readonly ModuleId[];
  readonly addons: readonly AddonId[];
  readonly customModuleTier: readonly CustomModuleTierId[];
  readonly customSoftwareTier: CustomSoftwareTierId | null;
  readonly customNotes: string;
  /** Client-reported estimate — server must recompute. */
  readonly claimedEstimate: number;
};
