import { z } from "zod";
import { PRICE_BOOK_CURRENCIES, PRODUCT_STRUCTURE_VERSION, priceBookIdSchema, priceBookReferenceSchema, pricingSelectionSchema, pricingRequestSchema, pricingCatalogResponseSchema, type AuthUser, type PriceBookId, type PricingRequest } from "@nbs/shared";
import { api,ApiError } from "./api";
import { canViewPricing, pricingActorKey, pricingPricesSchema, quoteSchema, estimateSnapshotSchema, pricingConfigurationKey, type PricingCatalog, type SavedEstimate } from "./pricing";
const metadata=z.object({id:priceBookIdSchema,currency:z.enum(["JOD","USD","GBP"]),structureVersion:z.literal(PRODUCT_STRUCTURE_VERSION),version:z.string().nullable(),published:z.boolean(),internalOnly:z.literal(true),publiclyApproved:z.literal(false),reviewStatus:z.enum(["internal_catalog","draft_v1"])});
export const authorizedBooksSchema=z.object({bookIds:z.array(priceBookIdSchema),defaultBookId:priceBookIdSchema.nullable(),books:z.array(metadata)}).superRefine((value,ctx)=>{if(new Set(value.bookIds).size!==value.bookIds.length||value.books.length!==value.bookIds.length||value.books.some(b=>!value.bookIds.includes(b.id)||b.currency!==PRICE_BOOK_CURRENCIES[b.id])||value.defaultBookId&&!value.bookIds.includes(value.defaultBookId))ctx.addIssue({code:"custom",message:"Invalid authorized price-book access."});});
export type AuthorizedBooks=z.infer<typeof authorizedBooksSchema>;
export const nativeBookReferenceSchema=priceBookReferenceSchema.extend({internalOnly:z.literal(true),publiclyApproved:z.literal(false),reviewStatus:z.enum(["internal_catalog","draft_v1"])});
export type NativeBookReference=z.infer<typeof nativeBookReferenceSchema>;
export type NativeBookContext={access:AuthorizedBooks;reference:NativeBookReference};
const nativePricesSchema=pricingPricesSchema.omit({catalogVersion:true,configurationVersion:true,exchange:true,products:true}).extend({priceBook:nativeBookReferenceSchema,catalog:pricingCatalogResponseSchema.shape.data,products:z.array(z.object({id:z.string(),quote:quoteSchema,noteKey:z.string(),typicalQuote:z.null(),initialConfiguration:pricingSelectionSchema}))});
function allowed(user:AuthUser|null){if(!canViewPricing(user))throw new ApiError(403,"FORBIDDEN","Pricing permission required.");}
export const authorizedBooksOptions=(user:AuthUser|null)=>({queryKey:["pricing","authorized-books",...pricingActorKey(user)],enabled:canViewPricing(user),retry:false,staleTime:0,refetchOnWindowFocus:true,queryFn:async()=>{allowed(user);return authorizedBooksSchema.parse(await api.get("/pricing/price-books"));}});
export function nativeBookBundleOptions(user:AuthUser|null,id:PriceBookId|null,access:AuthorizedBooks){const meta=access.books.find(b=>b.id===id);return{queryKey:["pricing","native-book",...pricingActorKey(user),access.bookIds.join(","),id,meta?.version],enabled:canViewPricing(user)&&!!id&&access.bookIds.includes(id),retry:false,staleTime:0,refetchOnWindowFocus:true,queryFn:async()=>{
 allowed(user);if(!id||!meta||!access.bookIds.includes(id))throw new ApiError(403,"FORBIDDEN","This price book is not authorized.");
 const raw=nativePricesSchema.parse(await api.get('/pricing/price-books/'+id+'/prices'+(meta.version?'?version='+encodeURIComponent(meta.version):'')));
 if(raw.priceBook.id!==id||raw.priceBook.version!==meta.version||raw.currency!==PRICE_BOOK_CURRENCIES[id])throw new ApiError(503,"CATALOG_MISMATCH","Native book mismatch.");
 // Existing UI dependency helpers use a non-priced compatibility marker; it is never sent as a commercial version.
 const prices=pricingPricesSchema.parse({...raw,catalogVersion:raw.catalog.catalogVersion,configurationVersion:raw.catalog.configurationVersion,products:raw.products.map(p=>({...p,initialConfiguration:{...p.initialConfiguration,catalogVersion:raw.catalog.catalogVersion}}))});
 return{catalog:raw.catalog,prices,reference:raw.priceBook};
 }};}
export function nativeSelectionFromDraft(raw:unknown){const selection=pricingRequestSchema.parse(raw);return pricingSelectionSchema.parse(Object.fromEntries(Object.entries(selection).filter(([key])=>key!=="catalogVersion")));}
export const requestBookReference=(book:NativeBookReference)=>priceBookReferenceSchema.parse({id:book.id,version:book.version,structureVersion:book.structureVersion});
export function nativeCalculationOptions(user:AuthUser|null,book:NativeBookReference){return{mutationFn:async(raw:unknown)=>{allowed(user);const estimate=estimateSnapshotSchema.parse(await api.post("/pricing/price-books/calculate",{priceBook:requestBookReference(book),configuration:nativeSelectionFromDraft(raw)}));if(estimate.pricingBasis!=="PRICE_BOOK"||estimate.priceBook?.id!==book.id||estimate.priceBook?.version!==book.version||estimate.currency!==PRICE_BOOK_CURRENCIES[book.id]||estimate.exchange)throw new ApiError(503,"CATALOG_MISMATCH","Native calculation mismatch.");return{configurationKey:pricingConfigurationKey(raw)!,estimate};}};}
export function nativeConfigurationForCopy(record:SavedEstimate,catalog:PricingCatalog):PricingRequest|null {
 if(record.configurationVersion!==catalog.configurationVersion||!record.selection||typeof record.selection!=="object"||Array.isArray(record.selection))return null;
 const result=estimateSnapshotSchema.safeParse(record.result);
 if(result.success&&result.data.pricingBasis==="PRICE_BOOK"){if(result.data.priceBook?.structureVersion!==PRODUCT_STRUCTURE_VERSION)return null;}else if(record.catalogVersion!==catalog.catalogVersion)return null;
 const parsed=pricingRequestSchema.safeParse({...record.selection,catalogVersion:catalog.catalogVersion});return parsed.success?parsed.data:null;
}
