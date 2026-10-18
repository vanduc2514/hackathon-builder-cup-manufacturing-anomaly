// DocumentViewerModal: portal modal that renders one exported Markdown document.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import MarkdownViewer from '../MarkdownViewer';

interface DocumentViewerModalProps {
  title: string;
  path: string;
  content: string;
  onClose: () => void;
}

export default function DocumentViewerModal({ title, path, content, onClose }: DocumentViewerModalProps): React.ReactElement | null {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const modal = (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="glass glass-strong modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '85vh' }}
      >
        <div className="row between" style={{ gap: 8 }}>
          <div className="col" style={{ gap: 1 }}>
            <span style={{ fontSize: '1rem', fontWeight: 650 }}>{title}</span>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
              {path}
            </span>
          </div>
          <button type="button" className="btn btn-sm" aria-label="Close document" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div style={{ overflow: 'auto', minHeight: 0 }}>
          <MarkdownViewer source={content} />
        </div>
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}
