import { ApiError, badRequest } from "./apiErrors.js";
import { batch, boolean, id, jsonObject, object, text, uuid } from "./validation.js";
import { normalizePresentationSettings } from "../src/exportSettings.js";

const EVENTS = new Set(["signup", "session_active", "ai_generate", "ai_edit", "export_completed"]);
const LEGAL_DOCUMENTS = new Set(["beta_terms", "personal_data_consent", "ai_disclosure"]);
const ownershipFields = ["user_id", "userId", "owner", "owner_id"];
const cleanObject = (value) => { const result=object(value); if (ownershipFields.some((key)=>Object.hasOwn(result,key))) throw badRequest("ownership_field_not_allowed"); return result; };
const payload = (request) => cleanObject(request.body);
const itemPayload = (request) => cleanObject(payload(request).item ?? payload(request));
const itemsPayload = (request) => batch(payload(request).items).map(cleanObject);
const boundedObject = (value, max = 16_000) => { const result=jsonObject(value ?? {}); if(Buffer.byteLength(JSON.stringify(result))>max) throw badRequest("json_object_too_large"); return result; };
const response = (status, body) => ({ status, body });

export function matchOwnerApiRoute(method, pathname) {
  const exact = {
    "GET /api/projects": r=>r.listProjects,
    "POST /api/projects": r=>r.createProject,
    "POST /api/projects/batch": r=>r.batchProjects,
    "GET /api/performers": r=>r.listPerformers,
    "POST /api/performers": r=>r.createPerformer,
    "POST /api/performers/batch": r=>r.batchPerformers,
    "GET /api/quick-access-items": r=>r.listQuickAccess,
    "POST /api/quick-access-items": r=>r.createQuickAccess,
    "POST /api/quick-access-items/batch": r=>r.batchQuickAccess,
    "GET /api/template-library": r=>r.loadTemplateLibrary,
    "PUT /api/template-library": r=>r.upsertTemplateLibrary,
    "DELETE /api/template-library": r=>r.deleteTemplateLibrary,
    "GET /api/ai-settings": r=>r.loadAiSettings,
    "PUT /api/ai-settings": r=>r.upsertAiSettings,
    "GET /api/export-profile": r=>r.loadExportProfile,
    "PUT /api/export-profile": r=>r.upsertExportProfile,
    "GET /api/export-presets": r=>r.listPresets,
    "POST /api/export-presets": r=>r.createPreset,
    "POST /api/product-events": r=>r.trackEvent,
    "GET /api/user-flags": r=>r.getFlags,
    "PUT /api/user-flags/beta-welcome-seen": r=>r.markBetaWelcomeSeen,
    "POST /api/beta-feedback": r=>r.insertFeedback,
    "GET /api/legal-acceptances": r=>r.listLegalAcceptances,
    "POST /api/legal-acceptances": r=>r.acceptLegalDocument,
  };
  if (exact[`${method} ${pathname}`]) return { name: `${method} ${pathname}` };
  const patterns = [
    ["projects","project"],["performers","performer"],["quick-access-items","quick"],["export-presets","preset"],
  ];
  for(const [segment,type] of patterns){const m=pathname.match(new RegExp(`^/api/${segment}/([^/]+)$`));if(m&&["PUT","DELETE"].includes(method))return {name:`${method} ${type}`,param:decodeURIComponent(m[1])};}
  const by=pathname.match(/^\/api\/quick-access-items\/by-performer\/([^/]+)$/);if(by&&method==="DELETE")return{name:"DELETE quickByPerformer",param:decodeURIComponent(by[1])};
  return null;
}

export async function handleOwnerApiRoute(route, request, repository, userId) {
  const p = route.param && id(route.param), name=route.name;
  if(name==="GET /api/projects") return response(200,await repository.listProjects(userId));
  if(name==="POST /api/projects") return response(201,await repository.createProject(userId,itemPayload(request)));
  if(name==="PUT project") return response(200,await repository.updateProject(userId,p,itemPayload(request)));
  if(name==="POST /api/projects/batch") return response(200,await repository.batchProjects(userId,itemsPayload(request)));
  if(name==="DELETE project") return response(200,{ok:await repository.deleteProject(userId,p)});
  if(name==="GET /api/performers") return response(200,await repository.listPerformers(userId));
  if(name==="POST /api/performers") return response(201,await repository.createPerformer(userId,itemPayload(request)));
  if(name==="PUT performer") return response(200,await repository.updatePerformer(userId,p,itemPayload(request)));
  if(name==="POST /api/performers/batch") return response(200,await repository.batchPerformers(userId,itemsPayload(request)));
  if(name==="DELETE performer") return response(200,{ok:await repository.deletePerformer(userId,p)});
  if(name==="GET /api/quick-access-items") return response(200,await repository.listQuickAccess(userId));
  if(name==="POST /api/quick-access-items") return response(201,await repository.createQuickAccess(userId,itemPayload(request)));
  if(name==="PUT quick") return response(200,await repository.updateQuickAccess(userId,p,itemPayload(request)));
  if(name==="POST /api/quick-access-items/batch") return response(200,await repository.batchQuickAccess(userId,itemsPayload(request)));
  if(name==="DELETE quick") return response(200,{ok:await repository.deleteQuickAccess(userId,p)});
  if(name==="DELETE quickByPerformer") return response(200,{ok:await repository.deleteQuickAccessByPerformer(userId,p)});
  if(name==="GET /api/template-library") return response(200,await repository.loadTemplateLibrary(userId));
  if(name==="PUT /api/template-library") return response(200,await repository.upsertTemplateLibrary(userId,boundedObject(payload(request).library??payload(request),500_000)));
  if(name==="DELETE /api/template-library") return response(200,{ok:await repository.deleteTemplateLibrary(userId)});
  if(name==="GET /api/ai-settings") return response(200,await repository.loadAiSettings(userId));
  if(name==="PUT /api/ai-settings"){const v=payload(request);if(Object.hasOwn(v,"useProjectHistory"))boolean(v.useProjectHistory);if(Object.hasOwn(v,"useStudioTemplates"))boolean(v.useStudioTemplates);text(v.personalization??"",{min:0,max:8000});return response(200,await repository.upsertAiSettings(userId,v));}
  if(name==="GET /api/export-profile") return response(200,await repository.loadExportProfile(userId));
  if(name==="PUT /api/export-profile"){const raw=payload(request).profile??payload(request), s=normalizePresentationSettings({branding:raw});const profile={company_name:s.branding.companyName,logo_position:s.branding.logoPosition,company_position:s.branding.companyPosition,phone:s.branding.phone,email:s.branding.email,website:s.branding.website,default_colors:s.branding.colors,default_font:s.branding.fontFamily,default_legal_text:boundedObject(raw.defaultLegalText??{},16000)};return response(200,await repository.upsertExportProfile(userId,profile));}
  if(name==="GET /api/export-presets")return response(200,await repository.listPresets(userId));
  if(name==="POST /api/export-presets"){const v=payload(request);return response(201,await repository.createPreset(userId,text(v.name,{max:120}),boundedObject(v.settings,100_000)));}
  if(name==="PUT preset"){const v=payload(request);return response(200,await repository.updatePreset(userId,uuid(p),text(v.name,{max:120}),boundedObject(v.settings,100_000)));}
  if(name==="DELETE preset")return response(200,{ok:await repository.deletePreset(userId,uuid(p))});
  if(name==="POST /api/product-events"){const v=payload(request),eventType=text(v.eventType??v.event_type,{max:64});if(!EVENTS.has(eventType))throw badRequest("invalid_event_type");const meta=object(v.meta??{});return response(201,await repository.trackEvent(userId,eventType,{requestId:text(meta.requestId??"",{min:0,max:200,nullable:true}),sessionId:text(meta.sessionId??"",{min:0,max:200,nullable:true})},boundedObject(v.metadata??{},16000)));}
  if(name==="GET /api/user-flags")return response(200,await repository.getFlags(userId));
  if(name==="PUT /api/user-flags/beta-welcome-seen")return response(200,await repository.markBetaWelcomeSeen(userId));
  if(name==="POST /api/beta-feedback"){const v=payload(request);return response(201,await repository.insertFeedback(userId,{message:text(v.message,{max:4000}),context:text(v.context??"",{min:0,max:1000,nullable:true}),projectId:text(v.projectId??v.project_id??"",{min:0,max:200,nullable:true}),sheetId:text(v.sheetId??v.sheet_id??"",{min:0,max:200,nullable:true})}));}
  if(name==="GET /api/legal-acceptances")return response(200,{acceptances:await repository.listLegalAcceptances(userId)});
  if(name==="POST /api/legal-acceptances"){const v=payload(request),documentKey=text(v.documentKey??v.document_key,{max:64}),version=text(v.version,{max:32});if(!LEGAL_DOCUMENTS.has(documentKey))throw badRequest("invalid_document_key");return response(201,await repository.acceptLegalDocument(userId,documentKey,version));}
  throw new ApiError(404,"not_found");
}
