// Server-only internal commercial registry. Draft availability never means public approval.
import { z } from "zod";
import { PRICE_BOOK_CURRENCIES, PRICE_BOOK_IDS, PRODUCT_STRUCTURE_VERSION, PRICING_CATALOG_VERSION, pricingSelectionSchema, type PriceBookId } from "@nbs/shared";
import { addons, allModules, presets, customModuleTiers, customSoftwareTiers } from "./catalog";
import { productStructure, freezePricingDefinition as freeze } from "./structure";
import { calculateSelection, type PricingAmounts } from "./calculation-core";
import { usDraftV1, ukDraftV1, type DraftSchedule } from "./schedules/draft-v1";
import { addonGroups, erpModuleGroups } from "./catalog";
import { AppError } from "../lib/errors";
const minor = z.number().int().nonnegative().max(Math.floor(Number.MAX_SAFE_INTEGER / 40));
const quote = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("exact"), amount: minor }), z.strictObject({ kind: z.literal("starting_from"), amount: minor }), z.strictObject({ kind: z.literal("per_session"), amount: minor }), z.strictObject({ kind: z.literal("custom_quotation") })]);
const quoteMap = z.record(z.string(), quote);
export const publishedPriceBookSchema = z.strictObject({ id: z.enum(PRICE_BOOK_IDS), currency: z.enum(["JOD", "USD", "GBP"]), version: z.string().min(1).max(80), structureVersion: z.literal(PRODUCT_STRUCTURE_VERSION), publiclyApproved:z.literal(false).default(false), internalOnly: z.literal(true).default(true), reviewStatus: z.enum(["internal_catalog", "draft_v1"]).default("internal_catalog"), approvalReference: z.string().trim().min(1).max(400),
    amounts: z.strictObject({ modules: quoteMap, presets: z.record(z.string(), minor), addons: quoteMap, customModules: quoteMap, customSoftware: quoteMap }),
}).superRefine((book, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: "custom", message });
    if (book.currency !== PRICE_BOOK_CURRENCIES[book.id])
        problem("Book/currency mismatch.");
    const expected = { modules: productStructure.modules.map(m => m.id), presets: productStructure.presets.map(p => p.id), addons: productStructure.addons.map(a => a.id), customModules: productStructure.customModuleIds, customSoftware: productStructure.customSoftwareIds };
    for (const kind of Object.keys(expected) as Array<keyof typeof expected>) {
        const keys = Object.keys(book.amounts[kind]);
        if (keys.length !== expected[kind].length || expected[kind].some(id => !Object.hasOwn(book.amounts[kind], id)))
            problem("Incomplete/unknown price identifiers: " + kind);
    }
    // Quote kinds are structural commercial rules shared by every book.
    const kinds = { modules: Object.fromEntries(allModules.map(m => [m.id, m.quote.kind])), addons: Object.fromEntries(addons.map(a => [a.id, a.quote.kind])), customModules: Object.fromEntries(Object.entries(customModuleTiers).map(([id, t]) => [id, t.quote.kind])), customSoftware: Object.fromEntries(Object.entries(customSoftwareTiers).map(([id, t]) => [id, t.quote.kind])) };
    for (const kind of Object.keys(kinds) as Array<keyof typeof kinds>)
        for (const [id, value] of Object.entries(book.amounts[kind]))
            if (kinds[kind][id] !== value.kind)
                problem("Quote kind mismatch: " + id);
    for (const preset of productStructure.presets) {
        const total = preset.moduleIds.reduce((sum, id) => sum + (book.amounts.modules[id] && "amount" in book.amounts.modules[id] ? book.amounts.modules[id].amount : 0), 0);
        if ((book.amounts.presets[preset.id] ?? Infinity) > total)
            problem("Preset cannot exceed its component prices: " + preset.id);
    }
});
export type PublishedPriceBook = z.infer<typeof publishedPriceBookSchema>;
const jodQuote = (value: {
    kind: string;
    amount?: number;
}) => value.amount === undefined ? value : { ...value, amount: value.amount * 1000 };
const jordan = freeze(publishedPriceBookSchema.parse({ id: "JO", currency: "JOD", version: PRICING_CATALOG_VERSION, structureVersion: PRODUCT_STRUCTURE_VERSION, approvalReference: "Preserved approved JOD catalog; source-provenance.json",
    amounts: { modules: Object.fromEntries(allModules.map(m => [m.id, jodQuote(m.quote)])), presets: Object.fromEntries(presets.map(p => [p.id, p.presetPrice * 1000])), addons: Object.fromEntries(addons.map(a => [a.id, jodQuote(a.quote)])), customModules: Object.fromEntries(Object.entries(customModuleTiers).map(([id, t]) => [id, jodQuote(t.quote)])), customSoftware: Object.fromEntries(Object.entries(customSoftwareTiers).map(([id, t]) => [id, jodQuote(t.quote)])) } }));
function draftBook(id:"US"|"UK",schedule:DraftSchedule){
 const quotes=(values:Record<string,number>,definitions:ReadonlyArray<{id:string;quote:{kind:string}}>)=>Object.fromEntries(definitions.map(item=>[item.id,{kind:item.quote.kind,amount:values[item.id]!*100}]));
 return freeze(publishedPriceBookSchema.parse({id,currency:PRICE_BOOK_CURRENCIES[id],version:id==="US"?"nbs-us-usd-draft-v1-2026-11-15.1":"nbs-uk-gbp-draft-v1-2026-11-15.1",structureVersion:PRODUCT_STRUCTURE_VERSION,internalOnly:true,reviewStatus:"draft_v1",approvalReference:"Exact user-supplied Draft v1 schedule, 2026-11-15; internal proposal only, not public approval",
 amounts:{modules:quotes(schedule.modules,allModules),presets:Object.fromEntries(Object.entries(schedule.presets).map(([key,amount])=>[key,amount*100])),addons:quotes(schedule.addons,addons),customModules:quotes(schedule.customModules,Object.entries(customModuleTiers).map(([id,item])=>({id,...item}))),customSoftware:quotes(schedule.customSoftware,Object.entries(customSoftwareTiers).map(([id,item])=>({id,...item})))}}));
}
const us=draftBook("US",usDraftV1),uk=draftBook("UK",ukDraftV1);
export const priceBookRegistry=freeze({JO:{currency:"JOD",currentVersion:jordan.version,versions:{[jordan.version]:jordan}},US:{currency:"USD",currentVersion:us.version,versions:{[us.version]:us}},UK:{currency:"GBP",currentVersion:uk.version,versions:{[uk.version]:uk}}} as const);
export function publishedPriceBook(id: PriceBookId, version?: string): PublishedPriceBook {
    const entry = priceBookRegistry[id];
    const key = version ?? entry.currentVersion;
    const book = key && key === entry.currentVersion ? (entry.versions as Readonly<Record<string, PublishedPriceBook>>)[key] : undefined;
    if (!book)
        throw new AppError(503, "PRICE_BOOK_UNPUBLISHED", "This commercial price book/version has not been published. No fallback prices are available.");
    return book;
}
export function priceBookMetadata(id: PriceBookId) { const book = priceBookRegistry[id]; return { id, currency: book.currency, structureVersion: PRODUCT_STRUCTURE_VERSION, version: book.currentVersion, published: book.currentVersion !== null, publiclyApproved: false as const, internalOnly: true as const, reviewStatus: id === "JO" ? "internal_catalog" as const : "draft_v1" as const }; }
function majorQuote(value: {
    kind: string;
    amount?: number;
}, factor: number) { return value.amount === undefined ? { ...value } : { ...value, amount: value.amount / factor }; }
export function calculateNativePriceBook(raw: unknown, book: PublishedPriceBook) {
    const state = pricingSelectionSchema.parse(raw);
    const valid = publishedPriceBookSchema.parse(book);
    const computed = calculateSelection(state, valid.amounts as PricingAmounts);
    const factor = book.currency === "JOD" ? 1000 : 100;
    return { configurationVersion: state.configurationVersion, catalogVersion: book.version, currency: book.currency, pricingBasis: "PRICE_BOOK" as const, priceBook: { id: book.id, version: book.version, structureVersion: book.structureVersion, internalOnly: book.internalOnly, publiclyApproved:book.publiclyApproved, reviewStatus: book.reviewStatus }, calculationVersion: "cheapest-preset-v1" as const,
        ...computed, estimatedTotal: computed.estimatedTotal / factor, componentOnlyTotal: computed.componentOnlyTotal / factor, bundleSavings: computed.bundleSavings / factor, lineItems: computed.lineItems.map(line => ({ ...line, amount: line.amount / factor, quote: majorQuote(line.quote, factor) })) };
}
export function nativePriceBookPrices(book: PublishedPriceBook) {
    const factor = book.currency === "JOD" ? 1000 : 100;
    const group = (kind: "modules" | "addons" | "customModules" | "customSoftware") => Object.entries(book.amounts[kind]).map(([id, value]) => ({ id, quote: majorQuote(value, factor) }));
    return { priceBook: { id: book.id, version: book.version, structureVersion: book.structureVersion, internalOnly: book.internalOnly, publiclyApproved:book.publiclyApproved, reviewStatus: book.reviewStatus }, currency: book.currency,
        moduleGroups: erpModuleGroups.map(group=>({id:group.id,ids:[...group.moduleIds]})),addonGroups:addonGroups.map(group=>({id:group.id,ids:[...group.addonIds]})),
        products: (["erp", "pos", "ims", "custom"] as const).map(product => {
            const base = { configurationVersion: 1, product, modules: productStructure.modules.filter(m => m.product === product && m.required).map(m => m.id), addons: [], customModuleTier: [], customNotes: "", customSoftwareTier: null };
            const configurations = product === "custom" ? productStructure.customSoftwareIds.map(id => ({ ...base, customSoftwareTier: id })) : [base];
            const candidates = configurations.map(configuration => ({ configuration, result: calculateNativePriceBook(configuration, book) })).sort((a, b) => a.result.estimatedTotal - b.result.estimatedTotal || String(a.configuration.customSoftwareTier).localeCompare(String(b.configuration.customSoftwareTier), "en"));
            return { id: product, quote: { kind: "starting_from", amount: candidates[0]!.result.estimatedTotal }, initialConfiguration: candidates[0]!.configuration, noteKey:product==="custom"?"fromFocused":"fromCore",typicalQuote:null };
        }),
        modules: group("modules"), addons: group("addons"), customModuleTiers: group("customModules"), customSoftwareTiers: group("customSoftware"), presets: productStructure.presets.map(p => { const componentTotal = p.moduleIds.reduce((sum, id) => sum + (book.amounts.modules[id] && "amount" in book.amounts.modules[id] ? book.amounts.modules[id].amount : 0), 0); const amount = book.amounts.presets[p.id]!; return { id: p.id, moduleIds: p.moduleIds, quote: { kind: "exact", amount: amount / factor }, componentTotal: componentTotal / factor, savings: (componentTotal - amount) / factor }; }) };
}
