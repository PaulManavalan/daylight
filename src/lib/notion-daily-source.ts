import {notionId,notionUrl,object,richText} from './notion-data';

export interface RunningListItem{
 key:string;title:string;subject:string|null;sourceUrl:string;
 yellowHighlighted:boolean;completion:'checked'|'unchecked'|'not_specified';
}
export interface RunningListSource{pageId:string;title:string;readAt:string;items:RunningListItem[];weeklyNotes:string[];warnings:string[]}

/** Read source facts without assigning color meaning, duration estimates or calendar times. */
export function readRunningList(page:string,title:string,blocks:unknown[],readAt=new Date().toISOString()):RunningListSource{
 const pageId=notionId(page),items:RunningListItem[]=[],weeklyNotes:string[]=[],warnings:string[]=[];
 let weekly=false,subject:string|null=null,nested=false,truncated=false;
 for(const raw of blocks){
  const block=object(raw),type=String(block.type??''),body=object(block[type]),runs=Array.isArray(body.rich_text)?body.rich_text:[],text=richText(runs),trimmed=text.trim();
  if(block.has_children)nested=true;if(!trimmed)continue;
  if(/^(?:plan for (?:this|the) week|weekly plan)\b/i.test(trimmed)){weekly=true;continue;}
  if(weekly){weeklyNotes.push(trimmed);continue;}
  if(/^daylight (?:plan|check-ins|export)\b/i.test(trimmed))break;
  if(/^heading_[123]$/.test(type)){subject=trimmed;continue;}
  if(!['paragraph','to_do','bulleted_list_item','numbered_list_item'].includes(type))continue;
  const heading=type==='paragraph'?trimmed.match(/^([\p{L}][\p{L}\p{N} &/.'()_-]{0,79}):\s*$/u):null;
  if(heading){subject=heading[1];continue;}
  const prefix=type==='paragraph'?trimmed.match(/^([\p{L}][\p{L}\p{N} &/.'()_-]{0,79}):\s*([\s\S]+)$/u):null;
  const payload=prefix?prefix[2]:trimmed,offset=prefix?text.indexOf(payload,text.indexOf(':')+1):text.indexOf(trimmed),currentSubject=prefix?prefix[1]:subject;
  const ranges:{start:number;end:number}[]=[];let position=0;
  for(const rawRun of runs){const run=object(rawRun),content=richText([run]);if(object(run.annotations).color==='yellow_background')ranges.push({start:position,end:position+content.length});position+=content.length;}
  const parts=prefix?[...payload.matchAll(/[^,;]+/g)]:[{0:payload,index:0}];
  for(let index=0;index<parts.length;index++){
   const part=parts[index],value=part[0],name=value.trim();if(!name)continue;if(items.length>=500){truncated=true;break;}
   const start=offset+(part.index??0)+value.indexOf(name),end=start+name.length;
   items.push({key:`${pageId}/${String(block.id)}/${index}`,title:name,subject:currentSubject,sourceUrl:notionUrl(pageId)+'#'+String(block.id).replaceAll('-',''),yellowHighlighted:ranges.some(range=>range.start<end&&range.end>start),completion:type==='to_do'?(body.checked?'checked':'unchecked'):'not_specified'});
  }
 }
 if(nested)warnings.push('This read includes top-level items only; nested blocks may contain additional work.');
 if(truncated)warnings.push('The first 500 items are shown.');
 return {pageId,title,readAt,items,weeklyNotes,warnings};
}
