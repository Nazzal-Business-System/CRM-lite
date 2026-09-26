import { hasPermission, PERMISSION_KEYS, type AuthUser } from "@nbs/shared";
import { forbidden } from "../lib/errors";

export function canAssignOwnership(actor: Pick<AuthUser, "permissions">): boolean {
  return hasPermission(actor.permissions, PERMISSION_KEYS.OWNERSHIP_ASSIGN);
}

export function ownerForCreate(
  actor: Pick<AuthUser, "id" | "permissions">,
  requestedOwnerId: string | null | undefined,
): string | null {
  if (canAssignOwnership(actor)) {
    return requestedOwnerId || null;
  }
  if (requestedOwnerId && requestedOwnerId !== actor.id) {
    throw forbidden("You can only assign new records to yourself.");
  }
  return actor.id;
}

export function assertOwnerUpdateAllowed(
  actor: Pick<AuthUser, "permissions">,
  currentOwnerId: string | null,
  requestedOwnerId: string | null | undefined,
): void {
  if (requestedOwnerId === undefined || requestedOwnerId === currentOwnerId) return;
  if (!canAssignOwnership(actor)) {
    throw forbidden("Only authorized administrators can reassign ownership. Request ownership instead.");
  }
}
