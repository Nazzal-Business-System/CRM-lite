import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {guardEstimateArchiveMigration as guard,ESTIMATE_ARCHIVE_MIGRATION as migration} from "./estimate-archive-rollout";
test("archive migration requires sole expected migration and reviewed additive checksum",()=>{
 const sql=readFileSync(new URL("../prisma/migrations/20261115120000_estimate_archives/migration.sql",import.meta.url),"utf8");
 assert.doesNotThrow(()=>guard("check",[migration],sql));assert.doesNotThrow(()=>guard("migrate-estimate-archives",[migration],sql));
 for(const pending of [[],[migration,"unexpected"],["unexpected"]])assert.throws(()=>guard("migrate-estimate-archives",pending,sql));
 assert.throws(()=>guard("migrate",[migration],sql));assert.throws(()=>guard("migrate-estimate-archives",[migration],sql+"-- changed"));
 assert.ok(!/^\s*(DROP|ALTER|UPDATE|DELETE FROM)\b/im.test(sql));
});
