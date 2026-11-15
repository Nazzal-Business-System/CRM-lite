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
import { ImportPreviewTable } from "./import-preview";
import { useI18n } from "@/i18n/provider";
import { api, apiDownload, ApiError } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

export function ImportsWorkspace() {
  const { t } = useI18n();
  const {user}=useAuth();
  const [templateError,setTemplateError]=useState<string|null>(null);
  const [templateBusy,setTemplateBusy]=useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>("COMPANIES");
  const [lastResult,setLastResult]=useState<ImportResult|null>(null);
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
    queryKey: ["import-prompt", user?.id, user?.permissions.join(","), user?.marketCodes?.join(","), entity],
    refetchOnWindowFocus:true,
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
      setLastResult(data.result);
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
    if (!file || commitMutation.isPending || parseMutation.isPending) {
      return;
    }
    setLastResult(null);
    setSelectedFile(file);
    setParseError(null);
    parseMutation.mutate(file);
  }

  function switchEntity(next: ImportEntity) {
    if(commitMutation.isPending||parseMutation.isPending)return;
    setLastResult(null);
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
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(event) => {
              submitFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </Can>

      <div className="flex flex-wrap items-center gap-2">
        {(["xlsx","csv"] as const).map(format=><Button key={format} variant="outline" disabled={templateBusy} onClick={()=>{setTemplateBusy(true);setTemplateError(null);void apiDownload(`/imports/template?entity=${entity}&format=${format}`,`nbs-${entity==="CONTACTS"?"contacts":"companies"}-import.${format}`).catch(error=>setTemplateError(errorText(error))).finally(()=>setTemplateBusy(false));}}><Download className="size-4"/>{t("imports.downloadTemplate")} · {format.toUpperCase()}</Button>)}
        {templateError&&<p role="alert" className="text-sm text-destructive">{templateError}</p>}
        <p className="text-sm text-muted-foreground">
          {entity === "CONTACTS" ? t("imports.contactsGuide") : t("imports.companiesGuide")}
        </p>
      </div>

      {lastResult&&<Surface className="space-y-3 p-4"><p role="status" className="text-sm">{t("imports.resultSummary",{created:lastResult.created,duplicates:lastResult.duplicates,invalid:lastResult.invalid,failed:lastResult.failed,skipped:lastResult.skipped})}</p>{lastResult.errors.length>0&&<ul className="space-y-2 text-sm" role="alert">{lastResult.errors.map((error,index)=><li key={index}>{t("imports.row")} {error.rowNumber}: {error.message}</li>)}</ul>}</Surface>}
      <details className="rounded-xl border border-border/80 bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
          {t("imports.generateWithAi")}
        </summary>
        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-sm text-muted-foreground">{t("imports.aiHelp")}</p>
          {promptQuery.isError&&<div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{errorText(promptQuery.error)}</p><Button variant="outline" size="sm" onClick={()=>void promptQuery.refetch()}>{t("common.retry")}</Button></div>}
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
              <div className="flex flex-wrap gap-2 text-sm" aria-live="polite">
                <Badge variant="secondary">{t("imports.selectedCount",{count:preview.rows.filter(row=>row.included).length})}</Badge>
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
              <ImportPreviewTable key={preview.entity+":"+preview.filename} preview={preview} busy={commitMutation.isPending} onInclude={(index,included)=>{const next=structuredClone(preview);next.rows[index]!.included=included;setPreview(next);}}/>
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
