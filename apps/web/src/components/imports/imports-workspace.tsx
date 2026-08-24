"use client";

import {
  PERMISSION_KEYS,
  type ImportEntity,
  type ImportPreview,
  type ImportResult,
} from "@nbs/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  DestinationReady,
} from "@/components/layout/destination-ready";
import { PageFrame, PageHeader, Surface } from "@/components/crm/primitives";
import { Can } from "@/components/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n/provider";
import { api, apiDownload, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ImportsWorkspace() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>("COMPANIES");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function errorText(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return t("imports.parseFailed");
  }

  const promptQuery = useQuery({
    queryKey: ["import-prompt", entity],
    queryFn: () => api.get<{ prompt: string }>(`/imports/ai-prompt?entity=${entity}`),
  });

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set("entity", entity);
      body.set("file", file);
      return api.postForm<{ preview: ImportPreview }>("/imports/parse", body);
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setParseError(null);
    },
    onError: (error) => {
      setPreview(null);
      setParseError(errorText(error));
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!preview) {
        throw new Error("No preview");
      }
      return api.post<{ result: ImportResult }>("/imports/commit", {
        entity: preview.entity,
        rows: preview.rows.map((row) => ({
          rowNumber: row.rowNumber,
          included: row.included,
          values: row.values,
        })),
      });
    },
    onSuccess: async (data) => {
      toast.success(
        data.result.entity === "CONTACTS"
          ? t("imports.contactsImported", { count: data.result.created })
          : t("imports.companiesImported", { count: data.result.created }),
      );
      setPreview(null);
      setSelectedFile(null);
      setParseError(null);
      setDragOver(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      setParseError(errorText(error));
    },
  });

  function submitFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setSelectedFile(file);
    setParseError(null);
    parseMutation.mutate(file);
  }

  function switchEntity(next: ImportEntity) {
    setEntity(next);
    setPreview(null);
    setSelectedFile(null);
    setParseError(null);
  }

  const parsing = parseMutation.isPending;

  return (
    <PageFrame>
      <DestinationReady ready={!promptQuery.isPending} />
      <PageHeader
        title={t("imports.title")}
        description={t("imports.description")}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant={entity === "COMPANIES" ? "secondary" : "outline"}
          onClick={() => switchEntity("COMPANIES")}
        >
          {t("imports.companies")}
        </Button>
        <Button
          variant={entity === "CONTACTS" ? "secondary" : "outline"}
          onClick={() => switchEntity("CONTACTS")}
        >
          {t("imports.contacts")}
        </Button>
      </div>

      <Can permission={PERMISSION_KEYS.IMPORTS_CREATE}>
        <label
          className={cn(
            "flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/8"
              : "border-border bg-card hover:border-primary/50 hover:bg-muted/40",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            submitFile(event.dataTransfer.files[0]);
          }}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Upload className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">{t("imports.uploadTitle")}</span>
          <span className="max-w-md text-sm text-muted-foreground">
            {t("imports.uploadHint")}
          </span>
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <FileSpreadsheet className="size-4" />
            {t("imports.chooseFile")}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(event) => {
              submitFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </Can>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() =>
            void apiDownload(
              `/imports/template?entity=${entity}`,
              entity === "CONTACTS"
                ? "nbs-contacts-import.xlsx"
                : "nbs-companies-import.xlsx",
            )
          }
        >
          <Download className="size-4" />
          {t("imports.downloadTemplate")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {entity === "CONTACTS" ? t("imports.contactsGuide") : t("imports.companiesGuide")}
        </p>
      </div>

      <details className="rounded-xl border border-border/80 bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          {t("imports.generateWithAi")}
        </summary>
        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-sm text-muted-foreground">{t("imports.aiHelp")}</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5 whitespace-pre-wrap">
            {promptQuery.data?.prompt ?? t("imports.loadingInstruction")}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!promptQuery.data?.prompt) {
                return;
              }
              await navigator.clipboard.writeText(promptQuery.data.prompt);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("common.copied") : t("common.copy")}
          </Button>
        </div>
      </details>

      {selectedFile || parsing || parseError || preview ? (
        <Surface className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {selectedFile ? (
              <span className="font-medium">{selectedFile.name}</span>
            ) : preview ? (
              <span className="font-medium">{preview.filename}</span>
            ) : null}
            {parsing ? (
              <Badge variant="secondary">{t("imports.parsing")}</Badge>
            ) : preview ? (
              <Badge variant="secondary">
                {t("imports.rowCount", { count: preview.counts.total })}
              </Badge>
            ) : null}
          </div>
          {parseError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm">
              {parseError}
            </p>
          ) : null}
          {preview ? (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="success">
                  {t("imports.readyCount", { count: preview.counts.ready })}
                </Badge>
                <Badge variant="warning">
                  {t("imports.warningCount", { count: preview.counts.warning })}
                </Badge>
                <Badge variant="outline">
                  {t("imports.invalidCount", { count: preview.counts.invalid })}
                </Badge>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="p-3">{t("imports.include")}</th>
                      <th className="p-3">{t("imports.row")}</th>
                      <th className="p-3">{t("imports.status")}</th>
                      <th className="p-3">{t("imports.name")}</th>
                      <th className="p-3">{t("imports.fit")}</th>
                      <th className="p-3">{t("imports.problem")}</th>
                      <th className="p-3">{t("imports.access")}</th>
                      <th className="p-3">{t("imports.companySize")}</th>
                      <th className="p-3">{t("imports.source")}</th>
                      <th className="p-3">{t("imports.notes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr key={row.rowNumber} className="border-b border-border align-top">
                        <td className="p-3">
                          <Checkbox
                            checked={row.included}
                            disabled={row.status === "INVALID"}
                            onCheckedChange={(checked) => {
                              const next = structuredClone(preview);
                              next.rows[index]!.included = Boolean(checked);
                              setPreview(next);
                            }}
                          />
                        </td>
                        <td className="p-3 tabular-nums">{row.rowNumber}</td>
                        <td className="p-3">{row.status}</td>
                        <td className="p-3">
                          {row.values["Company Name"] || row.values.Name || t("common.dash")}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {row.values["Company Fit"] || t("common.blank")}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {row.values["Problem Potential"] || t("common.blank")}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {row.values["Decision-Maker Access"] || t("common.blank")}
                        </td>
                        <td className="p-3">{row.values["Company Size"] || t("common.dash")}</td>
                        <td className="p-3">{row.values.Source || t("common.dash")}</td>
                        <td className="p-3 text-muted-foreground">
                          {row.messages.length > 0 ? (
                            <ul className="space-y-1">
                              {row.messages.map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                            </ul>
                          ) : (
                            t("common.dash")
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreview(null);
                    setSelectedFile(null);
                    setParseError(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => commitMutation.mutate()}
                  loading={commitMutation.isPending}
                  disabled={!preview.rows.some((row) => row.included)}
                >
                  {t("imports.confirmImport")}
                </Button>
              </div>
            </>
          ) : null}
        </Surface>
      ) : null}
    </PageFrame>
  );
}
