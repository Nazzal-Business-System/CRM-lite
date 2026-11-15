// Exact user-supplied Draft v1 schedules, 2026-11-15. Internal proposals, not public quotations.
import type { ModuleId, PresetDef, AddonId, CustomModuleTierId, CustomSoftwareTierId } from "../types";
export interface DraftSchedule {modules:Record<ModuleId,number>;presets:Record<PresetDef["id"],number>;addons:Record<AddonId,number>;customModules:Record<CustomModuleTierId,number>;customSoftware:Record<CustomSoftwareTierId,number>}
export const usDraftV1:DraftSchedule={
 modules:{"erp-core":1500,"erp-inventory":950,"erp-procurement":650,"erp-sales":700,"erp-operations":600,"erp-finance":900,"erp-accounting":900,"erp-hr":1000,"erp-ess":350,"erp-crm":650,"erp-projects":550,"erp-support":550,"erp-knowledge":350,"erp-reporting":450,"pos-core":1100,"pos-management":400,"ims-core":1200,"ims-purchasing":500,"ims-reorder":350,"ims-import-export":200},
 presets:{"erp-operations":4100,"erp-business":6100,"erp-complete":7200,"pos-core":1100,"pos-management":1500,"ims-core":1200,"ims-purchasing":1700,"ims-operations":1950},
 addons:{"custom-report":300,"custom-dashboard":450,"report-export-pack":275,"data-migration":350,"custom-document":250,"email-notifications":300,"whatsapp-integration":550,"third-party-api":650,"payment-gateway":750,"custom-approval":450,"staff-training":200},
 customModules:{"focused-module":700,"business-module":1200,"advanced-module":2000},customSoftware:{"focused-workflow":2500,"connected-system":5500,"larger-platform":10500}
};
export const ukDraftV1:DraftSchedule={
 modules:{"erp-core":1100,"erp-inventory":700,"erp-procurement":500,"erp-sales":550,"erp-operations":450,"erp-finance":650,"erp-accounting":650,"erp-hr":750,"erp-ess":250,"erp-crm":475,"erp-projects":400,"erp-support":400,"erp-knowledge":250,"erp-reporting":350,"pos-core":850,"pos-management":300,"ims-core":900,"ims-purchasing":400,"ims-reorder":250,"ims-import-export":150},
 presets:{"erp-operations":3050,"erp-business":4550,"erp-complete":5350,"pos-core":850,"pos-management":1150,"ims-core":900,"ims-purchasing":1300,"ims-operations":1450},
 addons:{"custom-report":225,"custom-dashboard":350,"report-export-pack":200,"data-migration":250,"custom-document":175,"email-notifications":225,"whatsapp-integration":425,"third-party-api":475,"payment-gateway":550,"custom-approval":325,"staff-training":150},
 customModules:{"focused-module":500,"business-module":900,"advanced-module":1500},customSoftware:{"focused-workflow":1900,"connected-system":4200,"larger-platform":8000}
};
