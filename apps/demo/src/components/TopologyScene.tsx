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
  onHover: (id: string | null) => void;
  onOpen: (node: TopologyNode) => void;
  resetToken: number;
  showOutlines: boolean;
}

export default function TopologyScene({
  hoveredId,
  onHover,
  onOpen,
  resetToken,
  showOutlines,
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
      camera={{ position: [20, 20, 15], zoom: 16, near: -100, far: 200 }}
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
      {showOutlines && ZONES.map((zone) => <ZonePlate key={zone.id} zone={zone} />)}
      {EDGES.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) throw new Error(`Edge ${edge.from}->${edge.to} references an unknown node`);
        return (
          <EdgeFlow key={edgeKey(edge)} edge={edge} from={from} to={to} hoveredId={hoveredId} />
        );
      })}
      {NODES.map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          hovered={hoveredId === node.id}
          onHover={onHover}
          onOpen={onOpen}
        />
      ))}
    </Canvas>
  );
}
