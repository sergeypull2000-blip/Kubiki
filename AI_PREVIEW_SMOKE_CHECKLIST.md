# AI Preview smoke-checklist

Run this checklist only on the authenticated Vercel Preview environment after the `ai_settings` migration and RLS have been verified manually on `kubiki-dev`.

## Preparation

- Confirm the deployment is from `develop`, not `main` or Production.
- Confirm `DEEPSEEK_API_KEY`, Supabase URL and publishable key are configured only for Preview.
- Sign in as test user A and wait until project, template, Performer and AI settings hydration has completed.
- Keep browser Network tools open and enable “Preserve log”.

## Text brief

- Generate from a short Russian text brief without studio knowledge matches.
- Confirm the preview contains Stage → Task data and no automatically assigned Performer.
- Confirm accepting the preview creates a normal Project and existing financial calculations still work.
- Reload the page and confirm the project persists.

## Retrieval and personalization

- Add a uniquely named Project/Stage/Task template and a Performer with a matching role.
- Generate a matching brief and confirm the estimate remains relevant to the current brief.
- Confirm the Project shows one compact “Использованы знания студии” line after acceptance and after reload.
- Confirm no phone, email, Telegram, notes, `exportSettings`, tax data or full library appears in request payloads/logs.
- Configure AI personalization, generate again and confirm it affects decomposition without overriding explicit brief requirements.
- Disable history and confirm no historical project query is made; enable it explicitly and confirm only a bounded shortlist is used.

## Word

- Upload a text-based `.docx` under 3 MB; confirm extraction happens in the browser and `/api/generate-estimate` receives plain text only.
- Add a current instruction beside the Word brief and confirm it is applied separately.
- Upload a valid legacy `.doc`; confirm only `/api/extract-doc` receives its binary payload and the generation endpoint receives plain text.
- Upload a damaged/unsupported `.doc`; confirm the UI recommends resaving as `.docx`.
- Confirm no Word file is stored in Supabase, localStorage or the resulting Project.

## Failure paths

- Submit an empty brief and an over-limit brief; confirm actionable validation messages.
- Simulate the analysis request failing and confirm final generation still works with deterministic profile fallback.
- Simulate no retrieval matches and confirm generation still works with an empty shortlist.
- Simulate Supabase knowledge/settings read failure and confirm generation continues with safe empty/default context.
- Simulate timeout, 429, 502 and invalid final JSON; confirm bounded retry/repair and safe user-facing errors.
- Expire the session and confirm AI endpoints return 401 without sending a DeepSeek request.

## Regression

- Import an existing Excel/PDF estimate.
- Open, edit, autosave and reload an existing Project.
- Create and reuse Project, Stage and Task templates.
- Create/edit a Performer and use Quick Access manually.
- Export the current Project and confirm finance, taxes, markup and export settings are unchanged.
