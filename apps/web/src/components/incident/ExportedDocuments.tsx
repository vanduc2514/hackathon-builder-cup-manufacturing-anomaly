// ExportedDocuments (#333): the four approved incident documents exported as Markdown.
// GCS objects are private, so each entry links to the Cloud Console browser path
// (new tab); in dev the export lands in artifacts/documents/ and shows local paths.
import React from 'react';
import type { IncidentDocumentsResponse, IncidentState } from '../../types';
import { useApi } from '../../lib/api';

interface ExportedDocumentsProps {
  incident: IncidentState;
}

export default function ExportedDocuments({ incident }: ExportedDocumentsProps): React.ReactElement | null {
  const approved = incident.approved;

  // Approval returns before the background export lands on the board, so poll until it does.
  const { data, error } = useApi<IncidentDocumentsResponse>(
    approved ? '/api/incidents/documents' : null,
    approved && !incident.documents_exported ? 4000 : 0,
    [incident.incident_id, incident.documents_exported],
  );

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
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="eyebrow">Exported documents · Markdown</span>
        {data.console_url && (
          <a className="btn btn-sm" href={data.console_url} target="_blank" rel="noreferrer">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              open_in_new
            </span>
            Open folder in Cloud Console
          </a>
        )}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {data.documents.map((doc) => (
          <div key={doc.name} className="row between wrap" style={{ gap: 8 }}>
            <div className="col" style={{ gap: 1 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 650 }}>{doc.title}</span>
              <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                {doc.uri}
              </span>
            </div>
            {data.console_url ? (
              <a
                className="btn btn-sm"
                href={data.console_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${doc.title} in Cloud Console`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                  description
                </span>
                Open
              </a>
            ) : (
              <span className="chip mono">local file</span>
            )}
          </div>
        ))}
      </div>
      {data.destination === 'local' && (
        <span className="kpi-hint">Dev mode: the documents were written to the local artifacts directory instead of GCS.</span>
      )}
    </div>
  );
}
