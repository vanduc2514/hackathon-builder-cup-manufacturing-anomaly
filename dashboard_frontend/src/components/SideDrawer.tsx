// SideDrawer: right-hand glass panel for row details; closes on Esc, scrim click or the close button.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SideDrawerProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  width?: number;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function SideDrawer({ title, eyebrow, width = 560, onClose, footer, children }: SideDrawerProps): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="drawer-scrim" role="presentation" onClick={onClose}>
      <aside
        className="glass glass-strong drawer-panel"
        role="dialog"
        aria-modal="true"
        style={{ width: `min(${width}px, 100vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="row between drawer-head">
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            {eyebrow && <div className="row wrap" style={{ gap: 8 }}>{eyebrow}</div>}
            <h2 className="drawer-title">{title}</h2>
          </div>
          <button type="button" className="btn btn-sm drawer-close" aria-label="Close details" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="row wrap drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
