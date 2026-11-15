import { calculatePricing, getPricingCatalog } from "../pricing/engine";
import { getPricingPrices } from "../pricing/presentation";

// Synchronous, local catalog: no business-record/market lookup or database writes.
export const pricingService = { catalog: getPricingCatalog, prices: getPricingPrices, calculate: calculatePricing };
