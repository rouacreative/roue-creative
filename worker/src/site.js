// Public-site content (CMS) for Zwicky: theme, texts, images, works, series, packages, team, inbox.
import DEF from "./defaults.js";

const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...h } });
const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KINDS = ["work", "series", "episode", "package", "member", "reel"];
export const FILTERS = { ads: "إعلانات", series: "سلاسل", shorts: "قصص قصيرة", motion: "موشن جرافيك" };
export const FONTS = { "": "الافتراضي", "Cairo": "Cairo", "Tajawal": "Tajawal", "Almarai": "Almarai", "Noto Sans Arabic": "Noto Sans Arabic", "IBM Plex Sans Arabic": "IBM Plex Sans Arabic", "Readex Pro": "Readex Pro" };
const BUILTIN = ["desk", "drama", "falcon", "grandma", "headphones", "hero", "kids", "product", "scifi"].map(n => `assets/img/${n}.jpg`);
export const THEME_DEFAULT = { bg: "#FBF7EE", ink: "#0A3D31", accent: "#0E6B50", dark: "#0A2F27", card: "#ffffff", font: "" };
const LINKS = ["youtube", "facebook", "instagram", "tiktok", "whatsapp", "email"];
export const catsOf = site => (Array.isArray(site.categories) && site.categories.length ? site.categories : Object.entries(FILTERS).map(([id, name]) => ({ id, name })));
const SITE_DEFAULT = { theme: {}, texts: {}, images: {}, links: {}, hide_demo: false, managed: {} };

const clip = (v, n) => String(v ?? "").trim().slice(0, n);
export function ytId(v) {
  v = String(v || "").trim(); if (!v) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  const m = v.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
async function imgOk(sql, v) {
  if (!v) return "";
  if (BUILTIN.includes(v) || v === "assets/img/logo-mark.png") return v;
  const m = String(v).match(/^m:([0-9a-f-]{36})$/i);
  if (m && UUID.test(m[1]) && (await sql`select 1 from media where id=${m[1]}`).length) return "m:" + m[1];
  return null;
}
export async function getSite(sql) {
  const r = (await sql`select v from settings where k='site'`)[0];
  let s = {}; try { s = JSON.parse(r?.v || "{}"); } catch (_) {}
  return { ...SITE_DEFAULT, ...s };
}
const saveSite = (sql, s) => sql`insert into settings(k,v) values('site',${JSON.stringify(s)}) on conflict (k) do update set v=excluded.v`;
const pubItem = i => ({ id: i.id, kind: i.kind, title: i.title, sub: i.sub, cat: i.cat, image: i.image, yt: i.yt, extra: i.extra });

export async function handlePublic(req, url, p, sql, body, env, notifyAdmins) {
  if (p === "/api/site" && req.method === "GET") {
    const [site, items] = await Promise.all([getSite(sql), sql`select id,kind,title,sub,cat,image,yt,extra from site_items where published order by position,created_at`]);
    return json({ site: { ...site, categories: catsOf(site) }, items }, 200, { "cache-control": "no-cache" });
  }
  if (p.startsWith("/api/media/") && req.method === "GET") {
    const id = p.slice(11);
    if (!UUID.test(id)) return new Response("not found", { status: 404 });
    const r = (await sql`select mime, encode(data,'base64') b from media where id=${id}`)[0];
    if (!r) return new Response("not found", { status: 404 });
    const bin = Uint8Array.from(atob(r.b.replace(/\s/g, "")), c => c.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": r.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } });
  }
  if ((p === "/api/public/request" || p === "/api/public/subscribe") && req.method === "POST") {
    if (body.hp) return json({ ok: 1 }); // honeypot
    const ip = req.headers.get("cf-connecting-ip") || "?", k = "r:" + ip;
    if ((await sql`select count(*)::int c from login_attempts where k=${k} and at > now() - interval '1 hour'`)[0].c >= 8) return json({ error: "too_many" }, 429);
    await sql`insert into login_attempts(k) values(${k})`;
    const sub = p.endsWith("subscribe"), data = {};
    for (const f of sub ? ["email"] : ["name", "company", "phone", "email", "service", "budget", "details"]) if (body[f] != null) data[f] = clip(body[f], f === "details" ? 2000 : 200);
    if (sub ? !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(data.email || "") : !data.name || !(data.phone || data.email)) return json({ error: "bad_input" }, 400);
    await sql`insert into inbox(kind,data) values(${sub ? "subscribe" : "request"},${JSON.stringify(data)})`;
    if (!sub) await notifyAdmins("طلب جديد من الموقع", `${data.name}${data.service ? " · " + data.service : ""}`, "notify_request");
    return json({ ok: 1 });
  }
  return null;
}

async function cleanItem(sql, b, old, site) {
  const kind = old?.kind || b.kind;
  if (!KINDS.includes(kind)) return { error: "bad_kind" };
  const title = clip(b.title, 120); if (!title) return { error: "bad_title" };
  const o = { kind, title, sub: clip(b.sub, 300), cat: clip(b.cat, 40), published: b.published !== false, extra: {}, yt: "" };
  const yt = ytId(b.yt); if (yt === null) return { error: "bad_youtube" }; o.yt = yt;
  const im = await imgOk(sql, b.image); if (im === null) return { error: "bad_image" }; o.image = im;
  const okCat = id => catsOf(site).some(c => c.id === id) ? id : "";
  if (kind === "work") o.extra = { filter: okCat(b.filter), desc: clip(b.desc, 1500), client: clip(b.client, 80), year: clip(b.year, 10), services: clip(b.services, 160) };
  if (kind === "reel") o.extra = { filter: okCat(b.filter) };
  if (kind === "package") {
    o.extra = { price: clip(b.price, 60), unit: clip(b.unit, 80), badge: clip(b.badge, 30), featured: !!b.featured,
      features: (Array.isArray(b.features) ? b.features : String(b.features || "").split("\n")).map(x => clip(x, 120)).filter(Boolean).slice(0, 10) };
  }
  if (kind === "member") o.extra = { role: clip(b.role, 60) };
  if (kind === "episode") {
    const sid = String(b.series || old?.extra?.series || "");
    if (!UUID.test(sid) || !(await sql`select 1 from site_items where id=${sid} and kind='series'`).length) return { error: "bad_series" };
    o.extra = { series: sid };
  }
  return { o };
}
const sniff = bin => {
  const h = [...bin.slice(0, 12)];
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return "image/png";
  if (h[0] === 0xff && h[1] === 0xd8) return "image/jpeg";
  if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return "image/gif";
  if (h[0] === 0x52 && h[1] === 0x49 && h[8] === 0x57 && h[9] === 0x45) return "image/webp";
  return null;
};

export async function handleAdmin(req, url, p, sql, body, env) {
  if (p === "/api/admin/site" && req.method === "GET") {
    const [site, items, media, inbox] = await Promise.all([getSite(sql),
      sql`select id,kind,title,sub,cat,image,yt,extra,published from site_items order by position,created_at`,
      sql`select id,name,mime,size from media order by created_at desc limit 100`,
      sql`select id,kind,data,handled,created_at::text created_at from inbox order by handled, created_at desc limit 100`]);
    return json({ site, cats: catsOf(site), items, media, inbox, registry: DEF.texts, filters: FILTERS, fonts: FONTS, theme_default: THEME_DEFAULT });
  }
  if (p === "/api/admin/site/save") {
    const s = await getSite(sql);
    if (body.theme) {
      const t = {};
      for (const k of ["bg", "ink", "accent", "dark", "card"]) { if (body.theme[k] != null && body.theme[k] !== "") { if (!HEX.test(body.theme[k])) return json({ error: "bad_color" }, 400); t[k] = body.theme[k].toLowerCase(); } }
      if (body.theme.font && !Object.hasOwn(FONTS, body.theme.font)) return json({ error: "bad_font" }, 400);
      if (body.theme.font) t.font = body.theme.font;
      s.theme = t;
    }
    if (body.texts) { const t = {}; for (const k of Object.keys(DEF.texts)) { const v = clip(body.texts[k], 600); if (v && v !== DEF.texts[k][2]) t[k] = v; } s.texts = t; }
    if (body.links) { const l = {}; for (const k of LINKS) { const v = clip(body.links[k], 200); if (v) { if (k === "email" ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : (k === "whatsapp" ? !/^(\+?\d[\d\s-]{6,19}|https:\/\/wa\.me\/\d+.*)$/.test(v) : !/^https:\/\/\S+$/.test(v))) return json({ error: "bad_link", field: k }, 400); l[k] = v; } } s.links = l; }
    if (body.images) { const im = {}; for (const k of ["logo"]) { const v = await imgOk(sql, body.images[k]); if (v === null) return json({ error: "bad_image" }, 400); if (v) im[k] = v; } s.images = im; }
    if (Array.isArray(body.categories)) {
      const seen = new Set(), out = [];
      for (const c of body.categories.slice(0, 12)) {
        const name = clip(c?.name, 30); if (!name) continue;
        let id = /^[a-z0-9]{1,12}$/.test(c?.id || "") ? c.id : "c" + Math.random().toString(36).slice(2, 8);
        while (seen.has(id)) id = "c" + Math.random().toString(36).slice(2, 8);
        seen.add(id); out.push({ id, name });
      }
      if (!out.length) return json({ error: "bad_input" }, 400);
      s.categories = out;
      await sql`update site_items set extra = extra || '{"filter":""}'::jsonb where kind in ('work','reel') and not (coalesce(extra->>'filter','') = any(${out.map(c => c.id)}))`;
    }
    if (typeof body.hide_demo === "boolean") s.hide_demo = body.hide_demo;
    await saveSite(sql, s);
    return json({ ok: 1 });
  }
  if (p === "/api/admin/item") {
    const old = body.id ? (await sql`select * from site_items where id=${body.id}`)[0] : null;
    if (body.id && !old) return json({ error: "not_found" }, 404);
    const { o, error } = await cleanItem(sql, body, old, await getSite(sql));
    if (error) return json({ error }, 400);
    let id = old?.id;
    if (old) await sql`update site_items set title=${o.title},sub=${o.sub},cat=${o.cat},image=${o.image},yt=${o.yt},extra=${JSON.stringify(o.extra)},published=${o.published} where id=${old.id}`;
    else {
      const pos = (await sql`select coalesce(max(position),0)+1 n from site_items where kind=${o.kind}`)[0].n;
      id = (await sql`insert into site_items(kind,title,sub,cat,image,yt,extra,position,published) values(${o.kind},${o.title},${o.sub},${o.cat},${o.image},${o.yt},${JSON.stringify(o.extra)},${pos},${o.published}) returning id`)[0].id;
    }
    if (o.kind !== "episode") { const s = await getSite(sql); if (!s.managed[o.kind]) { s.managed[o.kind] = true; await saveSite(sql, s); } }
    return json({ ok: 1, id });
  }
  if (p === "/api/admin/item/move") {
    const it = (await sql`select id,kind,extra from site_items where id=${body.id}`)[0]; if (!it) return json({ error: "not_found" }, 404);
    const sib = (await sql`select id from site_items where kind=${it.kind} and (${it.kind}<>'episode' or extra->>'series'=${it.extra?.series || ""}) order by position,created_at`).map(r => r.id);
    const i = sib.indexOf(it.id), j = i + (body.dir < 0 ? -1 : 1);
    if (j < 0 || j >= sib.length) return json({ ok: 1 });
    [sib[i], sib[j]] = [sib[j], sib[i]];
    await sql.transaction(sib.map((id, n) => sql`update site_items set position=${n + 1} where id=${id}`));
    return json({ ok: 1 });
  }
  if (p === "/api/admin/item/delete") {
    const it = (await sql`select id,kind from site_items where id=${body.id}`)[0]; if (!it) return json({ ok: 1 });
    if (it.kind === "series") await sql`delete from site_items where kind='episode' and extra->>'series'=${it.id}`;
    await sql`delete from site_items where id=${it.id}`;
    return json({ ok: 1 });
  }
  if (p === "/api/admin/site/seed") {
    const kind = body.kind, rows = DEF.seeds[kind];
    if (!rows) return json({ error: "bad_kind" }, 400);
    if ((await sql`select 1 from site_items where kind=${kind} limit 1`).length) return json({ error: "not_empty" }, 409);
    await sql.transaction(rows.map((r, n) => sql`insert into site_items(kind,title,sub,cat,image,yt,extra,position) values(${kind},${r.title},${r.sub || ""},${r.cat || ""},${r.image || ""},'',${JSON.stringify(kind === "work" ? { filter: r.filter } : kind === "package" ? { price: r.price, unit: r.unit, badge: r.badge, featured: r.featured, features: r.features } : kind === "member" ? { role: r.role } : {})},${n + 1})`));
    const s = await getSite(sql); s.managed[kind] = true; await saveSite(sql, s);
    return json({ ok: 1, count: rows.length });
  }
  if (p === "/api/admin/media") {
    const b64 = String(body.b64 || "");
    if (b64.length > 2_100_000) return json({ error: "too_big" }, 413);
    let bin; try { bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch (_) { return json({ error: "bad_image" }, 400); }
    const mime = sniff(bin); if (!mime || bin.length > 1_500_000) return json({ error: bin.length > 1_500_000 ? "too_big" : "bad_image" }, 400);
    const id = (await sql`insert into media(name,mime,data,size) values(${clip(body.name, 80) || "image"},${mime},decode(${b64},'base64'),${bin.length}) returning id`)[0].id;
    return json({ ok: 1, id: "m:" + id });
  }
  if (p === "/api/admin/media/delete") {
    const id = String(body.id || "").replace(/^m:/, ""); if (!UUID.test(id)) return json({ error: "bad" }, 400);
    const ref = "m:" + id, s = await getSite(sql);
    if ((await sql`select 1 from site_items where image=${ref} limit 1`).length || Object.values(s.images || {}).includes(ref)) return json({ error: "in_use" }, 409);
    await sql`delete from media where id=${id}`; return json({ ok: 1 });
  }
  if (p === "/api/admin/inbox/handled") { await sql`update inbox set handled=${!!body.handled} where id=${body.id}`; return json({ ok: 1 }); }
  if (p === "/api/admin/inbox/delete") { await sql`delete from inbox where id=${body.id}`; return json({ ok: 1 }); }
  return json({ error: "not_found" }, 404);
}
