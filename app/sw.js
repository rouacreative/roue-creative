// ROUA service worker: offline shell + web push (payload-less push, content fetched from the API)
const CACHE="zwicky-shell-v1",SHELL=["./","site-admin.js","assets/logo.png","assets/icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!="GET"||u.pathname.includes("/api/"))return;
 e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
self.addEventListener("push",e=>{e.waitUntil((async()=>{
 let items=[];try{const r=await fetch("/api/inbox?mark=1",{credentials:"include"});if(r.ok)items=(await r.json()).items||[]}catch(_){}
 if(!items.length)items=[{title:"ROUA",body:"عندك تحديث جديد",url:"./"}];
 for(const n of items)await self.registration.showNotification(n.title,{body:n.body,icon:"assets/icon-192.png",badge:"assets/icon-192.png",dir:"rtl",lang:"ar",data:{url:n.url||"./"},tag:n.id||undefined})})())});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=new URL(e.notification.data.url||"./",self.registration.scope).href;
 e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if("focus"in c)return c.focus()}return self.clients.openWindow(url)}))});
