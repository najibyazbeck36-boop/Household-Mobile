export const API_URL='https://script.google.com/macros/s/AKfycbweZL1-b_Ehiu5dAvcoupCy2NqxZsOO3slkCQS0INVGfdtKk11YJpob7dfvl1C3k3sZ/exec';
export class ApiError extends Error{constructor(message,code='NETWORK_ERROR'){super(message);this.code=code}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function poll(requestId,callbackName){return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(()=>{cleanup();reject(new ApiError('Household cloud is temporarily unavailable. Please try again. Your local data is safe.','NETWORK_ERROR'))},15000);
  const cleanup=()=>{clearTimeout(timer);delete window[callbackName];script.remove()};
  window[callbackName]=result=>{cleanup();resolve(result)};
  script.onerror=()=>{cleanup();reject(new ApiError('Household cloud is temporarily unavailable. Please try again. Your local data is safe.','NETWORK_ERROR'))};
  script.src=`${API_URL}?transport=jsonp&requestId=${encodeURIComponent(requestId)}&callback=${callbackName}&t=${Date.now()}`;
  document.head.append(script);
})}

async function request(payload){
  const requestId=crypto.randomUUID(),callbackName=`householdApi_${requestId.replaceAll('-','_')}`;
  const frame=document.createElement('iframe'),form=document.createElement('form');
  frame.name=`household-api-${requestId}`;frame.hidden=true;frame.setAttribute('aria-hidden','true');
  form.method='POST';form.action=API_URL;form.target=frame.name;form.hidden=true;
  for(const[name,value]of Object.entries({transport:'jsonp',requestId,payload:JSON.stringify({apiVersion:1,...payload})})){
    const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
  }
  document.body.append(frame,form);form.submit();
  try{
    const deadline=Date.now()+45000;
    while(Date.now()<deadline){await delay(1200);const result=await poll(requestId,callbackName);if(result?.pending)continue;if(!result?.ok){const error=result?.error||{};throw new ApiError(error.message||'Request rejected.',error.code||'API_ERROR')}if(result.apiVersion!==1)throw new ApiError('This app version is not compatible with the cloud.','UNSUPPORTED_API_VERSION');return result.data||{}}
    throw new ApiError('Household cloud is temporarily unavailable. Please try again. Your local data is safe.','NETWORK_ERROR');
  }finally{form.remove();frame.remove()}
}

export const postOnce=payload=>request(payload);
export async function post(payload){let lastError;for(let attempt=0;attempt<3;attempt++){try{return await request(payload)}catch(error){lastError=error;if(error.code!=='NETWORK_ERROR')throw error;if(attempt<2)await delay(1000*(2**attempt))}}throw lastError}
