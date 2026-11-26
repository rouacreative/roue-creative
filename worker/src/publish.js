// Meta publishing (Facebook Page video + Instagram Reel). Meta fetches the video from a public https link (file_url / video_url),
// so the Worker only makes API calls and never proxies video bytes.
// Secrets: META_PAGE_TOKEN. Vars: META_PAGE_ID, META_IG_USER_ID, optional GRAPH_VERSION.
// Safety: real publishing is refused unless the admin switch settings.publish_live is true. Test mode only creates an
// unpublished Facebook video and an Instagram container that is never published.
const GV = env => env.GRAPH_VERSION || "v23.0";
const G = env => `https://graph.facebook.com/${GV(env)}`;
const PLAT = { fb: "فيسبوك", ig: "إنستجرام" };
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const driveDirect = u => { const m = String(u).match(/drive\.google\.com\/file\/d\/([\w-]+)|[?&]id=([\w-]+)/); const id = m && (m[1] || m[2]); return id && /drive\.google\.com|docs\.google\.com/.test(u) ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : u; };
const okUrl = u => { try { const x = new URL(u); return x.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(x.hostname); } catch (_) { return false; } };

async function graph(env, method, path, params) {
  const body = new URLSearchParams({ ...params, access_token: env.META_PAGE_TOKEN });
  const r = await fetch(method === "GET" ? `${G(env)}${path}?${body}` : `${G(env)}${path}`, method === "GET" ? {} : { method, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) { const e = d.error || {}; throw new Error(`${e.message || "meta_error"}${e.code ? " (" + e.code + (e.error_subcode ? "/" + e.error_subcode : "") + ")" : ""}`); }
  return d;
}

async function liveOn(sql) { const r = (await sql`select v from settings where k='publish_live'`)[0]; return !!r && r.v === "true"; }
const setPost = (sql, id, st, extra = {}) => sql`update posts set status=${st}, error=${extra.error ?? null}, remote_id=coalesce(${extra.remote ?? null}, remote_id), meta=meta || ${JSON.stringify(extra.meta || {})}::jsonb, updated_at=now() where id=${id}`;

async function startFb(sql, env, post, live) {
  const d = await graph(env, "POST", `/${env.META_PAGE_ID}/videos`, { file_url: post.video_url, description: post.caption, published: live ? "true" : "false" });
  await setPost(sql, post.id, live ? "processing" : "test_ok", { remote: d.id });
}
async function startIg(sql, env, post, live) {
  const d = await graph(env, "POST", `/${env.META_IG_USER_ID}/media`, { media_type: "REELS", video_url: post.video_url, caption: post.caption, share_to_feed: "true" });
  await setPost(sql, post.id, "processing", { meta: { container: d.id } });
}

// advance one post: Instagram container -> publish when FINISHED (live only); Facebook -> check video status
export async function advance(sql, env, post) {
  if (!["processing", "test_wait"].includes(post.status)) return post;
  try {
    if (post.platform === "ig") {
      const c = post.meta?.container; if (!c) return post;
      const s = await graph(env, "GET", `/${c}`, { fields: "status_code,status" });
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") await setPost(sql, post.id, "failed", { error: `Instagram: ${s.status || s.status_code}` });
      else if (s.status_code === "FINISHED") {
        if (post.mode === "live") { if (!(await liveOn(sql))) return post; const p = await graph(env, "POST", `/${env.META_IG_USER_ID}/media_publish`, { creation_id: c }); await setPost(sql, post.id, "published", { remote: p.id }); }
        else await setPost(sql, post.id, "test_ok", { meta: { container_status: "FINISHED" } });
      }
    } else if (post.platform === "fb" && post.remote_id && post.mode === "live") {
      const s = await graph(env, "GET", `/${post.remote_id}`, { fields: "status" });
      const st = s.status?.video_status;
      if (st === "ready") await setPost(sql, post.id, "published");
      else if (st === "error") await setPost(sql, post.id, "failed", { error: "Facebook: فشل معالجة الفيديو" });
    }
  } catch (e) { await setPost(sql, post.id, "failed", { error: String(e.message).slice(0, 300) }); }
  return (await sql`select * from posts where id=${post.id}`)[0];
}

export async function handlePublish(p, sql, body, env, me) {
  if (!p.startsWith("/api/publish/")) return null;
  if (!me) return j({ error: "auth" }, 401);
  const cfg = { fb: !!(env.META_PAGE_TOKEN && env.META_PAGE_ID), ig: !!(env.META_PAGE_TOKEN && env.META_IG_USER_ID) };
  if (p === "/api/publish/state") {
    let posts = await sql`select id,group_id,platform,mode,status,error,remote_id,caption,created_at::text created_at from posts order by created_at desc limit 40`;
    return j({ live: await liveOn(sql), configured: cfg, posts });
  }
  if (p === "/api/publish/create") {
    const mode = body.mode === "live" ? "live" : "test";
    if (mode === "live" && !(await liveOn(sql))) return j({ error: "live_disabled" }, 403);
    const url = driveDirect(String(body.video_url || "").trim());
    const caps = body.captions || {}, base = String(body.caption || "").trim().slice(0, 2200);
    if (!okUrl(url)) return j({ error: "bad_url" }, 400);
    const plats = (Array.isArray(body.platforms) ? body.platforms : []).filter(x => x === "fb" || x === "ig");
    if (!plats.length) return j({ error: "no_platform" }, 400);
    if (!base && !plats.every(x => String(caps[x] || "").trim())) return j({ error: "no_caption" }, 400);
    const gid = crypto.randomUUID(), out = [];
    for (const pl of plats) {
      const caption = String(caps[pl] || "").trim().slice(0, 2200) || base;
      const row = (await sql`insert into posts(group_id,user_id,platform,mode,status,video_url,caption) values(${gid},${me.id},${pl},${mode},'queued',${url},${caption}) returning *`)[0];
      try {
        if (!cfg[pl]) throw new Error(`${PLAT[pl]}: الربط مش مكتمل`);
        if (pl === "fb") await startFb(sql, env, row, mode === "live"); else await startIg(sql, env, row, mode === "live");
      } catch (e) { await setPost(sql, row.id, "failed", { error: String(e.message).slice(0, 300) }); }
      out.push((await sql`select id,platform,mode,status,error from posts where id=${row.id}`)[0]);
    }
    return j({ ok: 1, group_id: gid, posts: out });
  }
  if (p === "/api/publish/refresh") {
    const rows = await sql`select * from posts where group_id=${String(body.group_id || "")} or id::text=${String(body.id || "")}`;
    const out = []; for (const r of rows) { const n = await advance(sql, env, r); out.push({ id: n.id, platform: n.platform, mode: n.mode, status: n.status, error: n.error }); }
    return j({ ok: 1, posts: out });
  }
  return j({ error: "not_found" }, 404);
}

export async function advanceAll(sql, env) { for (const r of await sql`select * from posts where status='processing' and updated_at > now() - interval '2 days' order by updated_at limit 20`) await advance(sql, env, r); }
