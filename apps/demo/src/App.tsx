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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);

  const openNode = useCallback((node: TopologyNode): void => {
    if (!node.target) return;
    const link = APP_LINKS[node.target];
    if (link?.url) {
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const selectNode = useCallback((node: TopologyNode | null): void => {
    if (!node) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const activeHighlightId = hoveredId ?? selectedId;

  return (
    <>
      <div className="app-backdrop" />
      <main className="scene-root" aria-label="kAIzen system topology, 3D view">
        <TopologyScene
          hoveredId={hoveredId}
          selectedId={selectedId}
          highlightedId={activeHighlightId}
          onHover={setHoveredId}
          onSelect={selectNode}
          onOpen={openNode}
          resetToken={resetToken}
        />
      </main>
      <SceneToolbar
        onReset={() => {
          setSelectedId(null);
          setResetToken((t) => t + 1);
        }}
      />
      <NodeLegend />
      <SceneCaption />
    </>
  );
}
