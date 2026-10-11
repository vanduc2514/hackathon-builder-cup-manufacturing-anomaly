// ProductsView: Line-01 landing page — the five products in build order and their end-of-line quality.
import React from 'react';
import type { IncidentState } from '../../types';
import type { ToastTone } from '../../App';
import ProductLineCards from '../ProductLineCards';
import { lineProducts } from '../../lib/incident';

interface ProductsViewProps {
  incident: IncidentState | null;
  onOpenIncident: (product: string) => void;
  onNavigateToSops: () => void;
  onOpenSimulation: () => void;
  onNotify: (text: string, tone?: ToastTone) => void;
}

export default function ProductsView({
  incident,
  onOpenIncident,
  onNavigateToSops,
  onOpenSimulation,
  onNotify,
}: ProductsViewProps): React.ReactElement {
  const products = lineProducts(incident);
  const open = products.filter((p) => p.state === 'warning').length;
  const ucl = incident?.spc_ucl ?? 0.03;

  const exportSnapshot = () => {
    const snapshot = {
      exported_at: new Date().toISOString(),
      line: 'Line-01',
      spc_ucl: ucl,
      products: products.map((p) => ({
        name: p.name,
        state: p.state,
        defect_rate: p.defect,
        incident_id: p.incident?.incident_id ?? null,
        incident_status: p.incident?.status ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `line01-products-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Product snapshot exported', 'info');
  };

  return (
    <div className="page">
      <header className="row between wrap" style={{ gap: 16 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span className={`chip ${open ? 'chip-red' : 'chip-accent'}`} style={{ color: open ? undefined : 'var(--ink)' }}>
              <span className={`dot ${open ? 'animate-pulse-glow' : ''}`} style={{ background: open ? undefined : 'var(--accent)' }} />
              {open ? `Line-01 · ${open} open incident${open > 1 ? 's' : ''}` : 'Line-01 Active'}
            </span>
            <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>• Shift A (Alpha Floor)</span>
          </div>
          <h1 className="page-title">Products</h1>
          <p className="muted" style={{ fontSize: '0.88rem', marginTop: 4 }}>
            Line-01 products · defects are judged on finished parts at end-of-line inspection.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button id="products-sop" type="button" className="btn" onClick={onNavigateToSops}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>
              verified
            </span>
            SOP #209
          </button>
          <button id="products-export" type="button" className="btn" onClick={exportSnapshot}>
            <span className="material-symbols-outlined">ios_share</span>
            Export
          </button>
          <button id="products-new-run" type="button" className="btn btn-dark" onClick={onOpenSimulation}>
            <span className="material-symbols-outlined">add</span>
            New Run
          </button>
        </div>
      </header>

      <ProductLineCards products={products} ucl={ucl} onOpenIncident={onOpenIncident} />
    </div>
  );
}
