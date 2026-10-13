# Kaizen Agent — Technician Mobile App

React + Vite + TypeScript mobile app for the specialist who repairs the machine. It is the technician-side companion to the plant dashboard in `frontend/`.

## Development

```bash
cd app_frontend
npm install
npm run dev        # Vite dev server on :3000
npm run typecheck  # tsc --noEmit
npm run build      # tsc + vite build -> dist/
```

`/api/*` is proxied to the FastAPI backend at `http://localhost:8000` (see `vite.config.ts`). Always use relative URLs in code. Start the backend first (`mise run backend`) to get live incident updates.

## Layout

```
src/
├── App.tsx                      # Opens the incident stream, renders the device frame
├── api/kaizenApi.ts             # fetch wrappers for /api/* (relative URLs)
├── hooks/
│   ├── useIncidentStream.ts     # SSE + snapshot, reconnect, connection state
│   ├── useTelemetry.ts          # /api/telemetry/baseline + /history for the suspect machine
│   ├── useGeminiLive.ts         # Technician Copilot over WS /api/gemini-live/ws
│   └── useCamera.ts             # getUserMedia rear camera + frame grab
├── types/
│   ├── index.ts                 # Backend model mirrors (IncidentState, ...)
│   └── mobile.ts                # App-only types (WorkOrder, EvidenceItem, ...)
└── components/mobile/
    ├── MobileApp.tsx            # Shell: tabs, Work List navigation stack, shared state
    ├── mobileData.ts            # Demo data + buildLiveOrder() (incident → work order)
    ├── oemRepairManuals.ts      # Copy of the backend OEM repair checkpoints
    ├── MobileWork*.tsx          # Work List and status screens
    ├── MobileEvidence*.tsx      # Field evidence request and capture
    ├── MobileFix*.tsx           # Repair brief and live repair guide
    └── mobile.css
```

## Backend connection (current state)

- Reads: `GET /api/incidents/current`, SSE `/api/incidents/stream` (alternates with `/events`), `/api/telemetry/baseline`, `/api/telemetry/history`, `/api/gemini-live/status|session|sessions` and `WS /api/gemini-live/ws` (the Vite proxy has `ws: true`).
- Writes: `POST /api/incidents/evidence`, only while the incident is `awaiting_evidence`.
- The live incident is its own work order (badge Live). Demo orders (badge Demo), the AI Helper and settings are local only.
- Full gap list: [BACKEND_FRONTEND_GAPS.md](BACKEND_FRONTEND_GAPS.md).

## Design docs

- [mobile_design.md](mobile_design.md) — technician app screens and backend needs
- [web_design.md](web_design.md) — desktop dashboard design
- `.stitch/` — Stitch design exports (screens, HTML, PNG)
