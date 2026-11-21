import {createHash} from 'node:crypto';
import {z} from 'zod';
import {NotionClient,NotionError} from './notion-server';
import {readRunningList} from './notion-daily-source';
import {databaseCandidates,pageCandidates,notionId,notionUrl,object,resourceTitle,notionExportSchema,type NotionExport,type NotionResource} from './notion-data';

export async function notionSearch(client:NotionClient,query:string){
 const data=await client.call('/search','POST',{query,page_size:50,sort:{direction:'descending',timestamp:'last_edited_time'}});
 const results=(Array.isArray(data.results)?data.results:[]).map(object).filter(row=>['page','database','data_source'].includes(String(row.object))&&!row.archived&&!row.in_trash).map(row=>({id:notionId(String(row.id)),title:resourceTitle(row),kind:row.object as NotionResource['kind']}));return {resources:results,hasMore:Boolean(data.has_more)};
}
async function children(client:NotionClient,id:string,max=300){
 const blocks:unknown[]=[];let cursor:string|undefined;
 do{const data=await client.call(`/blocks/${notionId(id)}/children?page_size=100${cursor?'&start_cursor='+encodeURIComponent(cursor):''}`);blocks.push(...(Array.isArray(data.results)?data.results:[]));cursor=data.has_more&&typeof data.next_cursor==='string'?data.next_cursor:undefined;if(blocks.length>=max)return {blocks:blocks.slice(0,max),hasMore:Boolean(cursor)};}while(cursor);return {blocks,hasMore:false};
}
export async function notionRunningList(client:NotionClient,source:string){
 const id=notionId(source),page=await client.call('/pages/'+id);if(page.archived||page.in_trash)throw new NotionError('That running list is in the trash. Choose an available page.');
 const result=await children(client,id),list=readRunningList(id,resourceTitle(page),result.blocks);
 if(result.hasMore)list.warnings.push('Only the first 300 top-level blocks were read.');return list;
}
export async function notionPreview(client:NotionClient,source:string,kind:'auto'|'page'|'database'|'data_source',cursor?:string){
 const id=notionId(source);let metadata:Record<string,unknown>;
 if(kind==='auto'){try{metadata=await client.call('/pages/'+id);kind='page';}catch(e){if(!(e instanceof NotionError)||e.status!==404&&e.status!==400)throw e;try{metadata=await client.call('/databases/'+id);kind='database';}catch(error){if(!(error instanceof NotionError)||error.status!==404&&error.status!==400)throw error;metadata=await client.call('/data_sources/'+id);kind='data_source';}}}
 else metadata=await client.call('/'+(kind==='page'?'pages':kind==='database'?'databases':'data_sources')+'/'+id);
 if(metadata.archived||metadata.in_trash)throw new NotionError('That Notion page is in the trash. Choose an available page.');
 const warnings:string[]=[];
 if(kind==='page'){const read=await children(client,id),parsed=pageCandidates(id,read.blocks);if(parsed.nested)warnings.push('Nested blocks are not expanded. Open a nested page directly if it contains more tasks.');if(read.hasMore)warnings.push('Only the first 300 blocks were read. Choose a smaller source page to review additional work.');if(parsed.stopped)warnings.push('The weekly schedule or a previous Daylight export was excluded from task import.');if(parsed.items.length>200)warnings.push('Only the first 200 task candidates are shown. Choose a smaller source to review more.');return {sourceId:id,kind,title:resourceTitle(metadata),items:parsed.items.slice(0,200),skipped:parsed.skipped,warnings,nextCursor:null};}
 if(kind==='database'){const sources=(Array.isArray(metadata.data_sources)?metadata.data_sources:[]).map(object);if(!sources.length)throw new NotionError('This database has no accessible tables. Check its connection access in Notion.');if(sources.length!==1)return {sourceId:id,kind,title:resourceTitle(metadata),items:[],skipped:0,warnings,choices:sources.map(s=>({id:notionId(String(s.id)),title:String(s.name??'Table'),kind:'data_source'}))};source=String(sources[0].id);}else source=id;
 const sourceId=notionId(source),data=await client.call('/data_sources/'+sourceId+'/query','POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})}),parsed=databaseCandidates(Array.isArray(data.results)?data.results:[]);
 return {sourceId,kind:'data_source',title:resourceTitle(metadata),...parsed,warnings,nextCursor:data.has_more?data.next_cursor:null};
}
export function notionExportMarker(input:NotionExport,origin:string){return origin+'/#daylight-notion-export-'+input.operationId+'-'+createHash('sha256').update(JSON.stringify({title:input.title,lines:input.lines})).digest('hex').slice(0,16);}
function containsMarker(blocks:unknown[],marker:string){return blocks.some(v=>{const b=object(v),body=object(b[String(b.type)]);return Array.isArray(body.rich_text)&&body.rich_text.some(v=>object(object(object(v).text).link).url===marker);});}
export async function notionSave(client:NotionClient,raw:unknown,origin:string){
 const input=notionExportSchema.parse(raw),page=await client.call('/pages/'+input.pageId);if(page.archived||page.in_trash)throw new NotionError('The destination page is in the trash. Choose another page.');
 const marker=notionExportMarker(input,origin),previous=await children(client,input.pageId,500);
 if(containsMarker(previous.blocks,marker))return {url:notionUrl(input.pageId),alreadySaved:true};
 if(previous.hasMore||previous.blocks.length>300)throw new NotionError('Choose a shorter destination page for a safely verified save. No content was added.');
 const text=(content:string)=>[{type:'text',text:{content}}];
 const blocks=[{object:'block',type:'heading_2',heading_2:{rich_text:text(input.title)}},...input.lines.map(line=>({object:'block',type:'paragraph',paragraph:{rich_text:text(line)}})),{object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:'Open Daylight',link:{url:marker}}}]}}];
 await client.call('/blocks/'+input.pageId+'/children','PATCH',{children:blocks});
 const verified=await children(client,input.pageId,500);if(!containsMarker(verified.blocks,marker))throw new NotionError('Notion may have saved this export, but verification did not finish. Check the destination before retrying.',502);
 return {url:notionUrl(input.pageId),alreadySaved:false};
}
export const notionActionSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('connect')}).strict(),z.object({op:z.literal('disconnect')}).strict(),
 z.object({op:z.literal('search'),query:z.string().trim().max(200)}).strict(),
 z.object({op:z.literal('running-list'),source:z.string().trim().min(1).max(1000)}).strict(),
 z.object({op:z.literal('preview'),source:z.string().trim().min(1).max(1000),kind:z.enum(['auto','page','database','data_source']).default('auto'),cursor:z.uuid().optional()}).strict(),
 z.object({op:z.literal('export'),data:notionExportSchema}).strict(),
]);
