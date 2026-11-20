import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserModel} from '../src/lib/browser-model';
import {brainContext} from '../src/lib/assistant-brain';
import {defaults} from '../src/lib/scheduling';
const request={persona:{name:'Sol',tone:'calm' as const},context:brainContext([],defaults(),[],[]),messages:[{role:'user' as const,content:'I just want to talk.'}]};
test('model loading can stop even when GPU discovery never resolves',{timeout:5000},async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:()=>new Promise(()=>{})}}});t.after(()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else Reflect.deleteProperty(globalThis,'navigator');});
 const model=new BrowserModel(),controller=new AbortController(),pending=model.load(()=>{},controller.signal);controller.abort();await assert.rejects(pending,/loading stopped/);
});
function fixture(){const model=new BrowserModel();let interrupted=0,unloaded=0,terminated=0,generated=0;const worker=new EventTarget() as EventTarget & {terminate():void};worker.terminate=()=>{terminated++;};Object.assign(model,{worker,engine:{chat:{completions:{create:()=>{generated++;return new Promise(()=>{});}}},interruptGenerate:async()=>{interrupted++;},unload:async()=>{unloaded++;}}});return {model,worker,counts:()=>({interrupted,unloaded,terminated,generated})};}
test('stopping browser inference rejects promptly even if the generation never resolves',{timeout:5000},async()=>{
 const f=fixture(),controller=new AbortController(),pending=f.model.ask(request,controller.signal);controller.abort();await assert.rejects(pending,/stopped/);assert.equal(f.counts().interrupted,1);
});
test('a crashed browser worker fails the current request and invalidates the dead engine',{timeout:5000},async()=>{
 const f=fixture(),pending=f.model.ask(request,new AbortController().signal);f.worker.dispatchEvent(new Event('error'));await assert.rejects(pending,{name:'BrowserModelUnavailable'});await assert.rejects(()=>f.model.ask(request,new AbortController().signal),/Enable the browser model/);assert.equal(f.counts().terminated,1);
});
test('browser disposal is idempotent and pre-aborted requests do not start generation',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(()=>f.model.ask(request,controller.signal),/stopped/);assert.equal(f.counts().generated,0);await Promise.all([f.model.dispose(),f.model.dispose()]);assert.equal(f.counts().unloaded,1);assert.equal(f.counts().terminated,1);
});
