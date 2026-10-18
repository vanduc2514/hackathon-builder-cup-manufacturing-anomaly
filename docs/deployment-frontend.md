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
- `/api/factory/stream` (SSE, web Digital Twin): `useFactoryStream()` in `apps/web/src/hooks/useFactoryStream.ts` connects directly to the factory service origin (`VITE_FACTORY_STREAM_ORIGIN`) without proxying through backend; the login JWT rides along as `?token=` via `withToken` (the prod factory service returns 401 without it). In dev, Vite proxies `/api/factory` to `FACTORY_PROXY_TARGET` (`http://localhost:8010`). If the factory is offline, the UI shows a standby indicator without crashing.

Both read the build-time `VITE_STREAM_ORIGIN`. It is unset in dev, so URLs stay relative and go through the Vite proxy. Cross-origin `EventSource` needs CORS: Cloud Run gets `CORS_ORIGINS` (each site's `.web.app` and `.firebaseapp.com` origin, `local.cors_origins` in `infra/terraform/locals.tf`), and `backend/api/main.py` adds `CORSMiddleware` for those origins only when the setting is non-empty. WebSockets are not subject to CORS.

Streams cannot send an `Authorization` header, so `withToken()` (`apps/web/src/lib/auth.ts`, `apps/mobile/src/api/auth.ts`) appends the login token as `?token=`. REST calls send `Authorization: Bearer` through the Hosting rewrite.

REST calls, including the web app's `/health` ping, stay relative and go through the Hosting rewrite (Key Invariant #5).

## Backend → Factory auth (TKT-073 / #288)

The backend's `FactorySimulatorClient` (`backend/tools/factory_client.py`) authenticates every call to the factory service with a Bearer JWT minted by the central backend's own `/api/auth/login` endpoint. The factory service gates `POST /api/factory/inject` and `POST /api/factory/reset` on the same HS256 JWT verification used by every other `/api` route in the platform (`simulator/auth.py`); the factory UI sends the signed-in user's token the same way. The legacy shared `X-API-Key` is removed everywhere (code, `FACTORY_API_KEY` env vars, `random_password.factory_api_key`).

Configuration lives in `infra/terraform/cloud_run.tf` (backend Cloud Run) and `infra/terraform/factory.tf` (factory Cloud Run). After this change:

- Backend Cloud Run env vars (added): `BACKEND_PUBLIC_URL` (the deployed backend URL, so the client can call itself), `FACTORY_OPERATOR_ACCOUNT`, `FACTORY_OPERATOR_PASSWORD` (a low-privilege `AUTH_USERS` entry, set via `TF_VAR_factory_operator_account` / `TF_VAR_factory_operator_password` in `mise.local.toml`).
- Factory Cloud Run env vars: `AUTH_SECRET` (same `random_password.auth_secret` resource as the backend, so a JWT issued by `/api/auth/login` verifies here). Production without it fails closed with 503.
- Firebase Hosting rewrites (`firebase.json`, target `factory`): an `/api/auth/**` rule is added before `/api/**`, pointing to `kaizen-backend`, so the operator login from the factory UI (if added later) hits the backend rather than the factory service.

The client caches the Bearer token in-process, reuses it across calls, and refreshes it exactly once on a 401 before failing (`backend/tools/factory_client.py`). Login failure or missing operator credentials are skipped gracefully — `factory_client` returns `FactorySyncResult(skipped=True, error="bearer_unavailable")` rather than raising, so callers degrade quietly.

Applying Terraform after this change destroys `random_password.factory_api_key` and drops the `FACTORY_API_KEY` env var from the backend service; nothing reads either any more.

## `?pwd=` prefill on login URLs

All three deployed surfaces honour a one-shot `?pwd=<technician-password>` query parameter so operators can hand a deep link straight into the technician app on a phone:

- Web (`kaizen-lab-web`) — `takeLoginPrefill()` in `apps/web/src/lib/auth.ts`.
- Mobile (`kaizen-lab-mobile`) — `takeLoginPrefill()` in `apps/mobile/src/api/auth.ts`.
- Factory demo (`kaizen-lab-demo`, planned in #288) — same parser.

`takeLoginPrefill()` reads `?pwd=` once, immediately strips it via `history.replaceState`, and feeds it into the login form's initial password state. The prefill triggers an auto-submit once the technician account resolves. The password is consumed on read; `window.location.search` is rewritten before the URL is persisted anywhere (browser history, logs, referrers) and the value is never written to `localStorage` / `sessionStorage`. After submit, the user lands on the same screen with `window.location.search === ''`. Without `?pwd=` the screens behave exactly as before (empty password, manual submit).
