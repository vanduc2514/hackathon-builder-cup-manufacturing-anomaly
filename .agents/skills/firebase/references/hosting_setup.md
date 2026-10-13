# Firebase Hosting & Cloud Run API Proxy Guide

This reference covers deploying the two React + Vite frontends to Firebase Hosting as two sites in one Firebase project, with API rewrites to the Cloud Run backend:

- `apps/web`: Plant Ops dashboard → site `${GCP_PROJECT_ID}-web`, target `web`
- `apps/mobile`: technician mobile app → site `${GCP_PROJECT_ID}-mobile`, target `mobile`

## 1. Sites and targets (`.firebaserc`)

```bash
firebase hosting:sites:create "${GCP_PROJECT_ID}-web"
firebase hosting:sites:create "${GCP_PROJECT_ID}-mobile"
firebase target:apply hosting web "${GCP_PROJECT_ID}-web"
firebase target:apply hosting mobile "${GCP_PROJECT_ID}-mobile"
```

Resulting `.firebaserc`:

```json
{
  "projects": { "default": "<GCP_PROJECT_ID>" },
  "targets": {
    "<GCP_PROJECT_ID>": {
      "hosting": {
        "web": ["<GCP_PROJECT_ID>-web"],
        "mobile": ["<GCP_PROJECT_ID>-mobile"]
      }
    }
  }
}
```

## 2. Firebase Hosting configuration (`firebase.json`)

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

## 3. Build & deploy workflow

```bash
mise run build                            # apps/web/dist + apps/mobile/dist
firebase deploy --only hosting:web        # Plant Ops dashboard
firebase deploy --only hosting:mobile     # technician mobile app
```

## 4. Streaming limitation

Firebase Hosting requests to Cloud Run time out after 60 seconds, and Hosting rewrites do not carry server-sent events or WebSocket upgrades. The SSE routes (`/api/incidents/stream`, `/api/incidents/events`) and the Gemini Live WebSocket (`/api/gemini-live/ws`) therefore cannot go through the `/api/**` rewrite. They must connect directly to the Cloud Run URL, which needs a stream origin setting in the apps and CORS on the backend. See [`docs/deployment-frontend.md`](../../../../docs/deployment-frontend.md) for the required follow-up before deploying.

## 5. Local development vs production parity

- **Local dev:** each app's Vite dev server proxies `/api/**` to `$API_PROXY_TARGET` (default `http://localhost:8000`, set in `mise.toml`). The mobile proxy also forwards WebSockets.
- **Production:** Firebase Hosting rewrites `/api/**` to the Cloud Run service `kaizen-backend`; streaming routes go direct (see above).
- **Key Invariant 5:** frontend code must use relative paths (e.g. `fetch('/api/incidents/current')`) and never hardcode hostnames.
