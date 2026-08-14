import{syncStatus}from'./sync.js';
import{FRONTEND_VERSION,CLOUD_API_VERSION,CLOUD_DEPLOYMENT_VERSION}from'./version.js';

let registration=null,activeWorkerVersion='Unknown',latestVersion='Unknown',reloadScheduled=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const banner=()=>document.querySelector('#update-banner');

export async function workerVersion(worker=navigator.serviceWorker?.controller||registration?.active){
  if(!worker)return'None';
  return new Promise(resolve=>{
    const channel=new MessageChannel(),timer=setTimeout(()=>resolve('Unknown'),1500);
    channel.port1.onmessage=event=>{clearTimeout(timer);resolve(String(event.data?.version||'Unknown'))};
    worker.postMessage({type:'GET_VERSION'},[channel.port2]);
  });
}

async function deployedVersion(){
  try{const response=await fetch(`./version.json?checked=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error();return String((await response.json()).version||'Unknown')}catch{return'Unavailable'}
}

function showUpdate(message,action=false){
  const element=banner();if(!element)return;
  element.querySelector('span').textContent=message;
  element.querySelector('button').classList.toggle('hidden',!action);
  element.classList.remove('hidden');
}

async function reloadWhenSafe(targetVersion,force=false){
  if(reloadScheduled)return;
  const guard=`household-update-reloaded-${targetVersion}`;
  if(sessionStorage.getItem(guard)&&!force){showUpdate('Household update is ready.',true);return}
  reloadScheduled=true;
  for(let attempt=0;attempt<30;attempt++){
    const status=await syncStatus();
    if(status.status!=='syncing')break;
    showUpdate('Household update downloaded. Finishing synchronization first.');
    await delay(500);
  }
  sessionStorage.setItem(guard,'1');
  location.reload();
}

async function converge(worker=navigator.serviceWorker.controller||registration?.active){
  activeWorkerVersion=await workerVersion(worker);
  if(activeWorkerVersion!=='None'&&activeWorkerVersion!=='Unknown'&&activeWorkerVersion!==FRONTEND_VERSION){
    showUpdate('Household has been updated. Loading the latest version…');
    await reloadWhenSafe(activeWorkerVersion);
  }
}

async function checkForUpdate(){
  latestVersion=await deployedVersion();
  if(/^\d+$/.test(latestVersion)&&Number(latestVersion)>Number(FRONTEND_VERSION)){
    showUpdate('A Household update is downloading…');
    await registration?.update();
  }
  await converge();
}

export async function initializeUpdates(){
  if(!('serviceWorker'in navigator))return;
  registration=await navigator.serviceWorker.register('./service-worker.js');
  registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;
    worker?.addEventListener('statechange',()=>{if(worker.state==='activated')converge(worker)});
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>converge(navigator.serviceWorker.controller));
  banner()?.querySelector('button').addEventListener('click',()=>reloadWhenSafe(activeWorkerVersion==='Unknown'?latestVersion:activeWorkerVersion,true));
  addEventListener('online',checkForUpdate);
  addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate()});
  setInterval(checkForUpdate,15*60*1000);
  await checkForUpdate();
}

export async function versionDiagnostics(){
  activeWorkerVersion=await workerVersion();
  latestVersion=await deployedVersion();
  return{frontend:FRONTEND_VERSION,serviceWorker:activeWorkerVersion,latest:latestVersion,cloudApi:CLOUD_API_VERSION,cloudDeployment:CLOUD_DEPLOYMENT_VERSION};
}
