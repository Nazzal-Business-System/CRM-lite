import { demoResponseSchema } from "@nbs/shared";
// Discovery is permission-protected by CRM. These independent hosts retain their own access policy.
export const liveDemos = demoResponseSchema.parse({ demos: [
  { id: "erp", url: "https://erp-demo.nazzalbs.com" },
  { id: "pos", url: "https://pos-demo.nazzalbs.com" },
  { id: "ims", url: "https://ims-demo.nazzalbs.com" },
], resources: [{ id: "website", url: "https://www.nazzalbs.com" }] });
