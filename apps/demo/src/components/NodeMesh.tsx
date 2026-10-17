// Clickable line-art glass node: shape built from primitives, floating label, hover lift.
import React, { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Edges, Html, Outlines } from '@react-three/drei';
import type { Group } from 'three';
import { APP_LINKS } from '../data/topology';
import type { NodeShape, TopologyNode } from '../types/topology';

type Vec3 = [number, number, number];

interface ShapePart {
  geometry: 'box' | 'cylinder' | 'sphere';
  args: number[];
  position: Vec3;
}

const HOVER_LIFT = 0.35;
const LINE = '#334155';
const ACCENT = '#5b5bf0';

function box(args: Vec3, position: Vec3): ShapePart {
  return { geometry: 'box', args, position };
}

function shapeParts(shape: NodeShape): ShapePart[] {
  switch (shape) {
    case 'machine':
      return [box([2.4, 1.2, 1.6], [0, 0.6, 0]), box([0.8, 0.5, 0.8], [0.5, 1.45, 0])];
    case 'gateway':
      return [0.2, 0.6, 1.0].map((y) => box([1.8, 0.35, 1.2], [0, y, 0]));
    case 'router':
      return [0.25, 0.75].map((y) => box([1.8, 0.45, 1.4], [0, y, 0]));
    case 'database':
      return [{ geometry: 'cylinder', args: [0.8, 0.8, 1.4, 32], position: [0, 0.7, 0] }];
    case 'cloud':
      return [
        { geometry: 'sphere', args: [0.7, 32, 16], position: [0, 0.9, 0] },
        { geometry: 'sphere', args: [0.55, 32, 16], position: [-0.7, 0.75, 0] },
        { geometry: 'sphere', args: [0.55, 32, 16], position: [0.7, 0.75, 0] },
      ];
    case 'hub':
      return [box([2.6, 1.6, 2.0], [0, 0.8, 0])];
    case 'agents': {
      const back = [-1.05, -0.35, 0.35, 1.05].map((x) => box([0.5, 0.5, 0.5], [x, 0.25, -0.35]));
      const front = [-0.7, 0, 0.7].map((x) => box([0.5, 0.5, 0.5], [x, 0.25, 0.35]));
      return [...back, ...front];
    }
    case 'phone':
      return [box([0.7, 1.3, 0.12], [0, 0.75, 0])];
    case 'monitor':
      return [box([1.8, 1.1, 0.12], [0, 1.1, 0]), box([0.2, 0.5, 0.2], [0, 0.25, 0])];
  }
}

interface NodeMeshProps {
  node: TopologyNode;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onOpen: (node: TopologyNode) => void;
}

export default function NodeMesh({ node, hovered, onHover, onOpen }: NodeMeshProps): React.ReactElement {
  const group = useRef<Group>(null);
  const [x, z] = node.position;
  const lineColor = hovered || node.shape === 'hub' ? ACCENT : LINE;

  useFrame(() => {
    if (!group.current) return;
    const y = group.current.position.y;
    group.current.position.y = y + ((hovered ? HOVER_LIFT : 0) - y) * 0.15;
  });

  const handleOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    onHover(node.id);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    onOpen(node);
  };

  return (
    <group
      ref={group}
      position={[x, 0, z]}
      onPointerOver={handleOver}
      onPointerOut={() => onHover(null)}
      onClick={handleClick}
    >
      {shapeParts(node.shape).map((part, i) => (
        <mesh key={i} position={part.position}>
          {part.geometry === 'box' && <boxGeometry args={part.args as Vec3} />}
          {part.geometry === 'cylinder' && (
            <cylinderGeometry args={part.args as [number, number, number, number]} />
          )}
          {part.geometry === 'sphere' && <sphereGeometry args={part.args as Vec3} />}
          <meshStandardMaterial color="#ffffff" transparent opacity={0.82} roughness={0.35} />
          {part.geometry === 'sphere' ? (
            <Outlines thickness={0.03} color={lineColor} />
          ) : (
            <Edges color={lineColor} />
          )}
        </mesh>
      ))}
      <Html position={[0, 2.2, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={hovered ? 'node-label is-hovered' : 'node-label'}>
          <span className="node-label__head">
            <span className="material-symbols-outlined" aria-hidden="true">
              {node.icon}
            </span>
            <span className="node-label__title">{node.label}</span>
          </span>
          <span className="node-label__sub">{node.sublabel}</span>
          {hovered && (
            <span className="node-label__open">Open {APP_LINKS[node.target].title} ↗</span>
          )}
        </div>
      </Html>
    </group>
  );
}
