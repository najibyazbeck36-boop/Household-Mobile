const APP_VERSION='22';
const CACHE_PREFIX='household-mobile-v';
const CACHE_NAME=`${CACHE_PREFIX}${APP_VERSION}`;
const SHELL=['./','./index.html','./version.json','./manifest.webmanifest','./css/app.css','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./js/version.js','./js/update.js','./js/app.js','./js/api.js','./js/auth.js','./js/db.js','./js/sync.js','./js/models.js','./js/views.js'];
const SHELL_PATHS=new Set(SHELL.map(path=>new URL(path,self.location.href).pathname));

self.addEventListener('install',event=>event.waitUntil((async()=>{
  await caches.delete(CACHE_NAME);
  try{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload'})));
    await self.skipWaiting();
  }catch(error){
    await caches.delete(CACHE_NAME);
    throw error;
  }
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('message',event=>{
  if(event.data?.type==='GET_VERSION')event.ports?.[0]?.postMessage({type:'HOUSEHOLD_SW_VERSION',version:APP_VERSION,cache:CACHE_NAME});
  if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/version.json')){
    event.respondWith(fetch(new Request(event.request,{cache:'no-store'})).catch(()=>caches.open(CACHE_NAME).then(cache=>cache.match('./version.json'))));
    return;
  }
  if(event.request.mode==='navigate'||SHELL_PATHS.has(url.pathname)){
    event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
      const key=event.request.mode==='navigate'?'./index.html':event.request;
      return (await cache.match(key,{ignoreSearch:true}))||fetch(event.request);
    }));
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
