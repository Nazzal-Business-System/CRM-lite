import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "../..");

config({ path: resolve(apiRoot, ".env"), quiet: true });
config({ path: resolve(repoRoot, ".env"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });
