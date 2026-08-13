export const API_URL='https://script.google.com/macros/s/AKfycbweZL1-b_Ehiu5dAvcoupCy2NqxZsOO3slkCQS0INVGfdtKk11YJpob7dfvl1C3k3sZ/exec';
export class ApiError extends Error{constructor(message,code='NETWORK_ERROR'){super(message);this.code=code}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const trustedBridgeOrigin=origin=>{try{const url=new URL(origin);return url.protocol==='https:'&&(url.hostname==='script.google.com'||url.hostname.endsWith('.googleusercontent.com'))}catch{return false}};

async function request(payload){
  const requestId=crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');
  frame.name=`household-api-${requestId}`;frame.hidden=true;frame.setAttribute('aria-hidden','true');
  form.method='POST';form.action=API_URL;form.target=frame.name;form.hidden=true;
  for(const[name,value]of Object.entries({transport:'iframe',requestId,payload:JSON.stringify({apiVersion:1,...payload})})){
    const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);
  }
  document.body.append(frame,form);
  try{
    const result=await new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);removeEventListener('message',onMessage)};
      const onMessage=event=>{
        if(event.source!==frame.contentWindow||!trustedBridgeOrigin(event.origin)||event.data?.requestId!==requestId)return;
        cleanup();resolve(event.data.payload);
      };
      const timer=setTimeout(()=>{cleanup();reject(new ApiError('Household cloud is temporarily unavailable. Please try again. Your local data is safe.','NETWORK_ERROR'))},45000);
      addEventListener('message',onMessage);form.submit();
    });
    if(!result?.ok){const error=result?.error||{};throw new ApiError(error.message||'Request rejected.',error.code||'API_ERROR')}
    if(result.apiVersion!==1)throw new ApiError('This app version is not compatible with the cloud.','UNSUPPORTED_API_VERSION');
    return result.data||{};
  }finally{form.remove();frame.remove()}
}

export const postOnce=payload=>request(payload);
export async function post(payload){let lastError;for(let attempt=0;attempt<3;attempt++){try{return await request(payload)}catch(error){lastError=error;if(error.code!=='NETWORK_ERROR')throw error;if(attempt<2)await delay(1000*(2**attempt))}}throw lastError}
