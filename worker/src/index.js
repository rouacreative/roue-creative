// Zwicky team API: Cloudflare Worker + Neon (Postgres over HTTP).
// Secrets/vars: DATABASE_URL (secret), VAPID_PRIVATE_JWK (secret), VAPID_PUBLIC (var), VAPID_SUBJECT (var).
import { neon } from "@neondatabase/serverless";
import { handlePublic, handleAdmin } from "./site.js";
import { handlePublish, advanceAll } from "./publish.js";

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...h } });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;
const okDT = v => v == null || v === "" || DT.test(v);
const eq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const genPw = () => { const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return [...crypto.getRandomValues(new Uint8Array(12))].map(x => c[x % c.length]).join(""); };
const DEFAULTS = { platform_name: "ROUA", reminder_hours: 2, notify_assigned: true, notify_handoff: true, notify_deadline: true, notify_request: true };
async function getStages(sql) { return await sql`select id,name from stages order by position`; }
async function getSettings(sql) { const o = { ...DEFAULTS }; for (const r of await sql`select k,v from settings where k<>'site'`) { try { o[r.k] = JSON.parse(r.v); } catch (_) {} } return o; }

async function hash(pw, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256);
  return salt + ":" + hex(bits);
}
const sha = async t => hex(await crypto.subtle.digest("SHA-256", enc.encode(t)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

// ---- Web Push (VAPID). Payload-less push: the service worker fetches /api/inbox to get the text.
async function vapidJwt(aud, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const pay = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || "https://zwicky.abdullah-elmassry.workers.dev" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + pay));
  return head + "." + pay + "." + b64u(sig);
}
async function sendPush(sql, env, userId) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
  const subs = await sql`select endpoint from push_subscriptions where user_id=${userId}`;
  for (const s of subs) {
    try {
      const jwt = await vapidJwt(new URL(s.endpoint).origin, env);
      const r = await fetch(s.endpoint, { method: "POST", headers: { TTL: "3600", Urgency: "high", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, "Content-Length": "0" } });
      if (r.status === 404 || r.status === 410) await sql`delete from push_subscriptions where endpoint=${s.endpoint}`;
    } catch (_) {}
  }
}
async function notify(sql, env, userId, title, body, kind, url = "./") {
  if (!userId) return;
  if (kind && (await getSettings(sql))[kind] === false) return;
  if (!(await sql`select 1 from users where id=${userId} and active`).length) return;
  await sql`insert into notifications(user_id,title,body,url) values(${userId},${title},${body},${url})`;
  await sendPush(sql, env, userId);
}

async function notifyAdmins(sql, env, title, body, kind) { for (const a of await sql`select id from users where is_admin and active`) await notify(sql, env, a.id, title, body, kind, "./?tab=admin"); }

async function deadlineReminders(sql, env) {
  const hrs = Number((await getSettings(sql)).reminder_hours) || 2;
  const names = Object.fromEntries((await getStages(sql)).map(x => [x.id, x.name]));
  const rows = await sql`select t.id,t.assignee,t.stage,t.due_at::text due_at,v.title from tasks t join videos v on v.id=t.video_id
    where t.status<>'done' and t.assignee is not null and not t.deadline_notified and t.due_at is not null
    and t.due_at <= (now() at time zone 'Africa/Cairo') + make_interval(hours => ${hrs})`;
  for (const r of rows) {
    await sql`update tasks set deadline_notified=true where id=${r.id}`;
    await notify(sql, env, r.assignee, "قرب موعد التسليم", `${r.title} · ${names[r.stage] || ""} · ${r.due_at.slice(0, 16)}`, "notify_deadline");
  }
}

export default {
  async scheduled(event, env) { const sql = neon(env.DATABASE_URL); await deadlineReminders(sql, env); await sql`delete from notifications where created_at < now() - interval '30 days'`; await sql`delete from sessions where expires_at < now()`; await sql`delete from login_attempts where at < now() - interval '1 day'`; try { if (env.META_PAGE_TOKEN) await advanceAll(sql, env); } catch (_) {} },

  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (!p.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("not found", { status: 404 });
    if (!env.DATABASE_URL) return json({ error: "not_configured" }, 503);
    const sql = neon(env.DATABASE_URL);
    if (p === "/api/push/key") return json({ key: env.VAPID_PUBLIC || "" });
    const cookie = (req.headers.get("cookie") || "").match(/zs=([a-f0-9]+)/)?.[1];
    let me = null;
    if (cookie) {
      const r = await sql`select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=${await sha(cookie)} and s.expires_at>now() and u.active`;
      me = r[0] || null;
    }
    if (req.method !== "GET") { const o = req.headers.get("origin"); if (o && new URL(o).host !== url.host) return json({ error: "origin" }, 403); }
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));

    { const r = await handlePublic(req, url, p, sql, body, env, (t, b, k) => notifyAdmins(sql, env, t, b, k)); if (r) return r; }

    if (p === "/api/login" && req.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254), ip = req.headers.get("cf-connecting-ip") || "?";
      const n = (await sql`select count(*)::int c from login_attempts where at > now() - interval '15 minutes' and (k=${"e:" + email} or k=${"i:" + ip})`)[0].c;
      if (n >= 10) return json({ error: "too_many" }, 429);
      const u = (await sql`select * from users where email=${email}`)[0];
      const salt = u ? u.password_hash.split(":")[0] : "0000000000000000";
      const good = (await hash(String(body.password || "").slice(0, 200), salt));
      if (!u || !u.active || !eq(good, u.password_hash)) { await sql`insert into login_attempts(k) values(${"e:" + email}),(${"i:" + ip})`; return json({ error: "bad_login" }, 401); }
      const t = newToken();
      await sql`delete from sessions where expires_at < now()`;
      await sql`insert into sessions(token_hash,user_id,expires_at) values(${await sha(t)},${u.id},now()+interval '30 days')`;
      return json({ ok: 1 }, 200, { "set-cookie": `zs=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` });
    }
    if (p === "/api/setup" && req.method === "POST") {
      // first-time password: only for accounts the admin added that nobody has claimed yet; every failure gives the same answer
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254), ip = req.headers.get("cf-connecting-ip") || "?", np = String(body.password || "");
      const n = (await sql`select count(*)::int c from login_attempts where at > now() - interval '15 minutes' and (k=${"s:" + email} or k=${"s:" + ip})`)[0].c;
      if (n >= 8) return json({ error: "too_many" }, 429);
      if (np.length < 8 || np.length > 200) return json({ error: "weak" }, 400);
      await sql`insert into login_attempts(k) values(${"s:" + email}),(${"s:" + ip})`;
      const open = (await sql`select v from settings where k='setup_open'`)[0];
      if (open && open.v === "false") return json({ error: "setup_fail" }, 403);
      const r = await sql`update users set password_hash=${await hash(np, newToken().slice(0, 16))}, must_change=false, claimable=false where email=${email} and claimable and must_change and active returning id`;
      if (!r.length) return json({ error: "setup_fail" }, 403);
      const t = newToken();
      await sql`delete from sessions where user_id=${r[0].id}`;
      await sql`insert into sessions(token_hash,user_id,expires_at) values(${await sha(t)},${r[0].id},now()+interval '30 days')`;
      return json({ ok: 1 }, 200, { "set-cookie": `zs=${t}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` });
    }
    if (!me) return json({ error: "auth" }, 401);
    { const r = await handlePublish(p, sql, body, env, me); if (r) return r; }
    if (p === "/api/logout") { await sql`delete from sessions where token_hash=${await sha(cookie)}`; return json({ ok: 1 }, 200, { "set-cookie": "zs=; Max-Age=0; Path=/" }); }

    if (p === "/api/password" && req.method === "POST") {
      const np = String(body.new || "");
      if (np.length < 8 || np.length > 200) return json({ error: "weak" }, 400);
      if (!eq(await hash(String(body.current || ""), me.password_hash.split(":")[0]), me.password_hash)) return json({ error: "bad_current" }, 403);
      await sql`update users set password_hash=${await hash(np, newToken().slice(0, 16))}, must_change=false, claimable=false where id=${me.id}`;
      await sql`delete from sessions where user_id=${me.id} and token_hash<>${await sha(cookie)}`;
      return json({ ok: 1 });
    }
    if (p === "/api/state" && req.method === "GET") {
      const [users, videos, tasks, stages, settings] = await Promise.all([
        sql`select id,name,email,stage,is_admin,active from users order by is_admin desc, created_at`,
        sql`select id,title from videos order by created_at`,
        sql`select id,video_id,stage,assignee,start_at::text as start_at,due_at::text as due_at,completed_at::text as completed_at,status,note,rating,rating_note from tasks`, getStages(sql), getSettings(sql)]);
      // ratings are private: a member sees them only on their own tasks
      const out = me.is_admin ? tasks : tasks.map(t => t.assignee === me.id ? t : { ...t, rating: null, rating_note: null });
      return json({ me: me.id, must_change: !!me.must_change, users, videos, tasks: out, stages, settings });
    }
    if (p === "/api/inbox") {
      const items = await sql`select id,title,body,url from notifications where user_id=${me.id} and read=false order by created_at limit 5`;
      if (url.searchParams.get("mark")) await sql`update notifications set read=true where user_id=${me.id} and read=false`;
      return json({ items });
    }
    if (p === "/api/push/subscribe" && req.method === "POST") {
      if (!body.endpoint) return json({ error: "bad" }, 400);
      await sql`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values(${body.endpoint},${me.id},${body.keys?.p256dh || null},${body.keys?.auth || null})
        on conflict (endpoint) do update set user_id=${me.id}`;
      return json({ ok: 1 });
    }
    if (p === "/api/push/unsubscribe" && req.method === "POST") { await sql`delete from push_subscriptions where endpoint=${body.endpoint} and user_id=${me.id}`; return json({ ok: 1 }); }

    // member: update status only on own task. Done = handoff: notify the next stage's assignee.
    if (p === "/api/task/status" && req.method === "POST") {
      if (!["todo", "doing", "done"].includes(body.status)) return json({ error: "bad" }, 400);
      const r = me.is_admin
        ? await sql`update tasks set status=${body.status}, completed_at=case when ${body.status}='done' then (now() at time zone 'Africa/Cairo') else null end where id=${body.id} returning id,video_id,stage`
        : await sql`update tasks set status=${body.status}, completed_at=case when ${body.status}='done' then (now() at time zone 'Africa/Cairo') else null end where id=${body.id} and assignee=${me.id} returning id,video_id,stage`;
      if (!r.length) return json({ error: "forbidden" }, 403);
      if (body.status === "done") {
        const stg = await getStages(sql), idx = stg.findIndex(x => x.id === r[0].stage), next = stg[idx + 1];
        if (next) {
          const n = (await sql`select t.assignee,v.title from tasks t join videos v on v.id=t.video_id where t.video_id=${r[0].video_id} and t.stage=${next.id}`)[0];
          if (n) await notify(sql, env, n.assignee, "تسليم جاهز للاستلام", `${n.title} · ${stg[idx].name} خلّص، دورك: ${next.name}`, "notify_handoff");
        }
      }
      return json({ ok: 1 });
    }
    // everything below: admin only
    if (!me.is_admin) return json({ error: "forbidden" }, 403);
    if (p.startsWith("/api/admin/")) return handleAdmin(req, url, p, sql, body, env);
    if (!okDT(body.start) || !okDT(body.due)) return json({ error: "bad_time" }, 400);
    if (p === "/api/task/update") {
      const old = (await sql`select assignee,due_at::text d from tasks where id=${body.id}`)[0];
      await sql`update tasks set assignee=${body.assignee || null}, start_at=${body.start || null}, due_at=${body.due || null}, note=${body.note || null},
        deadline_notified=case when due_at is distinct from ${body.due || null}::timestamp then false else deadline_notified end where id=${body.id}`;
      if (body.assignee && old && old.assignee !== body.assignee) {
        const v = (await sql`select v.title,t.stage from tasks t join videos v on v.id=t.video_id where t.id=${body.id}`)[0];
        const sn = (await sql`select name from stages where id=${v.stage}`)[0]?.name || "";
        await notify(sql, env, body.assignee, "مهمة جديدة عليك", `${v.title} · ${sn}`, "notify_assigned");
      }
      return json({ ok: 1 });
    }
    if (p === "/api/task/rate") {
      const r = body.rating == null ? null : Math.round(Number(body.rating));
      if (r !== null && !(r >= 1 && r <= 5)) return json({ error: "bad" }, 400);
      const u = await sql`update tasks set rating=${r}, rating_note=${body.note || null} where id=${body.id} and status='done' returning id`;
      return u.length ? json({ ok: 1 }) : json({ error: "only_done_tasks" }, 400);
    }
    if (p === "/api/video") {
      const title = String(body.title || "").trim().slice(0, 120);
      if (!title) return json({ error: "bad_title" }, 400);
      const vid = crypto.randomUUID();
      const stg = await getStages(sql), lead = {};
      for (const st of stg) lead[st.id] = (await sql`select id from users where stage=${st.id} and active order by created_at limit 1`)[0]?.id || null;
      await sql.transaction([
        sql`insert into videos(id,title) values(${vid},${title})`,
        ...stg.map(st => sql`insert into tasks(video_id,stage,assignee) values(${vid},${st.id},${lead[st.id]})`)]);
      for (const st of stg) if (lead[st.id]) await notify(sql, env, lead[st.id], "مهمة جديدة عليك", `${title} · ${st.name}`, "notify_assigned");
      return json({ id: vid });
    }
    if (p === "/api/video/delete") { await sql`delete from videos where id=${body.id}`; return json({ ok: 1 }); }
    if (p === "/api/user") {
      const name = String(body.name || "").trim().slice(0, 60), email = String(body.email || "").trim().toLowerCase();
      if (!name || !EMAIL.test(email)) return json({ error: "bad_input" }, 400);
      if (body.stage && !(await sql`select 1 from stages where id=${body.stage}`).length) return json({ error: "bad_stage" }, 400);
      if ((await sql`select 1 from users where email=${email}`).length) return json({ error: "exists" }, 409);
      const pw = genPw();
      await sql`insert into users(name,email,password_hash,stage,must_change,claimable) values(${name},${email},${await hash(pw, newToken().slice(0, 16))},${body.stage || null},true,true)`;
      return json({ ok: 1, initial_password: pw }); // shown once to the admin; the user must change it at first login
    }
    if (p === "/api/user/update") {
      if (body.stage && !(await sql`select 1 from stages where id=${body.stage}`).length) return json({ error: "bad_stage" }, 400);
      const name = String(body.name || "").trim().slice(0, 60);
      await sql`update users set name=coalesce(nullif(${name},''),name), stage=${body.stage || null} where id=${body.id}`; return json({ ok: 1 });
    }
    if (p === "/api/user/reset") {
      const pw = genPw();
      await sql`update users set password_hash=${await hash(pw, newToken().slice(0, 16))}, must_change=true where id=${body.id}`;
      await sql`delete from sessions where user_id=${body.id}`;
      return json({ ok: 1, initial_password: pw });
    }
    if (p === "/api/video/rename") { const t = String(body.title || "").trim().slice(0, 120); if (!t) return json({ error: "bad_title" }, 400); await sql`update videos set title=${t} where id=${body.id}`; return json({ ok: 1 }); }
    if (p === "/api/user/active") {
      if (body.id === me.id) return json({ error: "self" }, 400);
      await sql`update users set active=${!!body.active} where id=${body.id}`;
      if (!body.active) { await sql`delete from sessions where user_id=${body.id}`; await sql`delete from push_subscriptions where user_id=${body.id}`; }
      return json({ ok: 1 });
    }
    if (p === "/api/user/delete") {
      if (body.id === me.id) return json({ error: "self" }, 400);
      const t = (await sql`select is_admin from users where id=${body.id}`)[0];
      if (t && t.is_admin && (await sql`select count(*)::int c from users where is_admin and active and id<>${body.id}`)[0].c < 1) return json({ error: "last_admin" }, 400);
      await sql`delete from users where id=${body.id}`; return json({ ok: 1 });
    }
    if (p === "/api/user/admin") {
      if (!body.admin && (await sql`select count(*)::int c from users where is_admin and active and id<>${body.id}`)[0].c < 1) return json({ error: "last_admin" }, 400);
      await sql`update users set is_admin=${!!body.admin} where id=${body.id}`; return json({ ok: 1 });
    }
    if (p === "/api/stage/add") {
      const name = String(body.name || "").trim().slice(0, 60); if (!name) return json({ error: "bad_name" }, 400);
      const id = "s" + newToken().slice(0, 8), pos = (await sql`select coalesce(max(position),0)+1 n from stages`)[0].n;
      await sql.transaction([sql`insert into stages(id,name,position) values(${id},${name},${pos})`, sql`insert into tasks(video_id,stage) select id,${id} from videos`]);
      return json({ id });
    }
    if (p === "/api/stage/rename") { const name = String(body.name || "").trim().slice(0, 60); if (!name) return json({ error: "bad_name" }, 400); await sql`update stages set name=${name} where id=${body.id}`; return json({ ok: 1 }); }
    if (p === "/api/stage/move") {
      const st = await sql`select id,position from stages order by position`, i = st.findIndex(x => x.id === body.id), j = i + (body.dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= st.length) return json({ ok: 1 });
      await sql.transaction([sql`update stages set position=${st[j].position} where id=${st[i].id}`, sql`update stages set position=${st[i].position} where id=${st[j].id}`]);
      return json({ ok: 1 });
    }
    if (p === "/api/stage/delete") {
      if ((await sql`select count(*)::int c from stages`)[0].c <= 1) return json({ error: "last_stage" }, 400);
      await sql.transaction([sql`delete from tasks where stage=${body.id}`, sql`delete from stages where id=${body.id}`, sql`update users set stage=null where stage=${body.id}`]); return json({ ok: 1 });
    }
    if (p === "/api/settings") {
      const allow = { platform_name: v => String(v).trim().slice(0, 40) || "ROUA", reminder_hours: v => Math.min(24, Math.max(1, Math.round(Number(v)) || 2)), notify_assigned: v => !!v, notify_handoff: v => !!v, notify_deadline: v => !!v, setup_open: v => !!v, publish_live: v => !!v };
      for (const k of Object.keys(allow)) if (k in body) await sql`insert into settings(k,v) values(${k},${JSON.stringify(allow[k](body[k]))}) on conflict (k) do update set v=excluded.v`;
      return json({ ok: 1 });
    }
    if (p === "/api/notify/test") { await notify(sql, env, me.id, "إشعار تجريبي", "الإشعارات شغالة على جهازك"); return json({ ok: 1 }); }
    return json({ error: "not_found" }, 404);
  },
};
