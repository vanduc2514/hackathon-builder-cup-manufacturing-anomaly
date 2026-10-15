import React from 'react';
import type { ConveyorPart } from '../types';

export default function ConveyorBelt({ parts = [] }: { parts?: ConveyorPart[] }): React.ReactElement {
  const items = parts.slice(0, 7);
  return (
    <div className="glass-card flex-col">
      <div className="section-head">
        <span className="section-title"><span className="material-symbols-outlined accent-icon">conveyor_belt</span>Optical Inspection Conveyor</span>
        <span className="section-meta">Continuous Part Serialization</span>
      </div>
      <div className="conveyor-track">
        {items.length === 0 ? (
          <div className="faint empty-text">Awaiting serialized parts from machining cells...</div>
        ) : (
          items.map((p, i) => {
            const pass = p.status === 'PASS';
            return (
              <div key={`${p.product_id}-${i}`} className={`part-card ${pass ? '' : 'part-err'}`}>
                <div className="card-row">
                  <span className="mono font-bold">{p.product_id}</span>
                  <span className="faint text-xs">{p.machine_id}</span>
                </div>
                <span className={`pill ${pass ? 'pill-ok' : 'pill-alarm'}`}>
                  {pass ? 'PASS' : p.status.includes('SCRATCH') ? 'DEFECT: SCRATCH' : p.status}
                </span>
                <span className="text-xs faint">Conf: {(p.confidence * 100).toFixed(0)}%</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
