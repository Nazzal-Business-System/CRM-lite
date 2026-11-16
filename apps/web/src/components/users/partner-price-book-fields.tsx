"use client";
import { PRICE_BOOK_IDS, PRICE_BOOK_CURRENCIES } from "@nbs/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { EnumSelect } from "@/components/crm/selects";
import { useI18n } from "@/i18n/provider";
import type { PartnerForm } from "@/lib/partners";

export function PartnerPriceBookFields({ value, disabled, pricingEnabled, onChange }: {
  value: NonNullable<PartnerForm["priceBookAccess"]>; disabled: boolean; pricingEnabled: boolean;
  onChange: (value: NonNullable<PartnerForm["priceBookAccess"]>) => void;
}) {
  const { t, dir } = useI18n();
  const label = (id: string) => t(`partners.book${id}`);
  return <div className="space-y-4">
    <p className="text-sm leading-6 text-muted-foreground">{t("partners.priceBookHint")}</p>
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">{t("partners.priceBooks")}</legend>
      {PRICE_BOOK_IDS.map(id => <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-disabled:cursor-not-allowed ${value.bookIds.includes(id) ? "border-primary/60 bg-primary/[0.06]" : "border-border/60"}`}>
        <Checkbox checked={value.bookIds.includes(id)} onCheckedChange={checked => {
          const bookIds = checked === true ? [...new Set([...value.bookIds, id])] : value.bookIds.filter(book => book !== id);
          onChange({ scope: "selected", bookIds, defaultBookId: value.defaultBookId && bookIds.includes(value.defaultBookId) ? value.defaultBookId : null });
        }} /><span><span className="block font-medium">{label(id)}</span><bdi className="text-xs text-muted-foreground">{PRICE_BOOK_CURRENCIES[id]}</bdi>{id !== "JO" && <span className="mt-1 block text-xs text-muted-foreground">{t("partners.bookDraft")}</span>}</span>
      </label>)}
    </fieldset>
    <div className="max-w-sm space-y-2"><label htmlFor="partner-price-book-default" className="text-sm font-medium">{t("partners.defaultPriceBook")}</label>
      <EnumSelect id="partner-price-book-default" dir={dir} disabled={disabled || !value.bookIds.length} value={value.defaultBookId ?? ""} allowEmpty emptyLabel={t("partners.chooseDefault")} options={value.bookIds.map(id => ({ value: id, label: label(id) }))} onChange={id => onChange({ ...value, defaultBookId: PRICE_BOOK_IDS.find(book => book === id) ?? null })} />
    </div>
    {!!value.bookIds.length && !value.defaultBookId && <p role="alert" className="text-sm text-destructive">{t("partners.priceBookDefaultRequired")}</p>}
    {pricingEnabled && !value.bookIds.length && <p role="status" className="text-sm text-amber-600 dark:text-amber-400">{t("partners.priceBookWarning")}</p>}
  </div>;
}
