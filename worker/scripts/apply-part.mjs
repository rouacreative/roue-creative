// usage: DATABASE_URL=... node scripts/apply-part.mjs "<marker comment text>"  (applies the part of schema.sql after the marker)
import { neon } from "@neondatabase/serverless"; import fs from "fs";
const sql = neon(process.env.DATABASE_URL), s = fs.readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const i = s.indexOf(process.argv[2]); if (i < 0) throw new Error("marker not found");
for (const st of s.slice(i).split(";\n").map(x => x.replace(/^--.*\n/gm, "").trim()).filter(Boolean)) await sql(st);
console.log((await sql`select table_name from information_schema.tables where table_schema='public' order by 1`).map(r => r.table_name).join(", "));
