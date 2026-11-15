import {createHash} from "node:crypto";
export const ESTIMATE_ARCHIVE_MIGRATION="20261115120000_estimate_archives";
export function guardEstimateArchiveMigration(mode:string,pending:string[],sql:string){
  if(pending.includes(ESTIMATE_ARCHIVE_MIGRATION)&&mode!=="check"&&mode!=="migrate-estimate-archives")throw new Error("Use the reviewed archive migration operation.");
  if(mode==="migrate-estimate-archives"&&(pending.length!==1||pending[0]!==ESTIMATE_ARCHIVE_MIGRATION||createHash("sha256").update(sql.replaceAll("\r\n","\n")).digest("hex")!=="c926de9f8004a75f9b8375374143bf45d62ed01643ea417be24f0d9464425657"))throw new Error("Estimate archive migration order/checksum mismatch.");
}
