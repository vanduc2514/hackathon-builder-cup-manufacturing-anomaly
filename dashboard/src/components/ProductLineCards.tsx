// ProductLineCards: catalog-style row of Line-01 products — defects are judged on finished products, not per machine.
import React from 'react';
import type { LineProduct } from '../lib/incident';
import { friendlyDefectName, incidentStage } from '../lib/incident';
import ProductIllustration from './ProductIllustration';

interface ProductLineCardsProps {
  products: LineProduct[];
  ucl: number;
  onOpenIncident: (product: string) => void;
}

const STRIP: Record<LineProduct['state'], string> = {
  normal: 'var(--green)',
  warning: 'var(--red)',
  queued: 'var(--faint)',
};

function formatDefect(rate: number): string {
  const pct = rate * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

export default function ProductLineCards({ products, ucl, onOpenIncident }: ProductLineCardsProps): React.ReactElement {
  return (
    <ol className="glass product-grid stagger" aria-label="Products on Line-01">
      {products.map((p) => {
        const warn = p.state === 'warning';
        const status = warn && p.incident ? `Incident · ${incidentStage(p.incident)}` : p.state === 'queued' ? 'Queued' : 'Passing EOL';
        return (
          <li key={p.name} className="product-cell">
            <button
              id={`product-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
              type="button"
              className={`product-card ${warn ? 'product-card-alert' : ''}`}
              onClick={warn ? () => onOpenIncident(p.name) : undefined}
              aria-label={warn ? `${p.name}: open incident ${p.incident?.incident_id ?? ''}` : p.name}
              style={{ cursor: warn ? 'pointer' : 'default' }}
            >
              <div className="row" style={{ minHeight: 30 }}>
                {warn && (
                  <span className="product-badge-solid">
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize: 15 }}>
                      warning
                    </span>
                    {p.incident?.defect_type ? friendlyDefectName(p.incident.defect_type) : 'Defect'} · {formatDefect(p.defect ?? 0)}
                  </span>
                )}
              </div>

              <div style={{ height: 170, padding: '10px 6px 4px' }}>
                <ProductIllustration product={p.name} muted={p.state === 'queued'} />
              </div>

              <div className="product-name">{p.name}</div>

              <div className="product-status" style={{ borderLeftColor: STRIP[p.state] }}>
                {status}
              </div>

              <div className="row between" style={{ marginTop: 'auto', paddingTop: 18, alignItems: 'baseline', gap: 8 }}>
                <span className="mono" style={{ fontSize: '1.3rem', fontWeight: 700, color: warn ? '#d92d20' : p.state === 'queued' ? 'var(--faint)' : 'var(--ink)' }}>
                  {p.defect === null ? '—' : formatDefect(p.defect)}
                </span>
                <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {warn && p.incident ? `#${p.incident.incident_id}` : `UCL ${(ucl * 100).toFixed(2)}%`}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
