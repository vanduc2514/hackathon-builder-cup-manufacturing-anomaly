// three.js canvas: orthographic isometric view of zones, routed edges and clickable nodes.
import React, { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EDGES, NODES, ZONES } from '../data/topology';
import type { TopologyNode } from '../types/topology';
import ControlsReset from './ControlsReset';
import EdgeFlow from './EdgeFlow';
import NodeMesh from './NodeMesh';
import ZonePlate from './ZonePlate';

interface TopologySceneProps {
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onOpen: (node: TopologyNode) => void;
  resetToken: number;
}

export default function TopologyScene({
  hoveredId,
  onHover,
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
      camera={{ position: [20, 20, 20], zoom: 30, near: -100, far: 200 }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 8]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enableDamping
        target={[0, 0, 0]}
        minZoom={18}
        maxZoom={90}
        minPolarAngle={0.6}
        maxPolarAngle={1.1}
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
          <EdgeFlow key={`${edge.from}->${edge.to}`} edge={edge} from={from} to={to} hoveredId={hoveredId} />
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
