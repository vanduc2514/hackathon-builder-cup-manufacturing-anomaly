# Firebase Hosting & Cloud Run API Proxy Guide

This reference provides instructions for deploying the React + Vite dashboard (`frontend/`) to Firebase Hosting and configuring API rewrites to Cloud Run.

## 1. Firebase Hosting Configuration (`firebase.json`)

Ensure `firebase.json` at project root (or inside `frontend/`) has rewrite rules configured to proxy `/api/**` calls directly to the Cloud Run backend:

```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "kaizen-backend",
          "region": "asia-southeast1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## 2. Build & Deploy Workflow

### Step 1: Build the Frontend
```bash
# Via mise
mise run build:frontend

# Or directly in frontend directory
cd frontend && npm run build
```
This produces optimized production assets in `frontend/dist/`.

### Step 2: Deploy to Firebase Hosting
```bash
npx -y firebase-tools@latest deploy --only hosting --project kaizen-agent-prod
```

## 3. Local Development vs Production Parity

- **In Local Dev:** The Vite dev server proxies `/api/**` to `localhost:8000` via the frontend Vite proxy configuration.
- **In Production:** Firebase Hosting rewrites `/api/**` to the managed Cloud Run service `kaizen-backend`.
- **Key Invariant 5:** Frontend code must always use relative paths (e.g. `fetch('/api/incidents')`) and never hardcode hostnames.
