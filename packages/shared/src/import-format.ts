import {
  COMPANY_SIZE_LABELS,
  COMPANY_SIZES,
  COMPANY_SOURCE_LABELS,
  COMPANY_SOURCES,
  DECISION_ROLE_LABELS,
  DECISION_ROLES,
  PREFERRED_CHANNEL_LABELS,
  PREFERRED_CHANNELS,
  QUALIFICATION_MAX,
  QUALIFICATION_MIN,
  type CompanySize,
  type CompanySource,
  type DecisionRole,
  type PreferredChannel,
} from "./crm";

const DASH_PATTERN = /[\u2010-\u2015\u2212]/g;

export function canonicalizeImportText(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().replace(DASH_PATTERN, "-").replace(/\s+/g, " ");
}

export function foldImportToken(value: string): string {
  return canonicalizeImportText(value).toLowerCase();
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = canonicalizeImportText(value);
  return trimmed.length === 0 ? null : trimmed;
}

export function foldImportHeader(header: string): string {
  return foldImportToken(header).replace(/[_/]+/g, " ");
}

export function matchImportColumn(
  header: string,
  columns: readonly string[],
): string | null {
  const folded = foldImportHeader(header);
  if (!folded) {
    return null;
  }
  return columns.find((column) => foldImportHeader(column) === folded) ?? null;
}

export function parseControlledEnum<T extends string>(
  raw: string | null | undefined,
  values: readonly T[],
  labels: Record<T, string>,
  fieldLabel: string,
): { value: T | null; error: string | null } {
  const cleaned = emptyToNull(raw ?? null);
  if (!cleaned) {
    return { value: null, error: null };
  }

  const folded = foldImportToken(cleaned);
  const compact = folded.replace(/[\s-]/g, "");
  const match = values.find((value) => {
    const foldedValue = foldImportToken(value);
    const foldedLabel = foldImportToken(labels[value]);
    return (
      folded === foldedValue ||
      folded === foldedLabel ||
      compact === foldedValue.replace(/[\s-]/g, "") ||
      compact === foldedLabel.replace(/[\s-]/g, "")
    );
  });

  if (!match) {
    return {
      value: null,
      error: `${fieldLabel}: unsupported value "${cleaned}"`,
    };
  }

  return { value: match, error: null };
}

export function parseOptionalScore(
  raw: string | null | undefined,
  fieldLabel: string,
): { value: number | null; error: string | null } {
  const cleaned = emptyToNull(raw ?? null);
  if (!cleaned) {
    return { value: null, error: null };
  }

  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return {
      value: null,
      error: `${fieldLabel}: must be a whole number from ${QUALIFICATION_MIN} to ${QUALIFICATION_MAX}`,
    };
  }
  const value = Math.round(numeric);
  if (
    Math.abs(numeric - value) > 1e-6 ||
    value < QUALIFICATION_MIN ||
    value > QUALIFICATION_MAX
  ) {
    return {
      value: null,
      error: `${fieldLabel}: must be a whole number from ${QUALIFICATION_MIN} to ${QUALIFICATION_MAX}`,
    };
  }

  return { value, error: null };
}

export function parseOptionalUrl(
  raw: string | null | undefined,
  fieldLabel: string,
): { value: string | null; error: string | null } {
  const cleaned = emptyToNull(raw ?? null);
  if (!cleaned) {
    return { value: null, error: null };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { value: null, error: `${fieldLabel}: unsupported value "${cleaned}"` };
    }
    return { value: cleaned, error: null };
  } catch {
    return { value: null, error: `${fieldLabel}: unsupported value "${cleaned}"` };
  }
}

export function parseOptionalEmail(
  raw: string | null | undefined,
  fieldLabel: string,
): { value: string | null; error: string | null } {
  const cleaned = emptyToNull(raw ?? null);
  if (!cleaned) {
    return { value: null, error: null };
  }
  if (!cleaned.includes("@") || cleaned.includes(" ")) {
    return { value: null, error: `${fieldLabel}: unsupported value "${cleaned}"` };
  }
  return { value: cleaned.toLowerCase(), error: null };
}

export function parseCompanySize(
  raw: string | null | undefined,
): { value: CompanySize | null; error: string | null } {
  return parseControlledEnum(
    raw,
    COMPANY_SIZES,
    COMPANY_SIZE_LABELS,
    "Company Size",
  );
}

export function parseCompanySource(
  raw: string | null | undefined,
): { value: CompanySource | null; error: string | null } {
  return parseControlledEnum(
    raw,
    COMPANY_SOURCES,
    COMPANY_SOURCE_LABELS,
    "Source",
  );
}

export function parseDecisionRole(
  raw: string | null | undefined,
): { value: DecisionRole | null; error: string | null } {
  return parseControlledEnum(
    raw,
    DECISION_ROLES,
    DECISION_ROLE_LABELS,
    "Decision Role",
  );
}

export function parsePreferredChannel(
  raw: string | null | undefined,
): { value: PreferredChannel | null; error: string | null } {
  return parseControlledEnum(
    raw,
    PREFERRED_CHANNELS,
    PREFERRED_CHANNEL_LABELS,
    "Preferred Channel",
  );
}

export function importGuide(entity: "COMPANIES" | "CONTACTS"): string {
  if (entity === "CONTACTS") {
    return `Required: Company Name, Name. Decision Role: ${Object.values(DECISION_ROLE_LABELS).join(", ")}. Preferred Channel: ${Object.values(PREFERRED_CHANNEL_LABELS).join(", ")}.`;
  }
  return `Required: Company Name. Size: ${Object.values(COMPANY_SIZE_LABELS).join(", ")}. Source: ${Object.values(COMPANY_SOURCE_LABELS).join(", ")}. Scores 1–5 optional. Fit + Problem Potential set Priority now; Access pending until Decision-Maker Access is known. Full Qualification uses all three. Blank Owner Email assigns the importing user.`;
}

export const COMPANY_SIZE_IMPORT_VALUES = COMPANY_SIZES.map(
  (value) => COMPANY_SIZE_LABELS[value],
);
export const COMPANY_SOURCE_IMPORT_VALUES = COMPANY_SOURCES.map(
  (value) => COMPANY_SOURCE_LABELS[value],
);
