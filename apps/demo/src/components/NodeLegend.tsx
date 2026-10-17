// Glass legend listing every node by target app: the keyboard / screen-reader path to each link.
import React from 'react';
import { APP_LINKS, NODES } from '../data/topology';
import type { AppTarget, TopologyNode } from '../types/topology';

interface NodeLegendProps {
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onOpen: (node: TopologyNode) => void;
}

const TARGETS = Object.keys(APP_LINKS) as AppTarget[];

export default function NodeLegend({ hoveredId, onHover, onOpen }: NodeLegendProps): React.ReactElement {
  return (
    <nav className="legend-panel" aria-label="Topology nodes">
      {TARGETS.map((target) => (
        <section key={target} className="legend-group">
          <a className="legend-heading" href={APP_LINKS[target].url} target="_blank" rel="noopener noreferrer">
            {APP_LINKS[target].title}
            <span className="material-symbols-outlined" aria-hidden="true">
              open_in_new
            </span>
          </a>
          <ul className="legend-list">
            {NODES.filter((n) => n.target === target).map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={hoveredId === node.id ? 'legend-item is-hovered' : 'legend-item'}
                  onMouseEnter={() => onHover(node.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(node.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onOpen(node)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {node.icon}
                  </span>
                  <span className="legend-item__label">{node.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
