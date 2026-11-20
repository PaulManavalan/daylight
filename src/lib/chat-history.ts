import {z} from 'zod';
export const chatMessageSchema=z.object({role:z.enum(['assistant','you']),text:z.string().max(5000),at:z.iso.datetime().optional()});
export type ChatMessage=z.infer<typeof chatMessageSchema>;
const historySchema=z.object({version:z.literal(1),day:z.iso.date(),messages:z.array(chatMessageSchema).max(100)});
export const chatHistoryKey=(owner:string)=>'daylight.chat.v1.'+owner;
interface ChatStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export class ChatHistory {
 private previous:string|null=null;
 private usable=false;
 constructor(private storage:ChatStorage,private owner:string){}
 load(){
  this.usable=false;
  const raw=this.storage.getItem(chatHistoryKey(this.owner));this.previous=raw;
  if(raw===null){this.usable=true;return null;}
  if(raw.length>250000)throw new Error('Saved chat is too large to read. It has been preserved.');
  try{const data=historySchema.parse(JSON.parse(raw));this.usable=true;return data;}catch{throw new Error('Saved chat could not be read. It has been preserved; this conversation is available in this tab only.');}
 }
 save(day:string,messages:ChatMessage[]){
  if(!this.usable)return;
  const bounded:ChatMessage[]=[];let budget=180000;
  for(const message of [...messages].reverse()){if(bounded.length===100 || message.text.length>budget)break;bounded.unshift(message);budget-=message.text.length;}
  let raw=JSON.stringify(historySchema.parse({version:1,day,messages:bounded}));
  while(raw.length>250000 && bounded.length){bounded.shift();raw=JSON.stringify({version:1,day,messages:bounded});}
  if(this.storage.getItem(chatHistoryKey(this.owner))!==this.previous){this.usable=false;throw new Error('Another tab changed the saved chat. This tab keeps its conversation; reload to pick up the saved one.');}
  try{this.storage.setItem(chatHistoryKey(this.owner),raw);}catch{this.usable=false;throw new Error('Chat could not be saved in this browser. Keep this tab open or download the conversation.');}
  this.previous=raw;
 }
}
