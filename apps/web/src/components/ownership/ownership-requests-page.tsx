"use client";

import { OWNERSHIP_ENTITY_TYPES, OWNERSHIP_REQUEST_STATUSES, type OwnershipRequestRecord, type PaginatedResult } from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataToolbar, EmptyState, PageFrame, PageHeader, PaginationBar, QueryPanel, Surface, ToolbarFilter } from "@/components/crm/primitives";
import { EnumSelect } from "@/components/crm/selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/provider";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toQuery } from "@/lib/query";

export function OwnershipRequestsPage() {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("PENDING");
  const [entityType, setEntityType] = useState<string>("");
  const [review, setReview] = useState<{ request: OwnershipRequestRecord; decision: "APPROVE" | "REJECT" } | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: ["ownership-requests", status, entityType, page], queryFn: () => api.get<PaginatedResult<OwnershipRequestRecord>>(`/ownership-requests${toQuery({ status, entityType, page, pageSize: 20 })}`) });
  const mutation = useMutation({
    mutationFn: () => api.post(`/ownership-requests/${review!.request.id}/review`, { decision: review!.decision, rejectionReason: review!.decision === "REJECT" ? reason || null : null }),
    onSuccess: async () => {
      toast.success(t(review?.decision === "APPROVE" ? "ownership.approvedToast" : "ownership.rejectedToast"));
      setReview(null); setReason("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ownership-requests"] }),
        client.invalidateQueries({ queryKey: ["companies"] }),
        client.invalidateQueries({ queryKey: ["opportunities"] }),
        client.invalidateQueries({ queryKey: ["tasks"] }),
        client.invalidateQueries({ queryKey: ["audit-logs"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("ownership.reviewFailed")),
  });

  return <PageFrame width="wide">
    <PageHeader title={t("ownership.title")} description={t("ownership.description")} count={query.data?.total} />
    <DataToolbar>
      <ToolbarFilter label={t("ownership.status")}><EnumSelect allowEmpty emptyLabel={t("common.any")} value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={OWNERSHIP_REQUEST_STATUSES.map((value) => ({ value, label: t(`ownership.${value.toLowerCase()}`) }))} /></ToolbarFilter>
      <ToolbarFilter label={t("ownership.module")}><EnumSelect allowEmpty emptyLabel={t("common.any")} value={entityType} onChange={(value) => { setEntityType(value); setPage(1); }} options={OWNERSHIP_ENTITY_TYPES.map((value) => ({ value, label: t(`ownership.entity.${value}`) }))} /></ToolbarFilter>
    </DataToolbar>
    <QueryPanel query={query} skeleton={<Surface className="h-64 animate-pulse"><span /></Surface>} isEmpty={(data) => data.items.length === 0} empty={<EmptyState icon={ClipboardCheck} title={t("ownership.empty")} description={t("ownership.emptyDescription")} />}>
      {(data) => <><Surface className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b border-border bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-start">{t("ownership.requester")}</th><th className="px-4 py-3 text-start">{t("ownership.record")}</th><th className="px-4 py-3 text-start">{t("ownership.currentOwner")}</th><th className="px-4 py-3 text-start">{t("ownership.requestedOwner")}</th><th className="px-4 py-3 text-start">{t("ownership.requestedAt")}</th><th className="px-4 py-3 text-start">{t("ownership.status")}</th><th className="px-4 py-3 text-end">{t("common.actions")}</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id} className="border-b border-border/70 last:border-0"><td className="px-4 py-3 font-medium">{item.requester.name}</td><td className="px-4 py-3"><span className="font-medium">{item.entityLabel}</span><span className="block text-xs text-muted-foreground">{t(`ownership.entity.${item.entityType}`)}</span></td><td className="px-4 py-3">{item.currentOwner?.name ?? t("common.unassigned")}</td><td className="px-4 py-3">{item.requestedOwner.name}</td><td className="px-4 py-3 whitespace-nowrap">{formatDateTime(item.createdAt, locale)}</td><td className="px-4 py-3"><Badge variant={item.status === "APPROVED" ? "success" : item.status === "REJECTED" ? "outline" : "secondary"}>{t(`ownership.${item.status.toLowerCase()}`)}</Badge></td><td className="px-4 py-3"><div className="flex justify-end gap-2">{item.status === "PENDING" ? <><Button size="sm" onClick={() => setReview({ request: item, decision: "APPROVE" })}>{t("ownership.approve")}</Button><Button size="sm" variant="outline" onClick={() => setReview({ request: item, decision: "REJECT" })}>{t("ownership.reject")}</Button></> : null}</div></td></tr>)}</tbody></table></Surface><PaginationBar page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} /></>}
    </QueryPanel>
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}><DialogContent><DialogHeader><DialogTitle>{review?.decision === "APPROVE" ? t("ownership.approveTitle") : t("ownership.rejectTitle")}</DialogTitle><DialogDescription>{review ? t("ownership.reviewDescription", { requester: review.request.requester.name, record: review.request.entityLabel }) : ""}</DialogDescription></DialogHeader>{review?.decision === "REJECT" ? <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ownership.reasonPlaceholder")} /> : null}<DialogFooter><Button variant="outline" onClick={() => setReview(null)}>{t("common.cancel")}</Button><Button variant={review?.decision === "REJECT" ? "destructive" : "default"} loading={mutation.isPending} onClick={() => mutation.mutate()}>{review?.decision === "APPROVE" ? t("ownership.approve") : t("ownership.reject")}</Button></DialogFooter></DialogContent></Dialog>
  </PageFrame>;
}
