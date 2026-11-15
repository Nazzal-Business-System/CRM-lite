// Shared commercial algorithm. Inputs are validated server-controlled native integer amounts.
import { z } from "zod";
import type { PricingSelection } from "@nbs/shared";
import type { LineItem, PresetDef, PriceQuote } from "./types";
import { productStructure } from "./structure";
import { getDependencyPrompt } from "./dependencies";
export interface PricingAmounts {
    modules: Readonly<Record<string, PriceQuote>>;
    presets: Readonly<Record<string, number>>;
    addons: Readonly<Record<string, PriceQuote>>;
    customModules: Readonly<Record<string, PriceQuote>>;
    customSoftware: Readonly<Record<string, PriceQuote>>;
}
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quoteSchema = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("exact"), amount: money }),
    z.strictObject({ kind: z.literal("starting_from"), amount: money }),
    z.strictObject({ kind: z.literal("per_session"), amount: money }),
    z.strictObject({ kind: z.literal("custom_quotation") }),
]);
function line(id: string, kind: LineItem["kind"], quote: PriceQuote): LineItem {
    // Fail on an unsupported future quote type rather than silently turning it into zero.
    const parsed = quoteSchema.parse(quote);
    return { id, kind, quote: parsed, amount: "amount" in parsed ? parsed.amount : 0,
        isEstimateFloor: parsed.kind === "starting_from" || parsed.kind === "per_session" };
}
type Candidate = {
    id: PresetDef["id"] | null;
    total: number;
    coveredModules: number;
    lines: LineItem[];
};
export function chooseCheapestCandidate(candidates: readonly Candidate[]): Candidate {
    if (!candidates.length)
        throw new Error("Pricing candidates are missing.");
    return [...candidates].sort((a, b) => {
        if (a.total !== b.total)
            return a.total - b.total;
        if (a.id === null)
            return b.id === null ? 0 : 1;
        if (b.id === null)
            return -1;
        if (a.coveredModules !== b.coveredModules)
            return b.coveredModules - a.coveredModules;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[0]!;
}
export function calculateSelection(state: PricingSelection, source: PricingAmounts) {
    // Canonical ordering makes output independent of selection order.
    const modules = [...state.modules].sort();
    const components = modules.map(id => line(id, "module", source.modules[id]!));
    const componentTotal = components.reduce((sum, item) => sum + item.amount, 0);
    const candidates: Candidate[] = [{ id: null, total: componentTotal, coveredModules: 0, lines: components }];
    for (const preset of productStructure.presets) {
        if (preset.product !== state.product || !preset.moduleIds.every(id => modules.includes(id))
            || preset.moduleIds.some(id => getDependencyPrompt(id, modules) !== null))
            continue;
        const lines = [line(preset.id, "preset", { kind: "exact", amount: source.presets[preset.id]! }),
            ...modules.filter(id => !preset.moduleIds.includes(id)).map(id => line(id, "module", source.modules[id]!))];
        candidates.push({ id: preset.id, total: lines.reduce((sum, item) => sum + item.amount, 0), coveredModules: preset.moduleIds.length, lines });
    }
    const best = chooseCheapestCandidate(candidates);
    const extras = [
        ...(state.product === "custom" && state.customSoftwareTier ? [line(state.customSoftwareTier, "custom-software", source.customSoftware[state.customSoftwareTier]!)] : []),
        ...[...state.customModuleTier].sort().map(id => line(id, "custom-module", source.customModules[id]!)),
        ...[...state.addons].sort().map(id => line(id, "addon", source.addons[id]!)),
    ];
    const lines = [...best.lines, ...extras];
    const extraTotal = extras.reduce((sum, item) => sum + item.amount, 0);
    return { presetApplied: best.id, estimatedTotal: best.total + extraTotal, componentOnlyTotal: componentTotal + extraTotal, bundleSavings: componentTotal - best.total,
        hasStartingFromItems: lines.some(item => item.isEstimateFloor), hasCustomQuotationItems: lines.some(item => item.quote.kind === "custom_quotation"), lineItems: lines };
}
