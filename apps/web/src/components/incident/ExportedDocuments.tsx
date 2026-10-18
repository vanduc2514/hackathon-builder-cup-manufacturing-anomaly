// ExportedDocuments (#333): the four approved incident documents exported as Markdown.
// Each entry shows its relative object path with Download (Markdown file) and Open (rendered viewer modal);
// content is served by GET /api/incidents/documents/{name}.
import React, { useState } from 'react';
import type { IncidentDocumentContent, IncidentDocumentLink, IncidentDocumentsResponse, IncidentState } from '../../types';
import { fetchJson, useApi } from '../../lib/api';
import DocumentViewerModal from './DocumentViewerModal';

interface ExportedDocumentsProps {
  incident: IncidentState;
}

export default function ExportedDocuments({ incident }: ExportedDocumentsProps): React.ReactElement | null {
  const approved = incident.approved;
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ doc: IncidentDocumentLink; content: string } | null>(null);

  // Approval returns before the background export lands on the board, so poll until it does.
  const { data, error } = useApi<IncidentDocumentsResponse>(
    approved ? '/api/incidents/documents' : null,
    approved && !incident.documents_exported ? 4000 : 0,
    [incident.incident_id, incident.documents_exported],
  );

  const load = async (doc: IncidentDocumentLink, action: 'download' | 'open'): Promise<void> => {
    setBusy(doc.name);
    setLoadError(null);
    try {
      const res = await fetchJson<IncidentDocumentContent>(`/api/incidents/documents/${doc.name}`);
      if (action === 'open') {
        setViewing({ doc, content: res.content });
      } else {
        const blob = new Blob([res.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setLoadError(`Could not load ${doc.title}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  if (!approved) return null;

  if (error) {
    return (
      <div className="inset col" id="documents-export-error" style={{ gap: 4 }}>
        <span className="eyebrow">Exported documents</span>
        <p className="placeholder">Could not load the exported documents ({error}).</p>
      </div>
    );
  }

  if (!data?.exported) {
    const exportError = data?.export_error ?? null;
    return (
      <div className="inset col" id="documents-export-pending" style={{ gap: 4 }}>
        <span className="eyebrow">Exported documents</span>
        <p className="placeholder">
          {exportError
            ? `Document export failed: ${exportError}. The approval itself succeeded.`
            : 'Exporting the approved documents…'}
        </p>
      </div>
    );
  }

  return (
    <div className="inset col" id="documents-export" style={{ gap: 10 }}>
      <span className="eyebrow">Exported documents · Markdown</span>
      <div className="col" style={{ gap: 6 }}>
        {data.documents.map((doc) => {
          const loading = busy === doc.name;
          return (
            <div key={doc.name} className="row between wrap" style={{ gap: 8 }}>
              <div className="col" style={{ gap: 1 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 650 }}>{doc.title}</span>
                <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {doc.path}
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={loading}
                  aria-label={`Download ${doc.title}`}
                  onClick={() => void load(doc, 'download')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    download
                  </span>
                  {loading ? 'Loading…' : 'Download'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={loading}
                  aria-label={`Open ${doc.title}`}
                  onClick={() => void load(doc, 'open')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    description
                  </span>
                  {loading ? 'Loading…' : 'Open'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {loadError && <span className="kpi-hint" role="alert">{loadError}</span>}
      {data.destination === 'local' && (
        <span className="kpi-hint">Dev mode: documents are stored in the local artifacts directory instead of GCS.</span>
      )}
      {viewing && (
        <DocumentViewerModal
          title={viewing.doc.title}
          path={viewing.doc.path}
          content={viewing.content}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
