export type ModelProviderChoice='browser'|'ollama'|'planner';
const key=(owner:string)=>'daylight.ai.provider.v1.'+owner;
export function modelPreference(storage:{getItem(key:string):string|null},owner:string):ModelProviderChoice|null{try{const value=storage.getItem(key(owner));return value==='browser'||value==='ollama'||value==='planner'?value:null;}catch{return null;}}
export function rememberModelPreference(storage:{setItem(key:string,value:string):void},owner:string,choice:ModelProviderChoice){try{storage.setItem(key(owner),choice);return true;}catch{return false;}}
