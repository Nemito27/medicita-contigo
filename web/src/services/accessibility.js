export const ACCESSIBILITY_KEYS=Object.freeze(['simple_mode','high_contrast','reduce_motion','visual_mode','vibration_enabled']);
export function readAccessibility(storage,key){
  try{
    const raw=JSON.parse(storage.getItem(key)||'{}'),prefs={};
    for(const name of ACCESSIBILITY_KEYS)if(typeof raw[name]==='boolean')prefs[name]=raw[name];
    return {prefs,pending:Array.isArray(raw.pending_keys)?raw.pending_keys.filter(name=>ACCESSIBILITY_KEYS.includes(name)):[]};
  }catch{return {prefs:{},pending:[]};}
}
export function mergeAccessibility(local,pending,remote={}){
  const prefs={...local,...remote};
  for(const name of pending||[])if(ACCESSIBILITY_KEYS.includes(name)&&typeof local[name]==='boolean')prefs[name]=local[name];
  return prefs;
}
export function persistAccessibility(storage,key,prefs,pending=[]){
  const value={};
  for(const name of ACCESSIBILITY_KEYS)if(typeof prefs[name]==='boolean')value[name]=prefs[name];
  value.pending_keys=[...new Set(pending)].filter(name=>ACCESSIBILITY_KEYS.includes(name));
  storage.setItem(key,JSON.stringify(value));
}
