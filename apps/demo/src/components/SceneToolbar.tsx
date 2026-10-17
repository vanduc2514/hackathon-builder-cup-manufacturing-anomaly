// Floating chrome over the scene: brand crumb (top-left), reset-view, outline-toggle and
// camera-help controls (top-right) and the help panel they open.
import React, { useEffect, useState } from 'react';

const HELP_ROWS: [string, string][] = [
  ['Left-drag', 'Rotate the view'],
  ['Right-drag', 'Pan the view'],
  ['Scroll', 'Zoom in / out'],
  ['Touch', 'One finger rotates, two fingers pinch to zoom and pan'],
  ['Hover a node', 'Show details; robots wave at you'],
  ['Click a node', 'Open its app in a new tab'],
  ['Reset button', 'Return to the starting view'],
  ['Outline button', 'Show or hide the zones (outline, background and label)'],
];

interface SceneToolbarProps {
  onReset: () => void;
  outlinesOn: boolean;
  onToggleOutlines: () => void;
}

export default function SceneToolbar({
  onReset,
  outlinesOn,
  onToggleOutlines,
}: SceneToolbarProps): React.ReactElement {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  return (
    <>
      <header className="header-crumb scene-crumb">
        <span className="brand-tile">K</span>
        <b>Kaizen System Topology</b>
      </header>
      <div className="scene-controls">
        <button type="button" className="ctrl-btn" aria-label="Reset view" title="Reset view" onClick={onReset}>
          <span className="material-symbols-outlined" aria-hidden="true">
            center_focus_strong
          </span>
        </button>
        <button
          type="button"
          className={outlinesOn ? 'ctrl-btn is-active' : 'ctrl-btn'}
          aria-label="Toggle dashed outlines"
          title="Toggle dashed outlines"
          aria-pressed={outlinesOn}
          onClick={onToggleOutlines}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            border_style
          </span>
        </button>
        <button
          type="button"
          className="ctrl-btn"
          aria-label="How to move the camera"
          title="Help"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((o) => !o)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            help
          </span>
        </button>
      </div>
      {helpOpen && (
        <aside className="help-panel" role="dialog" aria-label="Camera controls">
          <ul>
            {HELP_ROWS.map(([key, text]) => (
              <li key={key}>
                <span className="help-key">{key}</span>
                {text}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}
