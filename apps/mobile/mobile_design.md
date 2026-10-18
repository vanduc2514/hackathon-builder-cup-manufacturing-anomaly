# Mobile Design — Technician App

A simple phone app for the specialist who fixes the machine. Large buttons, few words, usable with gloves. The copilot speaks English (Gemini, `en-US`).

**1. My Work Order**
One card for the current job: incident ID, machine, tool, root cause and the work order text.
- **Shows now:** `incident_id`, `suspect_machine`, `suspect_tool`, `root_cause` and `documents.work_order` from the incident stream (`/api/incidents/stream`), shown when the status is `repairing`.
- **Need backend to support:** a structured work order assigned to a named specialist, so each technician sees only their own jobs.
- The **Start repair** button opens screen 3.

**2. Field Evidence Request**
When the Root Cause Agent is unsure (confidence below 70%), the technician is asked to check the machine and send a photo, for example a close-up of the cutting tool.
- **Shows now:** an alert when the status is `awaiting_evidence`; the photo is sent through the Gemini Live camera stream (screen 3).
- **Need backend to support:** add the Root Cause Agent's diagnostic request text to the incident state so the app can show exactly what to check.

**3. Repair Guide (voice + camera)**
Full-screen camera with a microphone button. The technician talks to the copilot in Vietnamese and points the camera at the machine; the copilot answers by voice and text, citing the OEM manual.
- **Shows now:** voice and camera chat through the Gemini Live WebSocket (`/api/gemini-live/ws`).
- **Need backend to support:** an endpoint for the step-by-step repair checklist (each step with its instruction, target measurement and pass/fail), so the app can show progress such as "Step 3 of 5".

**4. Finish Repair**
The technician records a short video of the repair, takes a photo of the finished product and taps **Repair done**.
- **Need backend to support:** an upload for the repair video and photo linked to the incident, and a "repair done" input sent to the Orchestrator (today the workflow marks the repair done by itself).

**5. Verification**
After the repair, the app shows a progress bar of good end products in a row: `verification_count / verification_target` (target 50).
- If it reaches 50, show "Verified — waiting for Lead Plant Ops approval".
- If verification fails, the incident goes back to tracing; show "Defects still found — investigation reopened" and close the job on the phone.

**Other states**
- `escalated`: show "Escalated to supervisor" with `status_reason`.
- `closed` and `approved`: show "Job approved and released".
