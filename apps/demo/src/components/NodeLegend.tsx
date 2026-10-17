// Glass legend linking each deployed app page.
import React from 'react';
import { APP_LINKS } from '../data/topology';
import type { AppTarget } from '../types/topology';

const TARGETS = Object.keys(APP_LINKS) as AppTarget[];

export default function NodeLegend(): React.ReactElement {
  return (
    <nav className="legend-panel" aria-label="App pages">
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
    </nav>
  );
}
