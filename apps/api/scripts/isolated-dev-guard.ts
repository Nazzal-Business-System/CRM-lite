import pg from "pg";
import { createHash } from "node:crypto";

export const CHILD = {
  project: "divine-bread-20243849", branch: "br-polished-hat-axgmkll3",
  endpoint: "ep-lively-dew-ax64x3u4", database: "neondb",
} as const;
const parentBranch = "br-calm-fire-axiwyf0s";
const childHost = `${CHILD.endpoint}.c-4.us-east-2.aws.neon.tech`;

export function validateChildUrl(value: string): string {
  const url = new URL(value);
  const fingerprint = createHash("sha256").update(url.hostname + url.pathname).digest("hex").slice(0, 12);
  if (fingerprint === "48ab5bbd9943" || ![childHost, childHost.replace(CHILD.endpoint, `${CHILD.endpoint}-pooler`)].includes(url.hostname)
    || url.pathname !== "/neondb" || url.protocol !== "postgresql:" || (url.port && url.port !== "5432")
    || url.searchParams.get("sslmode") !== "verify-full" || url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new Error("Isolated development URL rejected.");
  }
  return fingerprint;
}

export async function verifyChild(value: string) {
  const fingerprint = validateChildUrl(value);
  const client = new pg.Client({ connectionString: value, connectionTimeoutMillis: 15000, query_timeout: 15000,
    options: "-c default_transaction_read_only=on" });
  try {
    await client.connect();
    const identity = (await client.query<{ project: string; branch: string; endpoint: string; database: string }>(
      "SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,current_setting('neon.endpoint_id',true) AS endpoint,current_database() AS database",
    )).rows[0];
    if (!identity || identity.branch === parentBranch || Object.entries(CHILD).some(([key, expected]) => identity[key as keyof typeof identity] !== expected)) {
      throw new Error("Isolated development server identity rejected.");
    }
    return { ...identity, fingerprint };
  } finally { await client.end(); }
}
