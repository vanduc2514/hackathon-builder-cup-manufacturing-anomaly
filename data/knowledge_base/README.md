# Knowledge Base

## Google Drive Source

The team's competition documents are stored in Google Drive:

- **Folder:** `💻 Competition | AI Builder Cup`
- **Remote:** `gdrive` (configured via `mise run drive:auth`)
- **Local Mirror:** `data/knowledge_base/drive/AI Builder Cup/`

### Retrieving Content

Fetch content from the default folder using the mise task:

```bash
mise run drive:pull "💻 Competition | AI Builder Cup"
```

Or using `rclone` directly:

```bash
mise exec -- rclone copy gdrive:"💻 Competition | AI Builder Cup" "data/knowledge_base/drive/AI Builder Cup" --drive-shared-with-me
```
