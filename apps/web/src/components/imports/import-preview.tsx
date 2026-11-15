"use client";

import { Fragment, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { COMPANY_IMPORT_COLUMNS, CONTACT_IMPORT_COLUMNS, type ImportPreview, type ImportPreviewRow } from "@nbs/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/i18n/provider";

export function ImportPreviewTable({ preview, busy, onInclude }: {
  preview: ImportPreview;
  busy: boolean;
  onInclude: (index: number, included: boolean) => void;
}) {
  const { t, dir } = useI18n();
  const id = useId();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const columns = preview.entity === "COMPANIES"
    ? ["Company Name", "Country Code", "Sales Market", "Website", "Sector", "Locations"]
    : ["Company Name", "Name", "Job Title", "Email", "Phone"];
  return <div dir={dir} role="region" aria-label={t("imports.previewLabel")} tabIndex={0}
    className="max-h-[65vh] overflow-auto rounded-lg border border-border/70 focus-visible:outline-2 focus-visible:outline-ring">
    <table className="w-full min-w-[70rem] table-fixed text-xs">
      <colgroup><col className="w-12"/><col className="w-12"/><col className="w-24"/>
        {columns.map(column => <col key={column} className={column === "Country Code" || column === "Sales Market" ? "w-24" : "w-48"}/>)}
        <col className="w-64"/><col className="w-20"/>
      </colgroup>
      <thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-start text-muted-foreground">
        {[t("imports.include"), t("imports.row"), t("imports.status"), ...columns.map(column => t("imports.columns." + column)), t("imports.notes"), t("imports.details")].map((label, index) => <th key={index} scope="col" className="whitespace-nowrap px-2 py-2.5 text-start font-medium">{label}</th>)}
      </tr></thead>
      <tbody>{preview.rows.map((row, index) => {
        const open = expanded.has(row.rowNumber);
        const target = `${id}-${row.rowNumber}`;
        return <Fragment key={row.rowNumber}>
          <tr className="h-11 border-b border-border/50 hover:bg-muted/20">
            <td className="px-2 py-2"><Checkbox aria-label={t("imports.includeRow", {row: row.rowNumber})} checked={row.included} disabled={busy || row.status === "INVALID"} onCheckedChange={value => onInclude(index, value === true)}/></td>
            <td className="px-2 py-2 tabular-nums text-muted-foreground">{row.rowNumber}</td>
            <td className="px-2 py-2"><Badge variant={row.status === "READY" ? "success" : row.status === "WARNING" ? "warning" : "outline"} className="whitespace-nowrap px-1.5 py-0 text-[10px]">{t("imports.status" + row.status)}</Badge></td>
            {columns.map(column => <td key={column} className="px-2 py-2"><span title={row.values[column] ?? undefined} className="block truncate">{row.values[column] || t("common.dash")}</span></td>)}
            <td className="px-2 py-2 text-muted-foreground"><span className="block truncate" title={row.messages.join("\n")}>{row.messages[0] || t("common.dash")}</span>{row.messages.length > 1 && <span className="sr-only">{t("imports.moreMessages", {count: row.messages.length - 1})}</span>}</td>
            <td className="px-2 py-2"><Button type="button" size="icon" variant="ghost" className="size-7" title={t("imports.rowDetails", {row: row.rowNumber})} aria-label={t("imports.rowDetails", {row: row.rowNumber})} aria-expanded={open} aria-controls={target} onClick={() => setExpanded(previous => {const next = new Set(previous); if (next.has(row.rowNumber)) next.delete(row.rowNumber); else next.add(row.rowNumber); return next;})}><ChevronDown aria-hidden="true" className={open ? "size-3.5 rotate-180" : "size-3.5"}/></Button></td>
          </tr>
          {open && <tr id={target}><td colSpan={columns.length + 5} className="border-b border-border bg-muted/15 p-4">
            <ImportPreviewRowDetails row={row} entity={preview.entity}/>
          </td></tr>}
        </Fragment>;
      })}</tbody>
    </table>
  </div>;
}

export function ImportPreviewRowDetails({row,entity}:{row:ImportPreviewRow;entity:ImportPreview["entity"]}) {
  const {t}=useI18n();const columns=entity==="COMPANIES"?COMPANY_IMPORT_COLUMNS:CONTACT_IMPORT_COLUMNS;
  return <div role="group" aria-label={t("imports.rowDetails",{row:row.rowNumber})} className="w-[calc(100vw-5rem)] max-w-5xl space-y-4 md:w-auto">
    {row.messages.length>0&&<ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">{row.messages.map((message,i)=><li key={i}>{message}</li>)}</ul>}
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{columns.map(column=><div key={column} className="min-w-0"><dt className="mb-1 text-muted-foreground">{t("imports.columns."+column)}</dt><dd className="whitespace-pre-wrap break-words text-sm">{row.values[column]||t("common.blank")}</dd></div>)}</dl>
  </div>;
}
