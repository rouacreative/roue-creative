import w from "./src/index.js";
import { neon } from "@neondatabase/serverless";
const env={DATABASE_URL:process.env.DATABASE_URL};const sql=neon(env.DATABASE_URL);
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return salt+":"+hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
const call=async(p,body,ck)=>{const r=await w.fetch(new Request("https://x"+p,{method:body?"POST":"GET",headers:{cookie:ck||"","content-type":"application/json"},body:body?JSON.stringify(body):undefined}),env);return{s:r.status,j:await r.json(),c:r.headers.get("set-cookie")}};
const ok=(n,c)=>console.log(c?"PASS":"FAIL",n);
try{
await sql`insert into users(name,email,password_hash,is_admin) values('Admin','a@t.co',${await hash("adminpw","s1")},true)`;
ok("bad login 401",(await call("/api/login",{email:"a@t.co",password:"no"})).s==401);
const a=await call("/api/login",{email:"a@t.co",password:"adminpw"});ok("admin login",a.s==200);const ac=a.c.split(";")[0];
ok("no cookie 401",(await call("/api/state")).s==401);
const nu=await call("/api/user",{name:"Mona",email:"m@t.co",stage:"idea"},ac);ok("create user",nu.s==200&&nu.j.initial_password);
const nu2=await call("/api/user",{name:"Karim",email:"k@t.co",stage:"design"},ac);
const v=await call("/api/video",{title:"Test"},ac);ok("create video",v.s==200);
const m=await call("/api/login",{email:"m@t.co",password:nu.j.initial_password});ok("member login",m.s==200);const mc=m.c.split(";")[0];
let st=(await call("/api/state",null,mc)).j;ok("state: 2 users+admin,5 tasks",st.users.length==3&&st.tasks.length==5);
const mine=st.tasks.find(t=>t.stage=="idea"),other=st.tasks.find(t=>t.stage=="design");
ok("auto-assigned idea to Mona",mine.assignee==st.me);
ok("member updates own status",(await call("/api/task/status",{id:mine.id,status:"done"},mc)).s==200);
ok("member blocked on others",(await call("/api/task/status",{id:other.id,status:"done"},mc)).s==403);
ok("member blocked from admin api",(await call("/api/video",{title:"x"},mc)).s==403);
ok("admin assigns",(await call("/api/task/update",{id:other.id,assignee:st.me,due:"2026-12-01"},ac)).s==200);
ok("logout",(await call("/api/logout",{},mc)).s==200);ok("after logout 401",(await call("/api/state",null,mc)).s==401);
}finally{await sql`delete from sessions`;await sql`delete from tasks`;await sql`delete from videos`;await sql`delete from users`;console.log("cleaned")}
