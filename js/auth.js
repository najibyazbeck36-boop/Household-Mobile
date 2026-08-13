import {post,postOnce,ApiError} from './api.js';
import {bootstrapCommit,deleteMeta,getMeta,setMeta} from './db.js';

const FRESH_DEVICE_KEY='pairing_requires_new_device_id';

export function createPairingService({postRetry=post,postPair=postOnce,readMeta=getMeta,writeMeta=setMeta,removeMeta=deleteMeta,commitBootstrap=bootstrapCommit,randomUUID=()=>crypto.randomUUID()}={}){
  async function ensureDeviceId(){let id=await readMeta('device_id');if(!id){id=randomUUID();await writeMeta('device_id',id)}return id}
  async function invalidateDeviceToken(){await removeMeta('device_token');await writeMeta(FRESH_DEVICE_KEY,true)}
  async function deviceIdForPairing(){if(await readMeta(FRESH_DEVICE_KEY,false)){const id=randomUUID();await writeMeta('device_id',id);await removeMeta(FRESH_DEVICE_KEY);return id}return ensureDeviceId()}
  async function config(){return{deviceId:await ensureDeviceId(),deviceName:await readMeta('device_name'),deviceToken:await readMeta('device_token'),defaultMemberId:await readMeta('default_member_id'),householdId:await readMeta('household_id')}}
  async function pair(deviceName,pairingCode){
    let deviceToken=await readMeta('device_token');
    let deviceId=await ensureDeviceId();
    if(!deviceToken){
      deviceId=await deviceIdForPairing();
      let result;
      try{result=await postPair({action:'pairDevice',pairingCode:pairingCode.trim().toUpperCase(),deviceId,deviceName:deviceName.trim()})}
      catch(error){
        // The server rejects an existing UUID before consuming the code. Rotate
        // only for the user's next explicit submission; never replay this request.
        if(error.code==='DEVICE_EXISTS')await writeMeta(FRESH_DEVICE_KEY,true);
        throw error;
      }
      deviceToken=result.deviceToken;
      await writeMeta('device_name',deviceName.trim());
      await writeMeta('device_token',deviceToken);
    }
    try{const snapshot=await postRetry({action:'bootstrap',deviceId,deviceToken});await commitBootstrap(snapshot);return snapshot}
    catch(error){
      if(error.code==='INVALID_DEVICE'){
        await invalidateDeviceToken();
        throw new ApiError('This device authorization is no longer valid. Enter a fresh pairing code.','INVALID_DEVICE');
      }
      throw new ApiError('Device paired, but household data could not load. Press Continue Setup to retry.','BOOTSTRAP_PENDING');
    }
  }
  async function setDefaultMember(id){await writeMeta('default_member_id',id||null)}
  return{ensureDeviceId,config,pair,setDefaultMember,invalidateDeviceToken};
}

const service=createPairingService();
export const ensureDeviceId=service.ensureDeviceId;
export const config=service.config;
export const pair=service.pair;
export const setDefaultMember=service.setDefaultMember;
export const invalidateDeviceToken=service.invalidateDeviceToken;
