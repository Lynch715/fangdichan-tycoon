export function offlineWorker(version:string, urls:string[]):string {
  return `
const PREFIX='fdc-'+encodeURIComponent(self.registration.scope)+'-';
const CACHE=PREFIX+${JSON.stringify(version)};
const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    // 所有导航使用同一代缓存壳，防止新 HTML 引用尚未激活的新资源。
    if(event.request.mode==='navigate'){const shell=await cache.match('./index.html');if(shell)return shell;}
    const hit=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});
    if(hit)return hit;
    try{return await fetch(event.request);}catch(error){
      if(event.request.mode==='navigate'){const shell=await cache.match('./index.html');if(shell)return shell;}
      return Response.error();
    }
  }));
});
`;
}
