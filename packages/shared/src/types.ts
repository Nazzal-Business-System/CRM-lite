export interface PublicRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: PublicRole;
  permissions: string[];
}

export interface RoleSummary extends PublicRole {
  userCount: number;
  permissionKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: ApiErrorBody;
}
