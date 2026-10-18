// Root of the 3D topology demo: owns hover / reset state and opens each node's deployed app.
import React, { useCallback, useState } from 'react';
import NodeLegend from './components/NodeLegend';
import SceneCaption from './components/SceneCaption';
import SceneToolbar from './components/SceneToolbar';
import TopologyScene from './components/TopologyScene';
import { APP_LINKS } from './data/topology';
import type { TopologyNode } from './types/topology';

export default function App(): React.ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [showOutlines, setShowOutlines] = useState(true);

  const openNode = useCallback((node: TopologyNode): void => {
    window.open(APP_LINKS[node.target].url, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <>
      <div className="app-backdrop" />
      <main className="scene-root" aria-label="kAIzen system topology, 3D view">
        <TopologyScene
          hoveredId={hoveredId}
          onHover={setHoveredId}
          onOpen={openNode}
          resetToken={resetToken}
          showOutlines={showOutlines}
        />
      </main>
      <SceneToolbar
        onReset={() => setResetToken((t) => t + 1)}
        outlinesOn={showOutlines}
        onToggleOutlines={() => setShowOutlines((v) => !v)}
      />
      <NodeLegend />
      <SceneCaption />
    </>
  );
}
