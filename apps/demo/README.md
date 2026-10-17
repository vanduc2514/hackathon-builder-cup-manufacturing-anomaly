# apps/demo — System Topology Standalone Demo

A single-file static demo of the Kaizen 5-Layer Operational Execution Graph,
deployed independently from the Plant Ops dashboard. The Plant Ops dashboard
(`apps/web`) no longer carries the System Topology view — this folder hosts the
extracted, chrome-free prototype that was originally authored at
`.stitch/designs/system_topology_workflow.html`.

## What lives here

| File | Purpose |
|---|---|
| `index.html` | Self-contained demo (inline `<style>` + inline `<script>`). Pan / zoom / SVG bezier edges / drawer / minimap are all built in. No backend calls. |
| `README.md` | This file. |

## Deploy

Firebase Hosting target `demo` (site `kaizen-lab-demo.web.app`) is wired in
`firebase.json` and provisioned via Terraform (`infra/terraform/firebase.tf` +
`locals.tf`). Deploy with:

```bash
mise run deploy:demo
```

`deploy:demo` resolves the `demo` target through `firebase:targets` (which reads
`terraform output -raw hosting_sites`), then runs
`firebase deploy --only hosting:demo --project "$TF_VAR_project_id"`.

Live URL: **https://kaizen-lab-demo.web.app**

## Local preview

The file is fully static; any local HTTP server works:

```bash
cd apps/demo
mise exec -- npx serve -p 3030 .
# → http://localhost:3030
```

Or simply open `apps/demo/index.html` directly in a browser — the only thing
that won't work without a server is the Web Font loading under `file://`.

## Updating the demo

Edit `apps/demo/index.html`. There is no build step. When the upstream
`.stitch/designs/system_topology_workflow.html` changes, re-run the same strip
script (kept under `scripts/strip_topology_chrome.py` once promoted, otherwise
re-apply the three removals documented there):

1. Drop the `<aside class="sidebar">…</aside>` block.
2. Drop the `<header class="top-header">…</header>` block.
3. Drop the sidebar / header / nav CSS rules (`.sidebar`, `.brand-*`, `.nav-*`,
   `.sidebar-footer`, `.top-header`, `.top-header-left`, `.header-crumb`).

Then commit and push; CI / `deploy:demo` will publish the new bytes.

## No backend coupling

This demo is intentionally offline. Pan & zoom, SVG edges, drawer previews and
the minimap are all client-side. Adding backend coupling here would defeat the
purpose of having a low-friction lab demo (`kaizen-lab-demo.web.app`) alongside
the production dashboard (`kaizen-lab-web.web.app`).