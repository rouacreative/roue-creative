import http from "http";import fs from "fs";import path from "path";
import pp from "/tmp/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js";const puppeteer=pp.default||pp;
import w from "./src/index.js";import {neon} from "@neondatabase/serverless";
const env={DATABASE_URL:process.env.DATABASE_URL},sql=neon(env.DATABASE_URL);
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hash(pw,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pw),"PBKDF2",false,["deriveBits"]);return salt+":"+hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},k,256))}
const root="/tmp/zwicky-demo/app";const types={".html":"text/html;charset=utf-8",".png":"image/png"};
const srv=http.createServer(async(req,res)=>{
 if(req.url.startsWith("/api")){const chunks=[];for await(const c of req)chunks.push(c);
  const r=await w.fetch(new Request("http://"+req.headers.host+req.url,{method:req.method,headers:req.headers,body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
  const h={};r.headers.forEach((v,k)=>h[k]=v);if(h["set-cookie"])h["set-cookie"]=h["set-cookie"].replace("Secure; ","");res.writeHead(r.status,h);res.end(await r.text());return}
 let p=req.url.split("?")[0];if(p=="/")p="/index.html";try{const f=fs.readFileSync(root+p);res.writeHead(200,{"content-type":types[path.extname(p)]||"text/plain"});res.end(f)}catch{res.writeHead(404);res.end()}}).listen(8799);
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",args:["--no-sandbox"]});
try{
 await sql`insert into users(name,email,password_hash,is_admin,must_change) values('عبدالله','admin@t.co',${await hash("adminpw","s1")},true,false)`;
 await sql`insert into users(name,email,password_hash,stage,must_change) values('منى','mona@t.co',${await hash("monapw","s2")},'idea',false),('كريم','karim@t.co',${await hash("karimpw","s3")},'design',false)`;
 const login=async(e,pw,shots)=>{const ctx=await b.createBrowserContext();const pg=await ctx.newPage();pg.on("pageerror",e=>console.log("PAGEERR",e.message));await pg.setViewport({width:390,height:800});await pg.goto("http://localhost:8799/");await pg.waitForSelector("#em");
  await pg.type("#em",e);await pg.type("#pw",pw);await pg.click(".login .btn");await pg.waitForSelector(".tabs",{timeout:6000}).catch(async e=>{console.log("TOAST",await pg.evaluate(()=>[...document.querySelectorAll(".toast")].map(x=>x.textContent).join("|")));throw e});return pg};
 // admin creates video through UI
 const ad=await login("admin@t.co","adminpw");
 await ad.evaluate(()=>{tab="board";R()});await ad.evaluate(()=>newVideo());await ad.waitForSelector("#f0");await ad.type("#f0","إعلان Zwicky (تجربة) <b>x</b>");await ad.click("#okb");await new Promise(r=>setTimeout(r,2500));
 console.log("xss check: injected <b> elements in page:",await ad.evaluate(()=>document.querySelectorAll("main b b").length));
 await ad.screenshot({path:"/downloads/e2e_admin_board.png"});
 const mo=await login("mona@t.co","monapw");await new Promise(r=>setTimeout(r,800));
 await mo.screenshot({path:"/downloads/e2e_member_home.png"});
 await mo.evaluate(()=>{tab="mine";R()});await mo.evaluate(()=>{const t=D.tasks.find(t=>t.who==me&&t.st!="done");return setSt(t.id,"done")});await new Promise(r=>setTimeout(r,2000));
 await mo.screenshot({path:"/downloads/e2e_member_done.png"});
 const rows=await sql`select stage,status,start_at::text s,due_at::text d from tasks order by stage`;console.log(JSON.stringify(rows));
 const bad=await login("karim@t.co","wrong").catch(()=>"login failed as expected");console.log(typeof bad=="string"?bad:"UNEXPECTED login");
}catch(e){console.log("ERR",e.message.slice(0,200))}finally{await b.close();srv.close();await sql`delete from sessions`;await sql`delete from tasks`;await sql`delete from videos`;await sql`delete from users`;console.log("cleaned");process.exit(0)}
