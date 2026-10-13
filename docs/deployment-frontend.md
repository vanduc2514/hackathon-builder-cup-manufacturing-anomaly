# Frontend Deployment (Firebase Hosting)

Status: **automated.** Terraform (`infra/terraform/firebase.tf`) creates both Hosting sites, `firebase.json` defines the targets, and `mise run deploy:frontend` (or `deploy:web` / `deploy:mobile`) builds and deploys. Streams bypass Hosting and go straight to Cloud Run (see below).

## Target topology

One Firebase project (`$GCP_PROJECT_ID`) with two Hosting sites:

| App | Source | Build output | Hosting site | Target |
|---|---|---|---|---|
| Plant Ops dashboard | `apps/web` | `apps/web/dist` | `kaizen-lab-web` | `web` |
| Technician mobile app | `apps/mobile` | `apps/mobile/dist` | `kaizen-lab-mobile` | `mobile` |

Sites are created by `mise run infra:apply` (`google_firebase_hosting_site.apps`; `<TF_VAR_global_prefix>-web` / `-mobile`, prefix `kaizen-lab` set in `mise.toml`). `mise run firebase:targets` writes a local, gitignored `.firebaserc` mapping the `web` / `mobile` targets to the sites from `terraform output hosting_sites`.

`firebase.json` (repo root) rewrites `/api/**` (both sites) and `/health` (web only) to Cloud Run `kaizen-backend` in `asia-southeast1`, falls back to `/index.html`, and caches `/assets/**` immutably.

Deploy: `mise run deploy:frontend` runs `deploy:web` and `deploy:mobile`; each installs npm deps, builds the app with `VITE_STREAM_ORIGIN` set to `terraform output service_url`, then runs `firebase deploy --only hosting:<target>`.

## Backend link

The backend is the Terraform-managed Cloud Run service `kaizen-backend` in `asia-southeast1` (`infra/terraform/cloud_run.tf`; image rolled by `mise run deploy:backend`). The `/api/**` rewrite above keeps every REST call relative, which satisfies Key Invariant #5 in `AGENTS.md`.

## Streaming routes bypass Hosting

Firebase Hosting requests to Cloud Run are subject to a **60-second request timeout** ([Firebase Hosting serverless overview](https://firebase.google.com/docs/hosting/serverless-overview)), and Hosting rewrites do not carry server-sent events or WebSocket upgrades ([Hosting + Cloud Run guide](https://firebase.google.com/docs/hosting/cloud-run), [firebase-talk thread](https://groups.google.com/g/firebase-talk/c/OaLXVN50hfM)). Cloud Run itself supports both: Terraform configures a 3600 s request timeout and session affinity.

Streaming routes therefore connect to the Cloud Run origin directly:

- `/api/incidents/stream` and `/api/incidents/events` (SSE, both apps): `streamUrl()` in `apps/web/src/lib/api.ts` and `apps/mobile/src/api/kaizenApi.ts`.
- `/api/gemini-live/ws` (WebSocket, mobile): `geminiLiveSocketUrl()` in `apps/mobile/src/api/kaizenApi.ts` switches `https://` to `wss://`.

Both read the build-time `VITE_STREAM_ORIGIN`. It is unset in dev, so URLs stay relative and go through the Vite proxy. Cross-origin `EventSource` needs CORS: Cloud Run gets `CORS_ORIGINS` (each site's `.web.app` and `.firebaseapp.com` origin, `local.cors_origins` in `infra/terraform/locals.tf`), and `backend/api/main.py` adds `CORSMiddleware` for those origins only when the setting is non-empty. WebSockets are not subject to CORS.

REST calls, including the web app's `/health` ping, stay relative and go through the Hosting rewrite (Key Invariant #5).
