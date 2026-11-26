/* Zwicky: service worker بسيط للموقع العام (بيخلي الموقع قابل للتثبيت). مفيش تخزين مؤقت للمحتوى. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",()=>{});
