export const PERMISSION_KEYS = {
  DASHBOARD_VIEW: "dashboard.view",

  COMPANIES_VIEW: "companies.view",
  COMPANIES_CREATE: "companies.create",
  COMPANIES_UPDATE: "companies.update",
  COMPANIES_DELETE: "companies.delete",

  CONTACTS_VIEW: "contacts.view",
  CONTACTS_CREATE: "contacts.create",
  CONTACTS_UPDATE: "contacts.update",
  CONTACTS_DELETE: "contacts.delete",

  OPPORTUNITIES_VIEW: "opportunities.view",
  OPPORTUNITIES_CREATE: "opportunities.create",
  OPPORTUNITIES_UPDATE: "opportunities.update",
  OPPORTUNITIES_DELETE: "opportunities.delete",

  ACTIVITIES_VIEW: "activities.view",
  ACTIVITIES_CREATE: "activities.create",
  ACTIVITIES_UPDATE: "activities.update",
  ACTIVITIES_DELETE: "activities.delete",

  TASKS_VIEW: "tasks.view",
  TASKS_CREATE: "tasks.create",
  TASKS_UPDATE: "tasks.update",
  TASKS_DELETE: "tasks.delete",

  IMPORTS_VIEW: "imports.view",
  IMPORTS_CREATE: "imports.create",

  RECRUITMENT_VIEW: "recruitment.view",
  RECRUITMENT_CREATE: "recruitment.create",
  RECRUITMENT_UPDATE: "recruitment.update",
  RECRUITMENT_DELETE: "recruitment.delete",

  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DEACTIVATE: "users.deactivate",

  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
} as const;

export type PermissionKey =
  (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

export const PERMISSION_CATEGORIES = [
  "Dashboard",
  "Companies",
  "Contacts",
  "Opportunities",
  "Activities",
  "Tasks",
  "Imports",
  "Recruitment",
  "Users",
  "Roles",
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export interface PermissionDefinition {
  key: PermissionKey;
  description: string;
  category: PermissionCategory;
  actionLabel: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: PERMISSION_KEYS.DASHBOARD_VIEW,
    description: "View the CRM dashboard",
    category: "Dashboard",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.COMPANIES_VIEW,
    description: "View companies",
    category: "Companies",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.COMPANIES_CREATE,
    description: "Create companies",
    category: "Companies",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.COMPANIES_UPDATE,
    description: "Update companies",
    category: "Companies",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.COMPANIES_DELETE,
    description: "Delete companies",
    category: "Companies",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.CONTACTS_VIEW,
    description: "View contacts",
    category: "Contacts",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.CONTACTS_CREATE,
    description: "Create contacts",
    category: "Contacts",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.CONTACTS_UPDATE,
    description: "Update contacts",
    category: "Contacts",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.CONTACTS_DELETE,
    description: "Delete contacts",
    category: "Contacts",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.OPPORTUNITIES_VIEW,
    description: "View opportunities",
    category: "Opportunities",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.OPPORTUNITIES_CREATE,
    description: "Create opportunities",
    category: "Opportunities",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.OPPORTUNITIES_UPDATE,
    description: "Update opportunities",
    category: "Opportunities",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.OPPORTUNITIES_DELETE,
    description: "Delete opportunities",
    category: "Opportunities",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.ACTIVITIES_VIEW,
    description: "View activities",
    category: "Activities",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.ACTIVITIES_CREATE,
    description: "Create activities",
    category: "Activities",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.ACTIVITIES_UPDATE,
    description: "Update activities",
    category: "Activities",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.ACTIVITIES_DELETE,
    description: "Delete activities",
    category: "Activities",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.TASKS_VIEW,
    description: "View tasks",
    category: "Tasks",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.TASKS_CREATE,
    description: "Create tasks",
    category: "Tasks",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.TASKS_UPDATE,
    description: "Update tasks",
    category: "Tasks",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.TASKS_DELETE,
    description: "Delete tasks",
    category: "Tasks",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.IMPORTS_VIEW,
    description: "View imports",
    category: "Imports",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.IMPORTS_CREATE,
    description: "Create imports",
    category: "Imports",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.RECRUITMENT_VIEW,
    description: "View sales recruitment candidates",
    category: "Recruitment",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.RECRUITMENT_CREATE,
    description: "Create sales recruitment candidates",
    category: "Recruitment",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.RECRUITMENT_UPDATE,
    description: "Update sales recruitment candidates",
    category: "Recruitment",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.RECRUITMENT_DELETE,
    description: "Delete sales recruitment candidates",
    category: "Recruitment",
    actionLabel: "Delete",
  },
  {
    key: PERMISSION_KEYS.USERS_VIEW,
    description: "View users",
    category: "Users",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.USERS_CREATE,
    description: "Create users",
    category: "Users",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.USERS_UPDATE,
    description: "Update users and assign roles",
    category: "Users",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.USERS_DEACTIVATE,
    description: "Activate or deactivate users",
    category: "Users",
    actionLabel: "Deactivate",
  },
  {
    key: PERMISSION_KEYS.ROLES_VIEW,
    description: "View roles and permissions",
    category: "Roles",
    actionLabel: "View",
  },
  {
    key: PERMISSION_KEYS.ROLES_CREATE,
    description: "Create custom roles",
    category: "Roles",
    actionLabel: "Create",
  },
  {
    key: PERMISSION_KEYS.ROLES_UPDATE,
    description: "Update roles and their permissions",
    category: "Roles",
    actionLabel: "Update",
  },
  {
    key: PERMISSION_KEYS.ROLES_DELETE,
    description: "Delete custom roles",
    category: "Roles",
    actionLabel: "Delete",
  },
];

export const SYSTEM_ROLE_NAMES = {
  ADMIN: "Admin",
  SALES: "Sales",
} as const;

export const ADMIN_CAPABILITY_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSION_KEYS.USERS_VIEW,
  PERMISSION_KEYS.USERS_CREATE,
  PERMISSION_KEYS.USERS_UPDATE,
  PERMISSION_KEYS.USERS_DEACTIVATE,
  PERMISSION_KEYS.ROLES_VIEW,
  PERMISSION_KEYS.ROLES_CREATE,
  PERMISSION_KEYS.ROLES_UPDATE,
  PERMISSION_KEYS.RECRUITMENT_VIEW,
  PERMISSION_KEYS.RECRUITMENT_CREATE,
  PERMISSION_KEYS.RECRUITMENT_UPDATE,
  PERMISSION_KEYS.RECRUITMENT_DELETE,
];

export const SALES_DEFAULT_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSION_KEYS.DASHBOARD_VIEW,
  PERMISSION_KEYS.COMPANIES_VIEW,
  PERMISSION_KEYS.COMPANIES_CREATE,
  PERMISSION_KEYS.COMPANIES_UPDATE,
  PERMISSION_KEYS.CONTACTS_VIEW,
  PERMISSION_KEYS.CONTACTS_CREATE,
  PERMISSION_KEYS.CONTACTS_UPDATE,
  PERMISSION_KEYS.OPPORTUNITIES_VIEW,
  PERMISSION_KEYS.OPPORTUNITIES_CREATE,
  PERMISSION_KEYS.OPPORTUNITIES_UPDATE,
  PERMISSION_KEYS.ACTIVITIES_VIEW,
  PERMISSION_KEYS.ACTIVITIES_CREATE,
  PERMISSION_KEYS.ACTIVITIES_UPDATE,
  PERMISSION_KEYS.TASKS_VIEW,
  PERMISSION_KEYS.TASKS_CREATE,
  PERMISSION_KEYS.TASKS_UPDATE,
  PERMISSION_KEYS.IMPORTS_VIEW,
  PERMISSION_KEYS.IMPORTS_CREATE,
];

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_DEFINITIONS.some((definition) => definition.key === value);
}

export function hasPermission(
  granted: readonly string[],
  key: PermissionKey,
): boolean {
  return granted.includes(key);
}

export function hasEveryPermission(
  granted: readonly string[],
  keys: readonly PermissionKey[],
): boolean {
  return keys.every((key) => granted.includes(key));
}

export function hasAdminCapability(granted: readonly string[]): boolean {
  return hasEveryPermission(granted, ADMIN_CAPABILITY_PERMISSIONS);
}

export function groupPermissionsByCategory(
  definitions: readonly PermissionDefinition[] = PERMISSION_DEFINITIONS,
): Array<{
  category: PermissionCategory;
  permissions: PermissionDefinition[];
}> {
  return PERMISSION_CATEGORIES.map((category) => ({
    category,
    permissions: definitions.filter(
      (definition) => definition.category === category,
    ),
  })).filter((group) => group.permissions.length > 0);
}
