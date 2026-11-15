import type { QueryClient } from "@tanstack/react-query";
import type { AdminSessionSummary, SessionSummary, SessionRevocationResult } from "@nbs/shared";
import { api } from "./api";
import { jordanDateTimeToUtc } from "./format";

export type SessionAction = { kind: "others" } | { kind: "one"; session: SessionSummary | AdminSessionSummary };

export function sessionDateBoundary(value: string, end = false): string | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const instant = jordanDateTimeToUtc({ year, month, day, hour: end ? 23 : 0, minute: end ? 59 : 0, second: end ? 59 : 0 });
  return end ? new Date(Date.parse(instant) + 999).toISOString() : instant;
}

export function sessionRevocationOptions(client: QueryClient, endSession: () => Promise<void>, admin: boolean) {
  return {
    mutationFn: (target: SessionAction): Promise<SessionRevocationResult> => {
      if (target.kind === "others") return api.post("/auth/sessions/revoke-others");
      const id = encodeURIComponent(target.session.id);
      if (admin) {
        if (!("user" in target.session)) throw new Error("Missing session owner.");
        return api.delete(`/admin/users/${encodeURIComponent(target.session.user.id)}/sessions/${id}`);
      }
      return api.delete(`/auth/sessions/${id}`);
    },
    onSuccess: async (result: SessionRevocationResult) => {
      if (result.currentSessionRevoked) { await endSession(); return; }
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sessions"] }),
        client.invalidateQueries({ queryKey: ["audit-logs"] }),
      ]);
    },
  };
}
