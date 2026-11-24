/* Cache public static files only. Never cache API, authenticated snapshots,
 * OAuth callbacks, forms, or patient-specific HTML. */
const CACHE='medicita-contigo-public-v3';
const BASE=new URL('./',self.location.href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([new URL('offline.html',BASE),new URL('offline.css',BASE)])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('medicita-contigo-public-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match(new URL('offline.html',BASE))));
    return;
  }
  const relative=url.pathname.slice(BASE.pathname.length);
  if(relative==='offline.css'){event.respondWith(fetch(request).catch(()=>caches.match(request)));return;}
  if(!/^(assets|icons)\//.test(relative)||url.search)return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}
    return response;
  }).catch(()=>caches.match(request)));
});
