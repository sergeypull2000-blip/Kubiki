import { buildProjectRow, deserializeProjectFromServer } from "../../src/projectServer.js";
import { buildPerformerRow, deserializePerformerFromServer } from "../../src/performerServer.js";
import { buildQuickAccessRow, deserializeQuickAccessItemFromServer } from "../../src/quickAccessServer.js";
import { deserializeTemplateLibraryFromServer, serializeTemplateLibraryForServer } from "../../src/templateLibrary.js";
import { normalizeAiSettings } from "../../src/aiSettings.js";
import { presentationSettingsForPreset } from "../../src/exportSettings.js";
import { notFound } from "../apiErrors.js";
import { feedbackProjection, projectionsEqual, structuralDiff } from "../aiFeedback.js";
import { LEGAL_DOCUMENT_VERSIONS } from "../../src/legalConfig.js";

const one = (result) => { if (!result.rows[0]) throw notFound(); return result.rows[0]; };
const transaction = async (pool, operation) => {
  const client = await pool.connect();
  try { await client.query("begin"); const value = await operation(client); await client.query("commit"); return value; }
  catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
};

export function createOwnerApiRepository(pool) {
  const query = (sql, values) => pool.query(sql, values);
  const projectUpsert = async (db, userId, project) => {
    const r = buildProjectRow(userId, project);
    return deserializeProjectFromServer(one(await db.query(`insert into public.projects (user_id,client_id,name,data_version,project_data) values ($1,$2,$3,$4,$5) on conflict (user_id,client_id) do update set name=excluded.name,data_version=excluded.data_version,project_data=excluded.project_data returning id,user_id,client_id,name,data_version,project_data`, [userId,r.client_id,r.name,r.data_version,r.project_data])));
  };
  const projectCreate = async (userId, project) => { const r=buildProjectRow(userId,project);return deserializeProjectFromServer(one(await query(`insert into public.projects (user_id,client_id,name,data_version,project_data) values ($1,$2,$3,$4,$5) returning *`,[userId,r.client_id,r.name,r.data_version,r.project_data]))); };
  const performerUpsert = async (db, userId, performer) => {
    const r = buildPerformerRow(userId, performer);
    return deserializePerformerFromServer(one(await db.query(`insert into public.performers (user_id,client_id,performer_data) values ($1,$2,$3) on conflict (user_id,client_id) do update set performer_data=excluded.performer_data returning *`, [userId,r.client_id,r.performer_data])));
  };
  const performerCreate = async (userId, performer) => {const r=buildPerformerRow(userId,performer);return deserializePerformerFromServer(one(await query(`insert into public.performers(user_id,client_id,performer_data) values($1,$2,$3) returning *`,[userId,r.client_id,r.performer_data])));};
  const quickUpsert = async (db, userId, item) => {
    const r = buildQuickAccessRow(userId, item);
    return deserializeQuickAccessItemFromServer(one(await db.query(`insert into public.quick_access_items (user_id,client_id,performer_client_id,pinned,sort_order,item_data) select $1,$2,$3,$4,$5,$6 where exists (select 1 from public.performers where user_id=$1 and client_id=$3) on conflict (user_id,performer_client_id) do update set client_id=excluded.client_id,pinned=excluded.pinned,sort_order=excluded.sort_order,item_data=excluded.item_data returning *`, [userId,r.client_id,r.performer_client_id,r.pinned,r.sort_order,r.item_data])));
  };
  const quickCreate = async (userId,item) => {const r=buildQuickAccessRow(userId,item);return deserializeQuickAccessItemFromServer(one(await query(`insert into public.quick_access_items(user_id,client_id,performer_client_id,pinned,sort_order,item_data) select $1,$2,$3,$4,$5,$6 where exists(select 1 from public.performers where user_id=$1 and client_id=$3) returning *`,[userId,r.client_id,r.performer_client_id,r.pinned,r.sort_order,r.item_data])));};
  const hasImprovementConsent = async (db, userId) => Boolean((await db.query(`select 1 from public.user_legal_acceptances where user_id=$1 and document_key='ai_improvement_consent' and version=$2 and revoked_at is null`, [userId, LEGAL_DOCUMENT_VERSIONS.ai_improvement_consent])).rows[0]);
  const projectRow = async (db, userId, clientId) => (await db.query(`select id from public.projects where user_id=$1 and client_id=$2`, [userId, clientId])).rows[0];
  const updateActiveSample = async (db, userId, clientId, project, finalize = false) => {
    if (!await hasImprovementConsent(db, userId)) return null;
    const owned = await projectRow(db, userId, clientId); if (!owned) return null;
    const sample = (await db.query(`select * from public.ai_feedback_samples where project_id=$1 and finalized_at is null order by created_at desc limit 1 for update`, [owned.id])).rows[0];
    if (!sample) return null;
    const human = feedbackProjection(project), unchanged = projectionsEqual(sample.ai_snapshot, human), diff = structuralDiff(sample.ai_snapshot, human);
    if (!finalize && unchanged) return sample;
    return one(await db.query(`update public.ai_feedback_samples set human_snapshot=$3,diff=$4,accepted_without_correction=$5,finalized_at=case when $6 then now() else finalized_at end,updated_at=now() where id=$1 and project_id=$2 returning *`, [sample.id,owned.id,human,diff,finalize ? unchanged : null,finalize]));
  };
  return {
    async listProjects(userId) { return (await query(`select * from public.projects where user_id=$1 order by updated_at desc,client_id`, [userId])).rows.map(deserializeProjectFromServer); },
    createProject: projectCreate, upsertProject: (u,p) => projectUpsert(pool,u,p),
    async updateProject(userId, clientId, project) { const r=buildProjectRow(userId,{...project,id:clientId}); return deserializeProjectFromServer(one(await query(`update public.projects set name=$3,data_version=$4,project_data=$5 where user_id=$1 and client_id=$2 returning *`,[userId,clientId,r.name,r.data_version,r.project_data]))); },
    async batchProjects(userId, items) { return transaction(pool, async (db) => { const out=[]; for(const item of items) out.push(await projectUpsert(db,userId,item)); return out; }); },
    async deleteProject(userId, clientId) { one(await query(`delete from public.projects where user_id=$1 and client_id=$2 returning client_id`,[userId,clientId])); return true; },
    async listPerformers(userId) { return (await query(`select * from public.performers where user_id=$1 order by updated_at desc,client_id`,[userId])).rows.map(deserializePerformerFromServer); },
    createPerformer:performerCreate, upsertPerformer:(u,p)=>performerUpsert(pool,u,p),
    async updatePerformer(userId,clientId,item){const r=buildPerformerRow(userId,{...item,id:clientId});return deserializePerformerFromServer(one(await query(`update public.performers set performer_data=$3 where user_id=$1 and client_id=$2 returning *`,[userId,clientId,r.performer_data])));},
    async batchPerformers(userId,items){return transaction(pool,async(db)=>{const out=[];for(const item of items)out.push(await performerUpsert(db,userId,item));return out;});},
    async deletePerformer(userId,clientId){one(await query(`delete from public.performers where user_id=$1 and client_id=$2 returning client_id`,[userId,clientId]));return true;},
    async listQuickAccess(userId){return {items:(await query(`select * from public.quick_access_items where user_id=$1 order by pinned desc,sort_order,client_id`,[userId])).rows.map(deserializeQuickAccessItemFromServer)};},
    createQuickAccess:quickCreate, upsertQuickAccess:(u,p)=>quickUpsert(pool,u,p),
    async updateQuickAccess(userId,clientId,item){const r=buildQuickAccessRow(userId,{...item,id:clientId});return deserializeQuickAccessItemFromServer(one(await query(`update public.quick_access_items set pinned=$3,sort_order=$4,item_data=$5 where user_id=$1 and client_id=$2 returning *`,[userId,clientId,r.pinned,r.sort_order,r.item_data])));},
    async batchQuickAccess(userId,items){return {items:await transaction(pool,async(db)=>{const out=[];for(const item of items)out.push(await quickUpsert(db,userId,item));return out;})};},
    async deleteQuickAccess(userId,clientId){one(await query(`delete from public.quick_access_items where user_id=$1 and client_id=$2 returning client_id`,[userId,clientId]));return true;},
    async deleteQuickAccessByPerformer(userId,performerId){await query(`delete from public.quick_access_items where user_id=$1 and performer_client_id=$2`,[userId,performerId]);return true;},
    async loadTemplateLibrary(userId){const row=(await query(`select * from public.template_libraries where user_id=$1`,[userId])).rows[0];return row?{exists:true,library:deserializeTemplateLibraryFromServer(row)}:{exists:false,library:deserializeTemplateLibraryFromServer(null)};},
    async upsertTemplateLibrary(userId,library){const v=serializeTemplateLibraryForServer(library);return deserializeTemplateLibraryFromServer(one(await query(`insert into public.template_libraries(user_id,data_version,library_data) values($1,$2,$3) on conflict(user_id) do update set data_version=excluded.data_version,library_data=excluded.library_data returning *`,[userId,v.dataVersion,v])));},
    async deleteTemplateLibrary(userId){one(await query(`delete from public.template_libraries where user_id=$1 returning user_id`,[userId]));return true;},
    async loadAiSettings(userId){const row=(await query(`select * from public.ai_settings where user_id=$1`,[userId])).rows[0];return row?{exists:true,settings:normalizeAiSettings(row)}:{exists:false,settings:normalizeAiSettings(undefined,{defaults:true})};},
    async upsertAiSettings(userId,settings){const v=normalizeAiSettings(settings);const row=one(await query(`insert into public.ai_settings(user_id,personalization,use_project_history,use_studio_templates) values($1,$2,$3,$4) on conflict(user_id) do update set personalization=excluded.personalization,use_project_history=excluded.use_project_history,use_studio_templates=excluded.use_studio_templates returning *`,[userId,v.personalization,v.useProjectHistory,v.useStudioTemplates]));return normalizeAiSettings(row);},
    async loadExportProfile(userId){const row=(await query(`select * from public.studio_export_profiles where user_id=$1`,[userId])).rows[0];return row?{exists:true,profile:row}:{exists:false,profile:null};},
    async getLogoPath(userId){return (await query(`select logo_asset_path from public.studio_export_profiles where user_id=$1`,[userId])).rows[0]?.logo_asset_path??null;},
    async replaceLogoPath(userId,path){return transaction(pool,async(db)=>{const current=(await db.query(`select logo_asset_path from public.studio_export_profiles where user_id=$1 for update`,[userId])).rows[0];if(current){await db.query(`update public.studio_export_profiles set logo_asset_path=$2 where user_id=$1`,[userId,path]);return current.logo_asset_path??null;}await db.query(`insert into public.studio_export_profiles(user_id,logo_asset_path) values($1,$2)`,[userId,path]);return null;});},
    async clearLogoPath(userId){return transaction(pool,async(db)=>{const row=(await db.query(`select logo_asset_path from public.studio_export_profiles where user_id=$1 for update`,[userId])).rows[0];if(!row?.logo_asset_path)return null;await db.query(`update public.studio_export_profiles set logo_asset_path=null where user_id=$1 and logo_asset_path=$2`,[userId,row.logo_asset_path]);return row.logo_asset_path;});},
    async upsertExportProfile(userId,p){return one(await query(`insert into public.studio_export_profiles(user_id,company_name,logo_position,company_position,phone,email,website,default_colors,default_font,default_legal_text) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(user_id) do update set company_name=excluded.company_name,logo_position=excluded.logo_position,company_position=excluded.company_position,phone=excluded.phone,email=excluded.email,website=excluded.website,default_colors=excluded.default_colors,default_font=excluded.default_font,default_legal_text=excluded.default_legal_text returning *`,[userId,p.company_name,p.logo_position,p.company_position,p.phone,p.email,p.website,p.default_colors,p.default_font,p.default_legal_text]));},
    async listPresets(userId){return (await query(`select * from public.export_presets where user_id=$1 order by updated_at desc`,[userId])).rows.map(r=>({id:r.id,name:r.name,settings:presentationSettingsForPreset(r.preset_json),createdAt:r.created_at,updatedAt:r.updated_at}));},
    async createPreset(userId,name,settings){const r=one(await query(`insert into public.export_presets(user_id,name,preset_json) values($1,$2,$3) returning *`,[userId,name,presentationSettingsForPreset(settings)]));return {id:r.id,name:r.name,settings:presentationSettingsForPreset(r.preset_json),createdAt:r.created_at,updatedAt:r.updated_at};},
    async updatePreset(userId,id,name,settings){const r=one(await query(`update public.export_presets set name=$3,preset_json=$4 where user_id=$1 and id=$2 returning *`,[userId,id,name,presentationSettingsForPreset(settings)]));return {id:r.id,name:r.name,settings:presentationSettingsForPreset(r.preset_json),createdAt:r.created_at,updatedAt:r.updated_at};},
    async deletePreset(userId,id){one(await query(`delete from public.export_presets where user_id=$1 and id=$2 returning id`,[userId,id]));return true;},
    async trackEvent(userId,eventType,meta,metadata){return one(await query(`insert into public.product_events(user_id,event_type,request_id,session_id,metadata) values($1,$2,$3,$4,$5) returning id,event_type,created_at`,[userId,eventType,meta.requestId,meta.sessionId,metadata]));},
    async getFlags(userId){return (await query(`select * from public.user_flags where user_id=$1`,[userId])).rows[0]||null;},
    async markBetaWelcomeSeen(userId){return one(await query(`insert into public.user_flags(user_id,beta_welcome_seen) values($1,true) on conflict(user_id) do update set beta_welcome_seen=true returning *`,[userId]));},
    async insertFeedback(userId,value){await query(`insert into public.beta_feedback(user_id,message,context,project_id,sheet_id) values($1,$2,$3,$4,$5)`,[userId,value.message,value.context,value.projectId,value.sheetId]);return {ok:true};},
    async listLegalAcceptances(userId){return (await query(`select document_key,version,accepted_at,revoked_at from public.user_legal_acceptances where user_id=$1 order by accepted_at desc`,[userId])).rows;},
    async acceptLegalDocument(userId,documentKey,version){return one(await query(`insert into public.user_legal_acceptances(user_id,document_key,version,revoked_at) values($1,$2,$3,null) on conflict(user_id,document_key,version) do update set accepted_at=now(),revoked_at=null returning document_key,version,accepted_at,revoked_at`,[userId,documentKey,version]));},
    async revokeLegalDocument(userId,documentKey,version){return transaction(pool,async(db)=>{const row=one(await db.query(`update public.user_legal_acceptances set revoked_at=now() where user_id=$1 and document_key=$2 and version=$3 and revoked_at is null returning document_key,version,accepted_at,revoked_at`,[userId,documentKey,version]));await db.query(`delete from public.ai_feedback_samples as sample using public.projects as project where sample.project_id=project.id and project.user_id=$1`,[userId]);return row;});},
    async applyAiFeedback(userId,{projectId,operation,aiRequestId,beforeProject,aiProject}){return transaction(pool,async(db)=>{if(!await hasImprovementConsent(db,userId))return {collected:false};const owned=await projectRow(db,userId,projectId);if(!owned)return {collected:false};await updateActiveSample(db,userId,projectId,beforeProject,true);const snapshot=feedbackProjection(aiProject);const row=one(await db.query(`insert into public.ai_feedback_samples(project_id,operation,ai_request_id,ai_snapshot) values($1,$2,$3,$4) returning id`,[owned.id,operation,aiRequestId||null,snapshot]));return {collected:true,id:row.id};});},
    async updateAiFeedback(userId,{projectId,project}){const value=await transaction(pool,(db)=>updateActiveSample(db,userId,projectId,project,false));return {updated:Boolean(value)};},
    async finalizeAiFeedback(userId,{projectId,project}){const value=await transaction(pool,(db)=>updateActiveSample(db,userId,projectId,project,true));return {finalized:Boolean(value)};},
  };
}
