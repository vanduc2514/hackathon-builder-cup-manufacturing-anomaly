---
name: google-drive-rclone
description: Fetches and updates content in a Google Drive folder using the rclone CLI (installed via mise). Use when the user asks to pull, read, download, list, upload, or update files in their Google Drive, sync Drive documents into data/knowledge_base/, or troubleshoot rclone auth, export formats, or Drive errors.
---

# Google Drive via rclone

rclone is pinned in `mise.toml` (`rclone = "1.75.1"`). The OAuth config is **project-local** at `.rclone/rclone.conf` (`RCLONE_CONFIG` is set by mise) and is gitignored. The remote is named `gdrive`. The local cache is `.cache/gdrive/` (gitignored).

Always run rclone through mise so the env is applied: `mise exec -- rclone ...` or the `mise run drive:*` tasks.

> **Default folder:** If no folder is specified, use `💻 Competition | AI Builder Cup` with `--drive-shared-with-me`. See `AGENTS.md`.

## 1. Check setup first

```bash
mise exec -- rclone version
mise exec -- rclone listremotes     # must print "gdrive:"
```

If `gdrive:` is missing, the user must sign in once. This opens a browser, so **ask the user to run it in their own terminal**:

```bash
mise run drive:auth
```

Verify afterwards: `mise run drive:ls "<Folder>"`.

## 2. Fetch (read-only, safe)

| Goal | Command |
|---|---|
| List a folder | `mise run drive:ls "<Folder>"` |
| Recursive listing with sizes | `mise exec -- rclone lsl "gdrive:<Folder>"` |
| Read one file to stdout | `mise exec -- rclone cat "gdrive:<Folder>/file.md"` |
| Download the whole folder | `mise run drive:pull "<Folder>"` |
| Find folder IDs | `mise exec -- rclone lsjson "gdrive:" --dirs-only --max-depth 1` |

After `drive:pull`, read files from the cache `.cache/gdrive/`.

Native Google files are not regular files. rclone exports them: Docs → `.docx`, Sheets → `.xlsx`, Slides → `.pptx`. To get text-friendly output instead, add `--drive-export-formats md` (Docs only) or `csv` (Sheets), or `pdf`.

## 3. Update (writes — follow the safety protocol)

1. Edit the file in `.cache/gdrive/`.
2. **Dry run** and show the output to the user: `mise run drive:push:dry "<Folder>"`
3. Only after the user confirms: `mise run drive:push "<Folder>"`

Single-file update:

```bash
mise exec -- rclone copyto .cache/gdrive/notes.md "gdrive:<Folder>/notes.md" --dry-run -v
```

Notes:
- Uploading a `.docx`/`.xlsx` replaces the Drive file content. It does **not** edit a native Google Doc in place. For in-place edits, use regular formats (`.md`, `.csv`, `.pdf`).
- Uploading Office files does not convert them to Google Docs unless `--drive-import-formats docx,xlsx` is passed. Without it they stay as Office files in Drive.

## Safety rules (must follow)

- Use only `copy`, `copyto`, `cat`, `ls*`. **Never** run `sync`, `delete`, `purge`, `move`, `deletefile`, or `cleanup` without explicit user approval of the exact command.
- Always `--dry-run` before any write, and keep paths scoped to the user's named folder.
- Never print or commit `.rclone/rclone.conf` (contains OAuth tokens).
- Quote paths — Drive folder names often contain spaces.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `didn't find section in config file ("gdrive")` | Run `mise run drive:auth` (user's terminal). |
| `403 rateLimitExceeded` / `userRateLimitExceeded` | Add `--tpslimit 8`. If persistent, create your own OAuth client (Google Cloud Console → Desktop app) and run `rclone config` to set `client_id`/`client_secret`. |
| `invalid_grant` / token expired | `mise exec -- rclone config reconnect gdrive:` |
| Folder not found | Names are case-sensitive; shared folders need `--drive-shared-with-me` or use `root_folder_id=<id>` / `gdrive,root_folder_id=<id>:`. |
| Files skipped on pull | Native Google files need `--drive-export-formats`. |
| Shared Drives | Set `team_drive=<id>` in the remote via `rclone config`. |
