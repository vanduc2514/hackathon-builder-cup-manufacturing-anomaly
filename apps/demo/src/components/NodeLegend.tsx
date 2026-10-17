// Collapsible glass legend linking each deployed app page.
import React, { useState } from 'react';
import { APP_LINKS } from '../data/topology';
import type { AppTarget } from '../types/topology';

const TARGETS = Object.keys(APP_LINKS) as AppTarget[];

export default function NodeLegend(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <nav className="legend-panel" aria-label="App pages">
      <button
        type="button"
        className="legend-toggle"
        aria-expanded={open}
        aria-controls="legend-links"
        onClick={() => setOpen((o) => !o)}
      >
        App pages
        <span className="material-symbols-outlined" aria-hidden="true">
          {open ? 'expand_more' : 'expand_less'}
        </span>
      </button>
      {open && (
        <div id="legend-links" className="legend-links">
          {TARGETS.map((target) => (
            <a
              key={target}
              className="legend-heading"
              href={APP_LINKS[target].url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {APP_LINKS[target].title}
              <span className="material-symbols-outlined" aria-hidden="true">
                open_in_new
              </span>
            </a>
          ))}
        </div>
      )}
      <p className="legend-credit">
        Agent robot:{' '}
        <a
          href="https://sketchfab.com/3d-models/futuristic-flying-animated-robot-low-poly-c5b92c281dc444448e64c0607719c7a2"
          target="_blank"
          rel="noopener noreferrer"
        >
          mshayan02
        </a>
        , CC BY 4.0
      </p>
    </nav>
  );
}
