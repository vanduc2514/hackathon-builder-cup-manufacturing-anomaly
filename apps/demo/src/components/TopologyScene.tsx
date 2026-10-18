// three.js canvas: orthographic isometric view of zones, routed edges and clickable nodes.
import React, { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EDGES, NODES, SCENARIO, ZONES, edgeKey } from '../data/topology';
import type { TopologyNode } from '../types/topology';
import ControlsReset from './ControlsReset';
import EdgeFlow from './EdgeFlow';
import NodeMesh from './NodeMesh';
import ZonePlate from './ZonePlate';

// Fail fast when the scenario references an edge or agent that is not drawn.
const EDGE_KEYS = new Set(EDGES.map(edgeKey));
const NODE_IDS = new Set(NODES.map((n) => n.id));
for (const step of SCENARIO) {
  for (const key of step.edges) {
    if (!EDGE_KEYS.has(key)) throw new Error(`Scenario edge ${key} is not in EDGES`);
  }
  for (const id of step.working) {
    if (!NODE_IDS.has(id)) throw new Error(`Scenario agent ${id} is not in NODES`);
  }
}

interface TopologySceneProps {
  hoveredId: string | null;
  selectedId: string | null;
  highlightedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (node: TopologyNode | null) => void;
  onOpen: (node: TopologyNode) => void;
  resetToken: number;
}

export default function TopologyScene({
  hoveredId,
  selectedId,
  highlightedId,
  onHover,
  onSelect,
  onOpen,
  resetToken,
}: TopologySceneProps): React.ReactElement {
  const nodeById = useMemo(() => new Map(NODES.map((n) => [n.id, n])), []);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : 'auto';
  }, [hoveredId]);

  return (
    <Canvas
      orthographic
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      camera={{ position: [20, 20, 15], zoom: 15, near: -100, far: 200 }}
      onPointerMissed={() => onSelect(null)}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 8]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enableDamping
        target={[0, 0, 0]}
        minZoom={12}
        maxZoom={90}
        minPolarAngle={0.6}
        maxPolarAngle={1.2}
      />
      <ControlsReset resetToken={resetToken} />
      {ZONES.map((zone) => (
        <ZonePlate key={zone.id} zone={zone} />
      ))}
      {EDGES.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) throw new Error(`Edge ${edge.from}->${edge.to} references an unknown node`);
        return (
          <EdgeFlow
            key={edgeKey(edge)}
            edge={edge}
            from={from}
            to={to}
            highlightedId={highlightedId}
          />
        );
      })}
      {NODES.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          hovered={hoveredId === node.id}
          selected={selectedId === node.id}
          highlightedId={highlightedId}
          onHover={onHover}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </Canvas>
  );
}
