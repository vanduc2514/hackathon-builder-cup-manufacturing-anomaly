---
name: export-session
description: Export and sanitize the current local Antigravity session into `.sessions/` as a structured JSON audit log.
---

When the user triggers `/export-session`, execute the following steps:

### 1. Preparation & Target Path
- Ensure directory `.sessions/` exists in the current workspace root.
- Determine the export filename based on the session ID (overwriting cleanly on repeated runs):
  - JSON format: `.sessions/session-<SESSION_ID>.json`
  - Generate ONLY the JSON file (do NOT create Markdown files or symlinks).

### 2. Locate and Read Local Session Data
- Locate the active session file from the local machine runtime or read the active conversation state directly from the agent's memory/workspace cache.
- Extract:
  - Session ID & start/end timestamps.
  - Model & agent runtime version.
  - Chronological turn list: user inputs, assistant responses, tool calls (terminal commands, file changes, reads).
  - List of affected project files during this session.

### 3. Redact Sensitive Data (Mandatory Sanitization)
Before writing any data to disk, run a regex/pattern pass to redact sensitive credentials. Replace detected values with `[REDACTED]`:
- **API Keys & Tokens:**
  - OpenAI / Anthropic / Gemini keys (`sk-...`, `AIza...`)
  - GitHub / GitLab tokens (`ghp_...`, `glpat-...`)
  - AWS / Cloud credentials (`AKIA...`, Secret Access Keys)
  - JWTs (`eyJ...`)
- **Environment & Auth Credentials:**
  - Database connection strings (`postgres://...`, `mongodb://...`, `mysql://...`)
  - Private keys (`-----BEGIN PRIVATE KEY-----`)
  - Passwords and secrets from `.env` values (e.g., `PASSWORD=...`, `SECRET=...`)
- **Local Machine Paths:** Normalize absolute system paths (e.g., `/Users/username/...` -> `~/...` or `./`).

### 4. Write JSON File (`.sessions/session-<SESSION_ID>.json`)
```json
{
  "session_id": "<SESSION_ID>",
  "exported_at": "<ISO_8601_TIMESTAMP>",
  "runtime": "Antigravity",
  "summary": {
    "total_turns": 0,
    "files_created": [],
    "files_modified": [],
    "commands_run": []
  },
  "history": [
    {
      "turn": 1,
      "role": "user",
      "timestamp": "<TIMESTAMP>",
      "content": "..."
    },
    {
      "turn": 2,
      "role": "assistant",
      "timestamp": "<TIMESTAMP>",
      "tool_calls": [
        {
          "tool": "terminal | file_writer | file_reader",
          "args": { "...": "..." },
          "status": "success"
        }
      ],
      "content": "..."
    }
  ]
}
