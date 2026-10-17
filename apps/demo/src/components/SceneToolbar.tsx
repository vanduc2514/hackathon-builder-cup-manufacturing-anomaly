// Floating chrome over the scene: brand crumb (top-left) and reset-view control (top-right).
import React from 'react';

interface SceneToolbarProps {
  onReset: () => void;
}

export default function SceneToolbar({ onReset }: SceneToolbarProps): React.ReactElement {
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
      </div>
    </>
  );
}
