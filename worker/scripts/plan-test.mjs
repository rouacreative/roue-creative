// Usage: node plan-test.mjs https://roua.rouacreative.workers.dev ideas.txt > plan-results.txt
// Sends each idea to /api/prompt/plan (6 shots) and checks the expected fields. "cat=0/10" means either value is accepted.
import fs from "fs";
const base = (process.argv[2] || "").replace(/\/$/, ""), file = process.argv[3] || "ideas.txt";
const CATS = ["product", "architecture", "cinematic story", "explainer", "cartoon", "food", "travel/nature", "sport/action", "tech/AI", "fashion/beauty", "reels", "documentary"];
const L = fs.readFileSync(file, "utf8").split("\n").filter((x) => x.trim() && !x.startsWith("#")).map((l) => { const [idea, ...f] = l.split("|"); const e = {}; f.forEach((x) => { const [k, v] = x.split("="); e[k.trim()] = v.trim(); }); return { idea: idea.trim(), e }; });
const CAM = /close-?up|zoom|\bpan\b|orbit|tracking|slow motion|time-?lapse|\bpov\b|top-down|push in|pull back/i;
let pass = 0; const fails = [];
async function one(c) {
  for (let t = 0; t < 6; t++) {
    const r = await fetch(base + "/api/prompt/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idea: c.idea, shots: 6 }) });
    if (r.status === 429) { await new Promise((x) => setTimeout(x, 20000)); continue; }
    return r.ok ? (await r.json()).plan : null;
  }
  return null;
}
for (const c of L) {
  const p = await one(c); const why = [];
  if (!p) why.push("no plan");
  else {
    for (const k of ["cat", "peo", "sty", "set", "tod", "mood", "rat"]) if (c.e[k] != null && !c.e[k].split("/").includes(String(p[k]))) why.push(`${k}=${p[k]} (want ${c.e[k]})`);
    if (c.e.kw && !c.e.kw.split("/").some((w) => p.subj.toLowerCase().includes(w.toLowerCase()))) why.push("subject misses " + c.e.kw);
    if (p.shots.length !== 6) why.push("shots=" + p.shots.length);
    if (p.shots[p.shots.length - 1].t !== 12) why.push("last shot not hero");
    if (p.shots.some((s) => CAM.test(s.a))) why.push("camera words in action");
    if (p.sty === 11 && /\b(red|green|blue|yellow|orange|pink|purple|golden)\b/i.test(p.subj + p.shots.map((s) => s.a).join(" "))) why.push("colors in B&W");
  }
  if (!why.length) pass++; else fails.push(c.idea + "  =>  " + why.join("; "));
  console.log((why.length ? "FAIL " : "OK   ") + c.idea + "  =>  " + (p ? `[${CATS[p.cat]} sty${p.sty} set${p.set} tod${p.tod} mood${p.mood} pal${p.pal} peo${p.peo} rat${p.rat}] ${p.subj} | ` + p.shots.map((s) => s.t + ":" + s.a).join(" / ") : "-") + (why.length ? "   !! " + why.join("; ") : ""));
}
console.log(`\nSCORE ${pass}/${L.length}\nFAILS:\n` + fails.join("\n"));
