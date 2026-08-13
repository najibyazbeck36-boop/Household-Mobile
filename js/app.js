import{getMeta}from'./db.js';
import{pair}from'./auth.js';
import{syncNow,syncStatus,startAutoSync}from'./sync.js';
import*as views from'./views.js';
const app=document.querySelector('#app'),setup=document.querySelector('#setup'),view=document.querySelector('#view'),title=document.querySelector('#page-title'),syncButton=document.querySelector('#sync-button'),pairForm=document.querySelector('#pair-form'),pairButton=document.querySelector('#pair-button'),pairError=document.querySelector('#pair-error'),installPrompt=document.querySelector('#install-prompt'),installButton=document.querySelector('#install-button');
const titles={home:'Dashboard',activity:'Activity',add:'Add Entry',accounts:'Accounts',more:'More'};let route='home',pairingInFlight=false,deferredInstallPrompt=null;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3500)}
function standalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function updateInstallPrompt(){installPrompt.classList.toggle('hidden',standalone())}
addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;updateInstallPrompt()});
addEventListener('appinstalled',()=>{deferredInstallPrompt=null;installPrompt.classList.add('hidden');toast('Household installed. Open it from your home screen.')});
installButton.onclick=async()=>{if(standalone()){installPrompt.classList.add('hidden');return}if(!deferredInstallPrompt){toast('In Chrome, open the ⋮ menu and choose Install app or Add to Home screen.');return}installButton.disabled=true;try{await deferredInstallPrompt.prompt();const choice=await deferredInstallPrompt.userChoice;if(choice.outcome==='accepted')installPrompt.classList.add('hidden');deferredInstallPrompt=null}finally{installButton.disabled=false}};
async function updateStatus(){const s=await syncStatus();syncButton.textContent=s.conflicts?'Conflict':s.pending?`${s.pending} pending`:s.status==='syncing'?'Syncing…':navigator.onLine?'Synced':'Offline'}
async function navigate(next){route=next in views?next:'home';title.textContent=titles[route];view.innerHTML=await views[route]();await views.bind(route,navigate,toast);view.focus();document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.route===route?'page':'false'));updateStatus()}
function showPairing(message=''){app.classList.add('hidden');setup.classList.remove('hidden');pairButton.textContent='Pair Device';pairError.classList.remove('pairing-status');pairError.textContent=message;document.querySelector('#pairing-code').required=true}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.route));syncButton.onclick=async()=>{try{const r=await syncNow();toast(`${r.uploaded} uploaded, ${r.downloaded} downloaded`);navigate(route)}catch(e){toast(e.message)}};addEventListener('household-sync',updateStatus);addEventListener('household-authorization-required',()=>showPairing('This device authorization is no longer valid. Enter a fresh pairing code.'));
pairForm.onsubmit=async event=>{
  event.preventDefault();if(pairingInFlight)return;pairingInFlight=true;
  const continuing=Boolean(await getMeta('device_token'));pairError.classList.add('pairing-status');pairError.textContent=continuing?'Loading household data…':'Pairing securely… This may take up to a minute.';pairButton.disabled=true;pairButton.textContent=continuing?'Loading…':'Pairing…';
  try{await pair(document.querySelector('#device-name').value,document.querySelector('#pairing-code').value);document.querySelector('#pairing-code').value='';pairError.textContent='Paired. Loading household data…';setup.classList.add('hidden');app.classList.remove('hidden');await navigate('home');startAutoSync()}
  catch(error){pairError.classList.remove('pairing-status');pairError.textContent=error.code==='INVALID_PAIRING_CODE'?'That pairing code is invalid, expired, or already used. Generate a new code.':error.code==='DEVICE_EXISTS'?'The previous device identity was rejected. Submit the pairing code again to use a fresh identity.':error.code==='NETWORK_ERROR'?'The cloud response was interrupted. Tap Retry Pairing once; the same device identity and code will be recovered safely.':error.message;if(error.code==='NETWORK_ERROR')pairButton.dataset.retryPairing='true'}
  finally{pairingInFlight=false;pairButton.disabled=false;pairButton.textContent=await getMeta('device_token')?'Continue Setup':pairButton.dataset.retryPairing?'Retry Pairing':'Pair Device'}
};
async function init(){
  updateInstallPrompt();
  if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.register('./service-worker.js');registration.update().catch(()=>{});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!sessionStorage.getItem('household-sw-v13')){sessionStorage.setItem('household-sw-v13','1');location.reload()}})}
  if(await getMeta('device_token')&&await getMeta('household_id')){app.classList.remove('hidden');await navigate('home');startAutoSync();syncNow().then(()=>navigate(route)).catch(error=>{if(error.code==='INVALID_DEVICE')showPairing('This device authorization is no longer valid. Enter a fresh pairing code.');else updateStatus()})}
  else{setup.classList.remove('hidden');if(await getMeta('device_token')){pairButton.textContent='Continue Setup';pairError.textContent='Pairing was accepted. Continue loading your household.';document.querySelector('#pairing-code').required=false}}
}
init();
