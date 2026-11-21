import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRunningList} from '../src/lib/notion-daily-source';
import {notionRunningList} from '../src/lib/notion-operations';
import {NotionClient} from '../src/lib/notion-server';
const page='12345678-1234-4234-8234-123456789012',id='23456789-2345-4345-8345-234567890123';
const span=(text:string,color='default')=>({plain_text:text,annotations:{color}});
const block=(runs:unknown[],type='paragraph',extra={})=>({id,type,[type]:{rich_text:runs,...extra}});
test('the running list preserves yellow highlighting per item without turning it into a priority',()=>{
 const source=readRunningList(page,'Synthetic running list',[block([span('Math: '),span('Worksheet','yellow_background'),span(', Review for quiz')]),block([span('Science: '),span('Project outline, Practice problems','yellow_background'),span(', Study')])]);
 assert.deepEqual(source.items.map(item=>[item.title,item.subject,item.yellowHighlighted]),[['Worksheet','Math',true],['Review for quiz','Math',false],['Project outline','Science',true],['Practice problems','Science',true],['Study','Science',false]]);
 assert.equal('priority' in source.items[0],false);assert.equal('minutes' in source.items[0],false);assert.equal('deadline' in source.items[0],false);
});
test('a highlighted subject label alone does not mark every task as highlighted',()=>{
 const source=readRunningList(page,'List',[block([span('Math','yellow_background'),span(': Worksheet, Review')])]);assert.ok(source.items.every(item=>!item.yellowHighlighted));
});
test('standalone tasks stay visible and untimed weekly notes do not become appointments',()=>{
 const source=readRunningList(page,'List',[block([span('Plan week')]),block([span('PLAN FOR THIS WEEK:')]),block([span('Saturday:\nPractice\nHomework')])]);
 assert.equal(source.items[0].title,'Plan week');assert.equal(source.items[0].subject,null);assert.deepEqual(source.weeklyNotes,['Saturday:\nPractice\nHomework']);assert.equal('fixed' in source,false);
});
test('an appended Daylight export is excluded even after the weekly notes section',()=>{const source=readRunningList(page,'List',[block([span('Math: Worksheet')]),block([span('PLAN FOR THIS WEEK:')]),block([span('Monday school')]),block([span('Daylight plan')]),block([span('Generated schedule')])]);assert.deepEqual(source.weeklyNotes,['Monday school']);assert.equal(source.items.length,1);});
test('explicit checklist state stays distinct from a plain paragraph with no completion information',()=>{
 const source=readRunningList(page,'List',[block([span('Read')]),block([span('Read')],'to_do',{checked:false}),block([span('Read')],'to_do',{checked:true})]);assert.deepEqual(source.items.map(item=>item.completion),['not_specified','unchecked','checked']);
});
test('repeated titles are kept as source items and truncated/nested reads are visible',()=>{
 const source=readRunningList(page,'List',[{...block([span('Math: Review, Review')]),has_children:true}]);assert.equal(source.items.length,2);assert.notEqual(source.items[0].key,source.items[1].key);assert.ok(source.warnings.length);
 const many=readRunningList(page,'List',[block([span('Math: '+Array.from({length:501},(_,i)=>'Task '+i).join(', '))])]);assert.equal(many.items.length,500);assert.ok(many.warnings.some(w=>w.includes('500')));
});
test('the running-list action reads the existing page without importing, rewriting or completing anything',async()=>{
 const methods:string[]=[],fetcher=(async(input,init)=>{methods.push(String(init?.method));return new Response(JSON.stringify(String(input).includes('/children')?{results:[block([span('Math: '),span('Worksheet','yellow_background')])],has_more:false}:{id:page,properties:{title:{type:'title',title:[span('Synthetic running list')]}}}));}) as typeof fetch;
 const client=new NotionClient({kind:'session',owner:'local-demo',accessToken:'synthetic',workspaceId:page,workspaceName:'Synthetic',expires:Date.now()+60000},{clientId:'synthetic',clientSecret:'synthetic',cookieSecret:'synthetic-cookie-secret-with-32-characters',redirectUri:'https://example.com/api/notion/callback',origin:'https://example.com',secure:true},fetcher);
 const result=await notionRunningList(client,page);assert.deepEqual(methods,['GET','GET']);assert.equal(result.title,'Synthetic running list');assert.equal(result.items[0].yellowHighlighted,true);assert.ok(!Number.isNaN(Date.parse(result.readAt)));
});
