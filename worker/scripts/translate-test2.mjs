// Usage: node translate-test2.mjs https://roua.rouacreative.workers.dev phrases2.txt > results.txt
// Line format: arabic | required terms | forbidden terms. Terms: comma = all must appear, "/" = any of alternatives (case-insensitive substring).
import fs from "fs";
const base = (process.argv[2] || "").replace(/\/$/, ""), file = process.argv[3] || "phrases2.txt", model = process.argv[4] || "", limit = +process.argv[5] || 0; // model "8b" = cheaper model; limit = test only the first N phrases
const L = fs.readFileSync(file, "utf8").split("\n").filter((x) => x.trim() && !x.startsWith("#")).slice(0, limit || 1e9).map((l) => { const [a, r, f] = l.split("|"); return { a: a.trim(), req: (r || "").split(",").map((x) => x.split("/").map((y) => y.trim().toLowerCase()).filter(Boolean)).filter((x) => x.length), bad: (f || "").split("/").map((y) => y.trim().toLowerCase()).filter(Boolean) }; });
let pass = 0; const fails = [];
for (let i = 0; i < L.length; i += 12) {
  const ch = L.slice(i, i + 12); let d;
  for (let t = 0; t < 5; t++) { const r = await fetch(base + "/api/prompt/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texts: ch.map((c) => c.a), m: model }) }); if (r.status === 429) { await new Promise((x) => setTimeout(x, 30000)); continue; } try { d = await r.json(); } catch {} break; }
  ch.forEach((c, k) => { const e = ((d && d.texts && d.texts[k]) || "").toLowerCase(); const ok = e && c.req.every((alts) => alts.some((a) => e.includes(a))) && !c.bad.some((b) => e.includes(b)); if (ok) pass++; else fails.push(c.a + "  =>  " + e); console.log((ok ? "OK   " : "FAIL ") + c.a + "  =>  " + e); });
}
console.log(`\nSCORE ${pass}/${L.length}\nFAILS:\n` + fails.join("\n"));
