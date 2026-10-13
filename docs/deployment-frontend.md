# Frontend Deployment (Firebase Hosting)

Status: **not yet automated.** This document records the target topology and the constraints that must be resolved before `apps/web` and `apps/mobile` are deployed. There is no `firebase.json`, `.firebaserc` or `deploy:web` / `deploy:mobile` task in the repo yet.

## Target topology

One Firebase project (`$GCP_PROJECT_ID`) with two Hosting sites:

| App | Source | Build output | Hosting site | Target |
|---|---|---|---|---|
| Plant Ops dashboard | `apps/web` | `apps/web/dist` | `${GCP_PROJECT_ID}-web` | `web` |
| Technician mobile app | `apps/mobile` | `apps/mobile/dist` | `${GCP_PROJECT_ID}-mobile` | `mobile` |

Create the sites and map them to deploy targets:

```bash
firebase hosting:sites:create "${GCP_PROJECT_ID}-web"
firebase hosting:sites:create "${GCP_PROJECT_ID}-mobile"
firebase target:apply hosting web "${GCP_PROJECT_ID}-web"
firebase target:apply hosting mobile "${GCP_PROJECT_ID}-mobile"
```

`firebase.json` (repo root):

```json
{
  "hosting": [
    {
      "target": "web",
      "public": "apps/web/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        { "source": "/api/**", "run": { "serviceId": "kaizen-backend", "region": "asia-southeast1" } },
        { "source": "/health", "run": { "serviceId": "kaizen-backend", "region": "asia-southeast1" } },
        { "source": "**", "destination": "/index.html" }
      ]
    },
    {
      "target": "mobile",
      "public": "apps/mobile/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [
        { "source": "/api/**", "run": { "serviceId": "kaizen-backend", "region": "asia-southeast1" } },
        { "source": "**", "destination": "/index.html" }
      ]
    }
  ]
}
```

Build both apps with `mise run build`, then deploy with `firebase deploy --only hosting:web` / `firebase deploy --only hosting:mobile`.

## Backend link

The backend is the Cloud Run service `kaizen-backend` in `asia-southeast1` (defaults in `scripts/deploy_cloud_run.sh`, deployed with `mise run deploy:backend`). The `/api/**` rewrite above keeps every REST call relative, which satisfies Key Invariant #5 in `AGENTS.md`.

## Blocking constraint: streaming routes

Firebase Hosting requests to Cloud Run are subject to a **60-second request timeout** ([Firebase Hosting serverless overview](https://firebase.google.com/docs/hosting/serverless-overview)), and Hosting rewrites do not carry server-sent events or WebSocket upgrades ([Hosting + Cloud Run guide](https://firebase.google.com/docs/hosting/cloud-run), [firebase-talk thread](https://groups.google.com/g/firebase-talk/c/OaLXVN50hfM)). Cloud Run itself supports both: the backend is already deployed with `--timeout=3600` and `--session-affinity`.

Routes affected by the rewrite path:

- `/api/incidents/stream` and `/api/incidents/events`: SSE, used by both apps.
- `/api/gemini-live/ws`: WebSocket, used by the mobile app. Its URL is built from `window.location.host` in `apps/mobile/src/api/kaizenApi.ts`, so behind Hosting it would hit the Hosting domain.
- `/health`: not under `/api`, so the web app's health ping needs its own rewrite (included above).

## Required follow-up before deploying

1. Add a build-time `VITE_STREAM_ORIGIN` (empty in dev). SSE and WebSocket URLs use it so they go directly to the Cloud Run URL; plain REST calls stay relative and go through the Hosting rewrite.
2. Add FastAPI `CORSMiddleware` with origins from a `CORS_ORIGINS` setting. Cross-origin `EventSource` requests need CORS; `backend/api/main.py` has none today.
3. Amend Key Invariant #5 in `AGENTS.md` to allow that single stream origin.
4. Keep the `/health` rewrite for the web site.
5. Add mise tasks `deploy:web` / `deploy:mobile` running `firebase deploy --only hosting:<target>`, each depending on `<app>:build`.
6. Add `https://${GCP_PROJECT_ID}-web.web.app` and `https://${GCP_PROJECT_ID}-mobile.web.app` to the GCS bucket CORS origins (`.agents/skills/google-cloud-storage/SKILL.md`).
