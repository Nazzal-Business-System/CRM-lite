// Server-only shared structure; legacy commercial source stays untouched for provenance/parity.
import { PRODUCT_STRUCTURE_VERSION } from "@nbs/shared";
import { allModules, presets, addons, customModuleTiers, customSoftwareTiers } from "./catalog";
export function freezePricingDefinition<T>(value: T): T { if (value && typeof value === "object") {
    for (const child of Object.values(value))
        freezePricingDefinition(child);
    Object.freeze(value);
} return value; }
export const productStructure = freezePricingDefinition({ version: PRODUCT_STRUCTURE_VERSION,
    modules: allModules.map(({ quote: _quote, ...definition }) => structuredClone(definition)),
    presets: presets.map(({ componentTotal: _componentTotal, presetPrice: _presetPrice, ...definition }) => definition),
    addons: addons.map(({ quote: _quote, ...definition }) => definition),
    customModuleIds: Object.keys(customModuleTiers), customSoftwareIds: Object.keys(customSoftwareTiers),
});
