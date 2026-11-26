import http from "http";import fs from "fs";import path from "path";
import pp from "/tmp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";const puppeteer=pp.default||pp;
import w from "./src/index.js";import {neon} from "@neondatabase/serverless";
const env={DATABASE_URL:process.env.DATABASE_URL},sql=neon(env.DATABASE_URL);
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return salt+":"+hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
const root="/tmp/zwicky-demo";const types={".html":"text/html;charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".js":"text/javascript",".css":"text/css",".webmanifest":"application/json"};
const srv=http.createServer(async(req,res)=>{
 if(req.url.startsWith("/api")){const chunks=[];for await(const c of req)chunks.push(c);
  const r=await w.fetch(new Request("http://"+req.headers.host+req.url,{method:req.method,headers:req.headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
  const h={};r.headers.forEach((v,k)=>h[k]=v);if(h["set-cookie"])h["set-cookie"]=h["set-cookie"].replace("Secure; ","");res.writeHead(r.status,h);res.end(Buffer.from(await r.arrayBuffer()));return}
 let p=decodeURIComponent(req.url.split("?")[0]);if(p=="/app/"||p=="/app")p="/app/index.html";if(p=="/")p="/index.html";try{const f=fs.readFileSync(root+p);res.writeHead(200,{"content-type":types[path.extname(p)]||"text/plain"});res.end(f)}catch{res.writeHead(404);res.end()}}).listen(8799);
const B="http://localhost:8799";let fails=0;const ok=(n,c)=>{console.log(c?"PASS":"FAIL",n);if(!c)fails++};
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await sql`delete from users where email like '%@cms.test'`;
 await sql`insert into users(name,email,password_hash,is_admin,must_change) values('عبدالله (تجربة)','admin@cms.test',${await hash("adminpw","s1")},true,false),('منى','mona@cms.test',${await hash("monapw","s2")},false,false)`;
 const ctx=await b.createBrowserContext();const pg=await ctx.newPage();pg.on("pageerror",e=>console.log("PAGEERR",e.message));await pg.setViewport({width:390,height:844,deviceScaleFactor:2});
 await pg.goto(B+"/app/");await pg.type("#em","admin@cms.test");await pg.type("#pw","adminpw");await pg.click(".login .btn");await pg.waitForSelector(".tabs");
 const call=(p,body)=>pg.evaluate(async(p,body)=>{const r=await fetch("/api"+p,{method:body?"POST":"GET",headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined});return {s:r.status,j:await r.json().catch(()=>null)}},p,body);
 // permissions
 const mo=await (await b.createBrowserContext()).newPage();await mo.goto(B+"/app/");
 const ml=await mo.evaluate(async()=>(await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"mona@cms.test",password:"monapw"})})).status);
 const mcall=(p,body)=>mo.evaluate(async(p,body)=>(await fetch("/api"+p,{method:body?"POST":"GET",headers:{"content-type":"application/json"},body:body?JSON.stringify(body):undefined})).status,p,body);
 ok("member login",ml==200);ok("member cannot read admin site",await mcall("/admin/site")==403);ok("member cannot save item",await mcall("/admin/item",{kind:"work",title:"x"})==403);
 ok("anon cannot admin",(await b.newPage().then(p=>p.goto(B+"/app/").then(()=>p.evaluate(async()=>(await fetch("/api/admin/site")).status))))==401);
 // public before anything
 let s=await call("/site");ok("public site api works for anyone (admin session)",s.s==200&&s.j.items.length==0);
 const anon=await (await b.createBrowserContext()).newPage();await anon.goto(B+"/app/");ok("public /api/site without login",await anon.evaluate(async()=>(await fetch("/api/site")).status)==200);
 // seed + items
 for(const k of ["work","series","package","member"]) {const r=await call("/admin/site/seed",{kind:k});ok("seed "+k,r.s==200)}
 ok("seed twice refused",(await call("/admin/site/seed",{kind:"work"})).s==409);
 // media upload: use a real jpg from repo, plus bad file
 const jpg=fs.readFileSync(root+"/assets/img/falcon.jpg").toString("base64");
 const up=await call("/admin/media",{name:"falcon",b64:jpg});ok("upload jpg",up.s==200&&/^m:/.test(up.j.id));
 ok("reject non-image",(await call("/admin/media",{name:"x",b64:Buffer.from("<svg onload=alert(1)>").toString("base64")})).s==400);
 ok("reject oversize",(await call("/admin/media",{name:"x",b64:"A".repeat(2200000)})).s==413);
 const mid=up.j.id;
 const mr=await anon.evaluate(async id=>{const r=await fetch("/api/media/"+id.slice(2));return [r.status,r.headers.get("content-type"),r.headers.get("x-content-type-options")]},mid);ok("media served publicly as image",mr[0]==200&&mr[1]=="image/jpeg"&&mr[2]=="nosniff");
 // series + episode + work with bad youtube
 const ser=await call("/admin/item",{kind:"series",title:"سلسلة <b>اختبار</b>",sub:"الموسم الأول · ٣ حلقات",cat:"أطفال",image:mid});ok("create series",ser.s==200);
 ok("bad youtube refused",(await call("/admin/item",{kind:"work",title:"x",yt:"https://evil.example/x"})).s==400);
 ok("bad image refused",(await call("/admin/item",{kind:"work",title:"x",image:"https://evil.example/x.png"})).s==400);
 const e1=await call("/admin/item",{kind:"episode",series:ser.j.id,title:"الحلقة الأولى",sub:"٥ دقائق",yt:"https://youtu.be/aqz-KE-bpKQ",image:mid});ok("episode",e1.s==200);
 await call("/admin/item",{kind:"episode",series:ser.j.id,title:"الحلقة الثانية",sub:"٦ دقائق"});
 ok("episode needs series",(await call("/admin/item",{kind:"episode",series:"00000000-0000-0000-0000-000000000000",title:"x"})).s==400);
 await call("/admin/item",{kind:"work",title:"عمل جديد من الإدارة",sub:"إعلان · ٦٠ ثانية",cat:"إعلان",filter:"ads",image:mid,yt:"aqz-KE-bpKQ"});
 ok("media in use cannot be deleted",(await call("/admin/media/delete",{id:mid})).s==409);
 // theme/text/links
 ok("bad color refused",(await call("/admin/site/save",{theme:{accent:"red"}})).s==400);
 ok("bad link refused",(await call("/admin/site/save",{links:{youtube:"javascript:alert(1)"}})).s==400);
 ok("save theme",(await call("/admin/site/save",{theme:{bg:"#f2f6fa",ink:"#1f2a44",accent:"#3b82a0",dark:"#14213d",card:"#ffffff",font:"Cairo"}})).s==200);
 ok("save texts",(await call("/admin/site/save",{texts:{hero_title:"قصتك تتحكي.\nوإحنا نصورها.",hero_tag:"استوديو Zwicky",cta_title:"<img src=x onerror=alert(1)>"}})).s==200);
 ok("save links",(await call("/admin/site/save",{links:{whatsapp:"201001234567",email:"hello@zwicky.test",youtube:"https://youtube.com/@zwicky"},hide_demo:true})).s==200);
 // public pages
 const shot=async(url,name,w=390)=>{const p=await (await b.createBrowserContext()).newPage();await p.setViewport({width:w,height:844,deviceScaleFactor:2});const errs=[];p.on("pageerror",e=>errs.push(e.message));p.on("dialog",d=>{errs.push("DIALOG "+d.message());d.dismiss()});await p.goto(B+url,{waitUntil:"networkidle0"});await sleep(600);await p.screenshot({path:"/downloads/"+name+".png",fullPage:name.includes("full")});return {p,errs}};
 let r=await shot("/index.html","pub_home_full");
 ok("home: hero text applied",await r.p.evaluate(()=>document.querySelector("h1").innerText.includes("قصتك تتحكي")));
 ok("home: theme accent applied",await r.p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()=="#3b82a0"));
 ok("home: text injection not executed",await r.p.evaluate(()=>!document.querySelector("img[src=x]"))&&!r.errs.length);
 ok("home: demo ribbon hidden",await r.p.evaluate(()=>getComputedStyle(document.querySelector(".demo-ribbon")).display=="none"));
 ok("home: whatsapp link",await r.p.evaluate(()=>document.querySelector('[data-cms-link=whatsapp]').href=="https://wa.me/201001234567"));
 ok("home: 3 works shown, newest content",await r.p.evaluate(()=>document.querySelectorAll(".cards .work").length==3));
 r=await shot("/series.html","pub_series");ok("series page renders title escaped",await r.p.evaluate(()=>document.body.innerText.includes("<b>اختبار</b>")&&!document.querySelector(".work-body b")));
 const sid=ser.j.id;
 r=await shot("/watch.html?id="+sid,"pub_watch");ok("watch: episodes listed",await r.p.evaluate(()=>document.querySelectorAll(".episode").length==2));
 await r.p.click(".player .cover");await sleep(500);ok("watch: iframe uses episode yt id",await r.p.evaluate(()=>(document.querySelector(".player iframe")||{}).src?.includes("aqz-KE-bpKQ")));
 r=await shot("/works.html","pub_works");r=await shot("/packages.html","pub_packages");r=await shot("/team.html","pub_team");
 // request form
 const rp=await (await b.createBrowserContext()).newPage();await rp.setViewport({width:390,height:844,deviceScaleFactor:2});await rp.goto(B+"/request.html",{waitUntil:"networkidle0"});await sleep(400);
 await rp.type("#name","عميل تجربة <i>x</i>");await rp.type("#phone","01000000000");await rp.type("#details","عايز إعلان");await rp.click("form.form button[type=submit]");await sleep(1500);
 const inbox=(await call("/admin/site")).j.inbox;ok("request stored in inbox",inbox.length==1&&inbox[0].data.name.includes("عميل"));
 await rp.screenshot({path:"/downloads/pub_request.png"});
 ok("honeypot ignored",(await anon.evaluate(async()=>(await fetch("/api/public/request",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"bot",phone:"1",hp:"x"})})).status))==200&&(await call("/admin/site")).j.inbox.length==1);
 ok("admin got push notification row",(await sql`select count(*)::int c from notifications n join users u on u.id=n.user_id where u.email='admin@cms.test' and n.title='طلب جديد من الموقع'`)[0].c==1);
 // admin UI screenshots
 await pg.reload({waitUntil:"networkidle0"});await pg.waitForSelector(".tabs");
 await sleep(800);ok("app picks up the saved theme",await pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--acc").trim())=="#3b82a0");
 await pg.evaluate(()=>{tab="admin";ADM="site";OPEN["s:in"]=true;OPEN["s:series"]=true;R()});await sleep(1200);await pg.screenshot({path:"/downloads/cms_inbox_series.png"});
 await pg.evaluate(()=>{OPEN["s:in"]=false;OPEN["s:series"]=false;OPEN["s:des"]=true;OPEN["s:lnk"]=false;R();scrollTo(0,0)});await sleep(500);await pg.screenshot({path:"/downloads/cms_design.png",fullPage:true});
 await pg.evaluate(()=>{OPEN["s:des"]=false;OPEN["s:txt"]=true;R();scrollTo(0,0)});await sleep(500);await pg.screenshot({path:"/downloads/cms_texts.png"});
 await pg.evaluate(()=>{OPEN["s:txt"]=false;OPEN["s:med"]=true;OPEN["s:work"]=true;R();scrollTo(0,0)});await sleep(800);await pg.screenshot({path:"/downloads/cms_media_works.png",fullPage:true});
 await pg.evaluate(()=>{OPEN["s:med"]=false;OPEN["s:work"]=false;R();editItem("series",SA.items.find(i=>i.kind=="series").id)});await sleep(500);await pg.screenshot({path:"/downloads/cms_edit_series.png"});
 await pg.evaluate(()=>{document.getElementById("ov").innerHTML="";editItem("package",SA.items.find(i=>i.kind=="package").id)});await sleep(300);await pg.screenshot({path:"/downloads/cms_edit_package.png"});
 // delete series cascades
 await call("/admin/item/delete",{id:sid});ok("series delete removes episodes",(await sql`select count(*)::int c from site_items where kind='episode'`)[0].c==0);
 // sync: static fallback if API fails
 const fb=await (await b.createBrowserContext()).newPage();await fb.setRequestInterception(true);fb.on("request",q=>q.url().includes("/api/site")?q.abort():q.continue());await fb.goto(B+"/index.html",{waitUntil:"networkidle0"});ok("static fallback when API is down",await fb.evaluate(()=>document.querySelector("h1").innerText.includes("خيالنا على الشاشة")));
}catch(e){console.log("ERR",e.stack.slice(0,400));fails++}finally{
 await b.close();srv.close();
 await sql`delete from site_items`;await sql`delete from media`;await sql`delete from inbox`;await sql`delete from settings where k='site'`;
 await sql`delete from notifications where user_id in (select id from users where email like '%@cms.test')`;await sql`delete from sessions where user_id in (select id from users where email like '%@cms.test')`;await sql`delete from users where email like '%@cms.test'`;await sql`delete from login_attempts`;
 console.log("fails:",fails,"| real users left:",(await sql`select count(*)::int c from users`)[0].c);process.exit(fails?1:0)}
