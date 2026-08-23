import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createBackendServer } from "../server/app.js";
import { createOwnerApiRepository } from "../server/repositories/ownerApiRepository.js";

async function serverFor({ userId = "user-a", repository = {}, authenticated = true } = {}) {
  const server = createBackendServer({ pool:{query:async()=>({rows:[]})},bodyLimitBytes:600_000,readinessTimeoutMillis:20,
    authenticate:async()=>authenticated?{user:{id:userId}}:null,ownerApi:repository,logger:{error(){}} });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  return {server,url:`http://127.0.0.1:${server.address().port}`};
}

const routes = [
  ["GET","/api/projects"],["POST","/api/projects"],["POST","/api/projects/batch"],
  ["GET","/api/performers"],["GET","/api/quick-access-items"],["GET","/api/template-library"],
  ["GET","/api/ai-settings"],["GET","/api/export-profile"],["GET","/api/export-presets"],
  ["POST","/api/product-events"],["GET","/api/user-flags"],["POST","/api/beta-feedback"],
];
test("all owner API families reject unauthenticated requests",async(t)=>{const x=await serverFor({authenticated:false});t.after(()=>x.server.close());for(const [method,path] of routes){const r=await fetch(x.url+path,{method,headers:{"content-type":"application/json"},body:method==="GET"?undefined:"{}"});assert.equal(r.status,401,path);assert.deepEqual(await r.json(),{error:"authentication_required"});}});

test("trusted context overrides spoofed ownership and unsafe fields are rejected",async(t)=>{let called=false;const x=await serverFor({repository:{createProject:async()=>{called=true;}}});t.after(()=>x.server.close());const r=await fetch(x.url+"/api/projects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"p1",user_id:"user-b"})});assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:"ownership_field_not_allowed"});assert.equal(called,false);});

test("routes pass only authenticated internal owner to singleton and insert repositories",async(t)=>{const seen=[];const repository={loadTemplateLibrary:async(u)=>(seen.push(u),{exists:false,library:{}}),upsertAiSettings:async(u)=>(seen.push(u),{}),insertFeedback:async(u)=>(seen.push(u),{ok:true}),trackEvent:async(u)=>(seen.push(u),{id:"e"})};const x=await serverFor({repository});t.after(()=>x.server.close());await fetch(x.url+"/api/template-library");await fetch(x.url+"/api/ai-settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({personalization:"",useProjectHistory:false,useStudioTemplates:true})});await fetch(x.url+"/api/beta-feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:"ok"})});await fetch(x.url+"/api/product-events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType:"session_active",metadata:{}})});assert.deepEqual(seen,["user-a","user-a","user-a","user-a"]);});

test("owned update/delete SQL always binds owner and foreign performer create is indistinguishable from absent",async()=>{const calls=[];const pool={query:async(sql,values)=>{calls.push({sql,values});return{rows:[]}}};const repo=createOwnerApiRepository(pool);await assert.rejects(()=>repo.updateProject("user-a","known-b",{id:"known-b",name:"x"}),e=>e.status===404);await assert.rejects(()=>repo.deletePerformer("user-a","known-b"),e=>e.status===404);await assert.rejects(()=>repo.createQuickAccess("user-a",{id:"q",performerId:"performer-b"}),e=>e.status===404);assert.ok(calls.every(c=>c.values[0]==="user-a"));assert.match(calls[0].sql,/user_id=\$1 and client_id=\$2/);assert.match(calls[2].sql,/exists\(select 1 from public\.performers where user_id=\$1 and client_id=\$3\)/);});

test("batch uses one transaction and rolls back completely on an invalid item",async()=>{const log=[];const client={query:async(sql)=>{log.push(sql);if(/^insert/.test(sql)&&log.filter(x=>/^insert/.test(x)).length===2)throw new Error("invalid");return{rows:[{user_id:"user-a",client_id:"p1",performer_data:{id:"p1"}}]}},release:()=>log.push("release")};const repo=createOwnerApiRepository({connect:async()=>client,query:client.query});await assert.rejects(()=>repo.batchPerformers("user-a",[{id:"p1"},{id:"p2"}]));assert.deepEqual(log.filter(x=>["begin","commit","rollback"].includes(x)),["begin","rollback"]);assert.equal(log.at(-1),"release");});

test("preset UUIDs, event allowlist, batch size, and malformed JSON have stable 400 errors",async(t)=>{const x=await serverFor({repository:{}});t.after(()=>x.server.close());for(const [path,method,body,code] of [["/api/export-presets/no","PUT",{},"invalid_id"],["/api/product-events","POST",{eventType:"arbitrary"},"invalid_event_type"],["/api/projects/batch","POST",{items:Array(101).fill({})},"invalid_batch"]]){const r=await fetch(x.url+path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});assert.equal(r.status,400);assert.equal((await r.json()).error,code);}const malformed=await fetch(x.url+"/api/projects",{method:"POST",body:"{"});assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:"invalid_json"});});

test("beta product event allowlist accepts tracked events and preserves safe metadata",async(t)=>{const calls=[];const x=await serverFor({repository:{trackEvent:async(...args)=>(calls.push(args),{id:"event",event_type:args[1],created_at:"2026-08-23T00:00:00Z"})}});t.after(()=>x.server.close());for(const [eventType,metadata] of [["project_created",{source:"template"}],["performer_created",{}],["ai_import_completed",{format:"pdf"}]]){const r=await fetch(x.url+"/api/product-events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType,metadata})});assert.equal(r.status,201);}
  assert.deepEqual(calls.map(([,eventType])=>eventType),["project_created","performer_created","ai_import_completed"]);
  assert.deepEqual(calls.map(([, , ,metadata])=>metadata),[{source:"template"},{},{format:"pdf"}]);
  assert.equal(JSON.stringify(calls).match(/project_data|prompt|filename|sheet|email/),null);
});
