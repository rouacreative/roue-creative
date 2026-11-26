import w from "./src/index.js";import {neon} from "@neondatabase/serverless";
const env={DATABASE_URL:process.env.DATABASE_URL};const sql=neon(env.DATABASE_URL);
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return salt+":"+hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
const call=async(p,body,ck,hd)=>{const r=await w.fetch(new Request("https://x"+p,{method:body?"POST":"GET",headers:{cookie:ck||"","content-type":"application/json",...(hd||{})},body:body?JSON.stringify(body):undefined}),env);return{s:r.status,j:await r.json(),c:r.headers.get("set-cookie"),h:r.headers}};
const ok=(n,c)=>console.log(c?"PASS":"FAIL",n);
try{
await sql`insert into users(name,email,password_hash,is_admin,must_change) values('Admin','a@t.co',${await hash("adminpw1","s1")},true,false)`;
const a=await call("/api/login",{email:"a@t.co",password:"adminpw1"});const ac=a.c.split(";")[0];
ok("api headers no-store",a.h.get("cache-control")=="no-store");
ok("cross-origin POST refused",(await call("/api/user",{name:"x",email:"x@t.co"},ac,{origin:"https://evil.example"})).s==403);
const u1=await call("/api/user",{name:"Mona <script>alert(1)</script>",email:"m@t.co",stage:"idea"},ac);ok("create user",u1.s==200&&u1.j.initial_password.length==12);
ok("duplicate email 409",(await call("/api/user",{name:"x",email:"M@t.co"},ac)).s==409);
ok("bad email 400",(await call("/api/user",{name:"x",email:"nope"},ac)).s==400);
ok("bad stage 400",(await call("/api/user",{name:"x",email:"z@t.co",stage:"zzz"},ac)).s==400);
const l=await call("/api/login",{email:"m@t.co",password:u1.j.initial_password});const mc=l.c.split(";")[0];
ok("new user must_change",(await call("/api/state",null,mc)).j.must_change===true);
ok("weak new password refused",(await call("/api/password",{current:u1.j.initial_password,new:"short"},mc)).s==400);
ok("wrong current refused",(await call("/api/password",{current:"nope",new:"newpassword1"},mc)).s==403);
ok("password change",(await call("/api/password",{current:u1.j.initial_password,new:"newpassword1"},mc)).s==200);
ok("must_change cleared",(await call("/api/state",null,mc)).j.must_change===false);
ok("old password stops working",(await call("/api/login",{email:"m@t.co",password:u1.j.initial_password})).s==401);
// stages
const sa=await call("/api/stage/add",{name:"الجودة"},ac);ok("stage add",sa.s==200);
const v=await call("/api/video",{title:"<img src=x onerror=alert(1)>"},ac);
let st=(await call("/api/state",null,ac)).j;ok("6 stages, 6 tasks per video",st.stages.length==6&&st.tasks.length==6);
await call("/api/stage/move",{id:sa.j.id,dir:-1},ac);st=(await call("/api/state",null,ac)).j;ok("stage moved up",st.stages[4].id==sa.j.id);
await call("/api/stage/rename",{id:sa.j.id,name:"مراجعة الجودة"},ac);st=(await call("/api/state",null,ac)).j;ok("stage renamed",st.stages.find(s=>s.id==sa.j.id).name=="مراجعة الجودة");
await call("/api/video",{title:"V2"},ac);st=(await call("/api/state",null,ac)).j;ok("new video gets 6 tasks",st.tasks.length==12);
await call("/api/stage/delete",{id:sa.j.id},ac);st=(await call("/api/state",null,ac)).j;ok("stage delete removes its tasks",st.stages.length==5&&st.tasks.length==10);
ok("member blocked from stage admin",(await call("/api/stage/add",{name:"x"},mc)).s==403);
// settings + notification toggle
await call("/api/settings",{notify_assigned:false,reminder_hours:3,platform_name:"Zwicky"},ac);
let before=(await sql`select count(*)::int c from notifications`)[0].c;
await call("/api/video",{title:"V3"},ac);ok("toggle off: no assigned notification",(await sql`select count(*)::int c from notifications`)[0].c==before);
st=(await call("/api/state",null,ac)).j;ok("settings stored",st.settings.reminder_hours==3&&st.settings.notify_assigned===false);
await call("/api/settings",{notify_assigned:true},ac);
// disable / admin guard
const uid=st.users.find(u=>u.email=="m@t.co").id,aid=st.users.find(u=>u.email=="a@t.co").id;
ok("cannot disable self",(await call("/api/user/active",{id:aid,active:false},ac)).s==400);
ok("cannot remove last admin",(await call("/api/user/admin",{id:aid,admin:false},ac)).s==400);
await call("/api/user/active",{id:uid,active:false},ac);
ok("disabled user session dead",(await call("/api/state",null,mc)).s==401);
ok("disabled user cannot login",(await call("/api/login",{email:"m@t.co",password:"newpassword1"})).s==401);
await call("/api/user/active",{id:uid,active:true},ac);
const rs=await call("/api/user/reset",{id:uid},ac);ok("admin reset returns new password",rs.s==200&&(await call("/api/login",{email:"m@t.co",password:rs.j.initial_password})).s==200);
// rate limit
let last;for(let i=0;i<11;i++)last=await call("/api/login",{email:"brute@t.co",password:"x"+i});ok("brute force limited (429)",last.s==429);
}catch(e){console.log("ERR",e.message)}finally{for(const t of ["notifications","push_subscriptions","sessions","tasks","videos","users","login_attempts","settings"])await sql(`delete from ${t}`);console.log("cleaned");process.exit(0)}
