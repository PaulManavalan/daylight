import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sameLocalOrigin} from '@/lib/local-model';
import {runningSourceSchema} from '@/lib/notion-running-schema';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Optional personal preview only. This route never serves a snapshot on Vercel. */
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(process.env.VERCEL==='1'||process.env.DAYLIGHT_LOCAL_NOTION_SNAPSHOT!=='1'||!sameLocalOrigin(request))return Response.json({available:false},{status:404,headers});
 try{const raw=await readFile(path.join(process.env.DAYLIGHT_LOCAL_DATA_ROOT??process.cwd(),'artifacts','private-running-list.json'),'utf8');if(raw.length>500000)throw new Error('Snapshot too large');return Response.json(runningSourceSchema.parse(JSON.parse(raw)),{headers});}catch{return Response.json({available:false},{status:404,headers});}
}
