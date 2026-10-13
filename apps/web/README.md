# Kaizen Agent — Plant Ops Dashboard

React + Vite + TypeScript dashboard for shift leaders / plant ops.
Runs on **http://localhost:3000** and shares the FastAPI backend (`:8000`) with the
technician mobile app in `../mobile` (`:3001`).

```bash
npm install
npm run dev        # or from repo root: mise run web
```

`src/types/index.ts` mirrors `backend/core/models.py` — keep it in sync with
`apps/mobile/src/types/index.ts` when backend models change.
