# Kaizen Agent — Plant Ops Dashboard

React + Vite + TypeScript dashboard for shift leaders / plant ops.
Runs on **http://localhost:3001** and shares the FastAPI backend (`:8000`) with the
technician mobile app in `../frontend` (`:3000`).

```bash
npm install
npm run dev        # or from repo root: mise run dashboard
```

`src/types/index.ts` mirrors `backend/core/models.py` — keep it in sync with
`frontend/src/types/index.ts` when backend models change.
