# Frontend Deployment (Firebase Hosting)

Status: **infrastructure and deploy tasks automated; streaming routes still blocked** (see below). Terraform (`infra/terraform/firebase.tf`) creates both Hosting sites, `firebase.json` defines the targets, and `mise run deploy:frontend` (or `deploy:web` / `deploy:mobile`) builds and deploys.

## Target topology

One Firebase project (`$GCP_PROJECT_ID`) with two Hosting sites:

| App | Source | Build output | Hosting site | Target |
|---|---|---|---|---|
| Plant Ops dashboard | `apps/web` | `apps/web/dist` | `${GCP_PROJECT_ID}-web` | `web` |
| Technician mobile app | `apps/mobile` | `apps/mobile/dist` | `${GCP_PROJECT_ID}-mobile` | `mobile` |

Sites are created by `mise run infra:apply` (`google_firebase_hosting_site.apps`; override the `${GCP_PROJECT_ID}` prefix with the `hosting_site_prefix` variable). `mise run firebase:targets` writes a local, gitignored `.firebaserc` mapping the `web` / `mobile` targets to the sites from `terraform output hosting_sites`.

`firebase.json` (repo root) rewrites `/api/**` (both sites) and `/health` (web only) to Cloud Run `kaizen-backend` in `asia-southeast1`, falls back to `/index.html`, and caches `/assets/**` immutably.

Deploy: `mise run deploy:frontend` runs `deploy:web` and `deploy:mobile`; each installs npm deps, runs `<app>:build`, then `firebase deploy --only hosting:<target>`.

## Backend link

The backend is the Terraform-managed Cloud Run service `kaizen-backend` in `asia-southeast1` (`infra/terraform/cloud_run.tf`; image rolled by `mise run deploy:backend`). The `/api/**` rewrite above keeps every REST call relative, which satisfies Key Invariant #5 in `AGENTS.md`.

## Blocking constraint: streaming routes

Firebase Hosting requests to Cloud Run are subject to a **60-second request timeout** ([Firebase Hosting serverless overview](https://firebase.google.com/docs/hosting/serverless-overview)), and Hosting rewrites do not carry server-sent events or WebSocket upgrades ([Hosting + Cloud Run guide](https://firebase.google.com/docs/hosting/cloud-run), [firebase-talk thread](https://groups.google.com/g/firebase-talk/c/OaLXVN50hfM)). Cloud Run itself supports both: Terraform configures a 3600 s request timeout and session affinity.

Routes affected by the rewrite path:

- `/api/incidents/stream` and `/api/incidents/events`: SSE, used by both apps.
- `/api/gemini-live/ws`: WebSocket, used by the mobile app. Its URL is built from `window.location.host` in `apps/mobile/src/api/kaizenApi.ts`, so behind Hosting it would hit the Hosting domain.
- `/health`: not under `/api`, so the web app's health ping needs its own rewrite (included above).

## Required follow-up for streaming

1. Add a build-time `VITE_STREAM_ORIGIN` (empty in dev). SSE and WebSocket URLs use it so they go directly to the Cloud Run URL; plain REST calls stay relative and go through the Hosting rewrite.
2. Add FastAPI `CORSMiddleware` with origins from a `CORS_ORIGINS` setting (`terraform output hosting_urls`). Cross-origin `EventSource` requests need CORS; `backend/api/main.py` has none today.
3. Amend Key Invariant #5 in `AGENTS.md` to allow that single stream origin.
4. Add `https://${GCP_PROJECT_ID}-web.web.app` and `https://${GCP_PROJECT_ID}-mobile.web.app` to the GCS bucket CORS origins (`.agents/skills/google-cloud-storage/SKILL.md`).
