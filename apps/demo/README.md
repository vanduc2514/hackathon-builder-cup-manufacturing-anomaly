# apps/demo — 3D System Topology Demo

An isometric 3D view of the Kaizen system topology: line-art glass nodes on the
floor of three zones (factory edge, Google Cloud agent platform, people apps),
connectors routed along the ground and packets flowing along each link. Every
node is clickable and opens the deployed app it belongs to in a new tab.

No backend calls; the demo is fully client-side.

## Stack

- React 18 + TypeScript + Vite (dev server `:3003`)
- three.js via `@react-three/fiber` 8 and `@react-three/drei` 9
- Plain CSS with the Lumina Slate tokens from `docs/DESIGN.md` (`src/styles.css`)

## Tasks

```bash
mise run install:demo     # npm install in apps/demo
mise run demo:dev         # Vite dev server → http://localhost:3003
mise run demo:typecheck   # tsc --noEmit
mise run demo:build       # typecheck + production build → apps/demo/dist
mise run deploy:demo      # build + firebase deploy --only hosting:demo
```

`deploy:demo` resolves the `demo` Hosting target through `firebase:targets`
(which reads `terraform output -json hosting_sites`), builds the app and
publishes `apps/demo/dist` to **https://kaizen-lab-demo.web.app**.

## Node → app links

| App | URL | Nodes |
|---|---|---|
| Factory Floor Console | https://kaizen-lab-factory.web.app | Factory Floor, Edge Gateway |
| Plant Ops Dashboard | https://kaizen-lab-web.web.app | Cloud Pub/Sub, BigQuery, Firestore, ADK Orchestrator, Agent Team, Vertex AI Search, Gemini on Vertex AI, Plant Ops Dashboard |
| Technician App | https://kaizen-lab-mobile.web.app | Technician App |

The bottom-left legend lists the same nodes as buttons (keyboard and
screen-reader path); hovering or focusing an entry highlights the node and its
links in the scene.

## Where things live

| Path | Purpose |
|---|---|
| `src/data/topology.ts` | `APP_LINKS`, `NODES`, `EDGES`, `ZONES`: edit here to change the graph |
| `src/types/topology.ts` | Node / edge / zone types |
| `src/components/TopologyScene.tsx` | Canvas, camera, lights, orbit controls |
| `src/components/NodeMesh.tsx` | Node shapes (`shapeParts`), hover lift, label, click |
| `src/components/EdgeFlow.tsx` | L-shaped floor routing and packet animation |
| `src/components/ZonePlate.tsx` | Zone floor plates and chips |
| `src/components/NodeLegend.tsx`, `SceneToolbar.tsx` | DOM chrome: legend, brand crumb, reset view |
