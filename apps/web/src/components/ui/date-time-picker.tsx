"use client";

import { Calendar as CalendarIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";
import { jordanDateTimeToUtc, jordanParts } from "@/lib/format";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year!, month! - 1, day);
  }
  const date = new Date(value);
  const parts = jordanParts(date);
  return parts
    ? new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    : undefined;
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeValue(date: Date): string {
  return jordanDateTimeToUtc({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: 0,
  });
}

export function DateTimePicker({
  value,
  onChange,
  includeTime = false,
  placeholder,
  disabled,
  id,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  includeTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseIsoDate(value), [value]);
  const dateFnsLocale = locale === "ar" ? ar : enUS;
  const uses12Hour = locale === "en";

  const [hour, setHour] = useState(() => selected?.getHours() ?? 9);
  const [minute, setMinute] = useState(() => selected?.getMinutes() ?? 0);

  function commitDate(next: Date | undefined) {
    if (!next) {
      onChange("");
      return;
    }
    if (!includeTime) {
      onChange(toDateValue(next));
      setOpen(false);
      return;
    }
    const withTime = new Date(next);
    withTime.setHours(hour, minute, 0, 0);
    onChange(toDateTimeValue(withTime));
  }

  function commitTime(nextHour: number, nextMinute: number) {
    setHour(nextHour);
    setMinute(nextMinute);
    const base = selected ? new Date(selected) : new Date();
    base.setHours(nextHour, nextMinute, 0, 0);
    onChange(toDateTimeValue(base));
  }

  const display = selected
    ? format(
        selected,
        includeTime ? (uses12Hour ? "PP p" : "PP HH:mm") : "PP",
        { locale: dateFnsLocale },
      )
    : null;

  const hourOptions = uses12Hour
    ? Array.from({ length: 12 }, (_, index) => index + 1)
    : Array.from({ length: 24 }, (_, index) => index);

  const displayHour = uses12Hour
    ? ((hour + 11) % 12) + 1
    : hour;
  const period = hour >= 12 ? "PM" : "AM";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && selected) {
          setHour(selected.getHours());
          setMinute(selected.getMinutes());
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 font-normal",
            !display && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">
            {display ?? placeholder ?? t("datePicker.placeholder")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-[calc(100vw-1.5rem)] p-0"
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        avoidCollisions
      >
        <div className="max-h-[min(28rem,calc(100dvh-2rem))] overflow-y-auto overscroll-contain">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => commitDate(date)}
            locale={dateFnsLocale}
            dir={locale === "ar" ? "rtl" : "ltr"}
          />
          {includeTime ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={displayHour}
                aria-label={t("datePicker.hour")}
                onChange={(event) => {
                  const nextDisplay = Number(event.target.value);
                  if (!uses12Hour) {
                    commitTime(nextDisplay, minute);
                    return;
                  }
                  const nextHour =
                    period === "AM"
                      ? nextDisplay % 12
                      : (nextDisplay % 12) + 12;
                  commitTime(nextHour, minute);
                }}
              >
                {hourOptions.map((option) => (
                  <option key={option} value={option}>
                    {pad(option)}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value={minute}
                aria-label={t("datePicker.minute")}
                onChange={(event) => commitTime(hour, Number(event.target.value))}
              >
                {Array.from({ length: 60 }, (_, index) => (
                  <option key={index} value={index}>
                    {pad(index)}
                  </option>
                ))}
              </select>
              {uses12Hour ? (
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={period}
                  aria-label={t("datePicker.period")}
                  onChange={(event) => {
                    const nextPeriod = event.target.value as "AM" | "PM";
                    const base = displayHour % 12;
                    commitTime(nextPeriod === "PM" ? base + 12 : base, minute);
                  }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              ) : null}
            </div>
          ) : null}
          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-popover px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const nowParts = jordanParts(new Date())!;
                const now = new Date(
                  nowParts.year,
                  nowParts.month - 1,
                  nowParts.day,
                  nowParts.hour,
                  nowParts.minute,
                );
                if (includeTime) {
                  setHour(now.getHours());
                  setMinute(now.getMinutes());
                  onChange(toDateTimeValue(now));
                } else {
                  onChange(toDateValue(now));
                  setOpen(false);
                }
              }}
            >
              {t("datePicker.today")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <X className="size-3.5" />
              {t("datePicker.clear")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
