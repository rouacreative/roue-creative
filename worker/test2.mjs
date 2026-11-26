import http from "http";import crypto from "crypto";import fs from "fs";
import w from "./src/index.js";import {neon} from "@neondatabase/serverless";
const jwk=fs.readFileSync("/downloads/vapid_private.jwk.json","utf8"),pub=fs.readFileSync("/downloads/vapid_public.txt","utf8");
const env={DATABASE_URL:process.env.DATABASE_URL,VAPID_PRIVATE_JWK:jwk,VAPID_PUBLIC:pub};const sql=neon(env.DATABASE_URL);
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return salt+":"+hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
const call=async(p,body,ck)=>{const r=await w.fetch(new Request("https://x"+p,{method:body?"POST":"GET",headers:{cookie:ck||"","content-type":"application/json"},body:body?JSON.stringify(body):undefined}),env);return{s:r.status,j:await r.json(),c:r.headers.get("set-cookie")}};
const ok=(n,c)=>console.log(c?"PASS":"FAIL",n);
const got=[];const srv=http.createServer((q,r)=>{got.push({url:q.url,auth:q.headers.authorization,ttl:q.headers.ttl});r.writeHead(201);r.end()}).listen(8801);
const pk=crypto.createPublicKey({key:JSON.parse(jwk),format:"jwk"});
try{
await sql`insert into users(name,email,password_hash,is_admin) values('Admin','a@t.co',${await hash("adminpw","s1")},true)`;
const a=await call("/api/login",{email:"a@t.co",password:"adminpw"});const ac=a.c.split(";")[0];
const m1=await call("/api/user",{name:"Mona",email:"m@t.co",stage:"idea"},ac),m2=await call("/api/user",{name:"Karim",email:"k@t.co",stage:"design"},ac);
const l1=await call("/api/login",{email:"m@t.co",password:m1.j.initial_password}),mc=l1.c.split(";")[0];
const l2=await call("/api/login",{email:"k@t.co",password:m2.j.initial_password}),kc=l2.c.split(";")[0];
ok("push key public",(await call("/api/push/key")).j.key==pub);
ok("subscribe Karim",(await call("/api/push/subscribe",{endpoint:"http://localhost:8801/push/abc",keys:{p256dh:"x",auth:"y"}},kc)).s==200);
const v=await call("/api/video",{title:"Test"},ac);
let st=(await call("/api/state",null,mc)).j;const tI=st.tasks.find(t=>t.stage=="idea"),tD=st.tasks.find(t=>t.stage=="design");
ok("Mona got 'new task' inbox",(await sql`select count(*)::int c from notifications where user_id=${st.me} and title='مهمة جديدة عليك'`)[0].c==1);
ok("Karim got push on new video",got.length==1);
// verify VAPID signature
const [h,p,sg]=got[0].auth.match(/t=([^,]+)/)[1].split(".");
const valid=crypto.verify("sha256",enc.encode(h+"."+p),{key:pk,dsaEncoding:"ieee-p1363"},Buffer.from(sg,"base64url"));
ok("VAPID JWT signature verifies + k=public",valid&&got[0].auth.includes("k="+pub)&&JSON.parse(Buffer.from(p,"base64url")).aud=="http://localhost:8801");
// handoff
got.length=0;await call("/api/task/status",{id:tI.id,status:"done"},mc);
const inbox=(await call("/api/inbox?mark=1",null,kc)).j.items;
ok("handoff notification to Karim + push",inbox.some(i=>i.title=="تسليم جاهز للاستلام")&&got.length==1);
ok("inbox cleared after mark",(await call("/api/inbox",null,kc)).j.items.length==0);
// deadline reminder
await call("/api/task/update",{id:tD.id,assignee:tD.assignee,start:null,due:"2020-01-01T10:00"},ac);
const {default:_}=await import("./src/index.js");await w.scheduled({},env);
ok("deadline reminder sent once",(await sql`select count(*)::int c from notifications where title='قرب موعد التسليم'`)[0].c==1);
await w.scheduled({},env);ok("not repeated",(await sql`select count(*)::int c from notifications where title='قرب موعد التسليم'`)[0].c==1);
// ratings
ok("rate only done: open task refused",(await call("/api/task/rate",{id:tD.id,rating:4},ac)).s==400);
ok("admin rates done task",(await call("/api/task/rate",{id:tI.id,rating:4},ac)).s==200);
ok("member cannot rate",(await call("/api/task/rate",{id:tI.id,rating:5},mc)).s==403);
ok("bad rating refused",(await call("/api/task/rate",{id:tI.id,rating:9},ac)).s==400);
const ms=(await call("/api/state",null,mc)).j,ks=(await call("/api/state",null,kc)).j,as=(await call("/api/state",null,ac)).j;
const mt=ms.tasks.find(t=>t.id==tI.id);
ok("completed_at stored",!!mt.completed_at);
ok("Mona sees own rating",mt.rating==4);ok("Karim does not see Mona's rating",ks.tasks.find(t=>t.id==tI.id).rating==null);ok("admin sees rating",as.tasks.find(t=>t.id==tI.id).rating==4);
}catch(e){console.log("ERR",e.message)}finally{srv.close();await sql`delete from notifications`;await sql`delete from push_subscriptions`;await sql`delete from sessions`;await sql`delete from tasks`;await sql`delete from videos`;await sql`delete from users`;console.log("cleaned");process.exit(0)}
