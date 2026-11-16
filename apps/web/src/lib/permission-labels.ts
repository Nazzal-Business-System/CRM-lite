import type { PermissionCategory } from "@nbs/shared";

const categories: Record<string, string> = {
  Demos: "demos", Pricing: "pricing", Dashboard: "dashboard", "Sales Performance": "salesPerformance",
  Companies: "companies", Contacts: "contacts", Opportunities: "opportunities", Activities: "activities",
  Tasks: "tasks", Imports: "imports", Recruitment: "recruitment", Users: "users", Roles: "roles",
  Governance: "governance", Sessions: "sessions",
} satisfies Record<PermissionCategory | "Sessions", string>;
const actions: Record<string, string> = {
  View: "view", Create: "create", Update: "update", Delete: "delete", Deactivate: "deactivate",
  "View all": "viewAll", "Manage price-book access": "managePriceBooks", "Manage market memberships": "manageMarkets",
  "View sessions": "viewSessions", "Revoke sessions": "revokeSessions", "View audit logs": "viewAuditLogs",
  "Request ownership": "requestOwnership", "View requests": "viewRequests", "Manage requests": "manageRequests", "Assign ownership": "assignOwnership",
};
type Translate = (key: string) => string;
function label(value: string, mapping: Record<string, string>, section: string, t: Translate) {
  const key = mapping[value] && `roles.${section}.${mapping[value]}`;
  const translated = key ? t(key) : "";
  if (translated && translated !== key && !translated.startsWith("roles.")) return translated;
  const readable = value.replace(/^roles\.[\w]+\./, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").trim();
  return readable ? readable[0].toUpperCase() + readable.slice(1) : "—";
}
export const permissionCategoryLabel = (value: string, t: Translate) => label(value, categories, "permissionCategories", t);
export const permissionActionLabel = (value: string, t: Translate) => label(value, actions, "permissionActions", t);
