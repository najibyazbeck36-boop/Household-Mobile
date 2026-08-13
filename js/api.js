export const API_URL='https://household-mobile-api.household-mobile.workers.dev';
export class ApiError extends Error{constructor(message,code='NETWORK_ERROR'){super(message);this.code=code}}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(payload){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({apiVersion:1,...payload}),cache:'no-store',signal:controller.signal});
    const result=await response.json();
    if(!result?.ok){const error=result?.error||{};throw new ApiError(error.message||'Request rejected.',error.code||'API_ERROR')}
    if(result.apiVersion!==1)throw new ApiError('This app version is not compatible with the cloud.','UNSUPPORTED_API_VERSION');
    return result.data||{};
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError('Household cloud is temporarily unavailable. Please try again. Your local data is safe.','NETWORK_ERROR')}
  finally{clearTimeout(timer)}
}

export const postOnce=payload=>request(payload);
export async function post(payload){let lastError;for(let attempt=0;attempt<3;attempt++){try{return await request(payload)}catch(error){lastError=error;if(error.code!=='NETWORK_ERROR')throw error;if(attempt<2)await delay(1000*(2**attempt))}}throw lastError}
