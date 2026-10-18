// Clickable line-art glass node: shape built from primitives (agents and orchestrator: robot model),
// floating label, hover lift.
import React, { Suspense, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Edges, Html, Outlines } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { APP_LINKS, isNodeActive, scenarioNow } from '../data/topology';
import type { NodeShape, TopologyNode } from '../types/topology';
import AgentRobot from './AgentRobot';

type Vec3 = [number, number, number];

interface ShapePart {
  geometry: 'box' | 'cylinder' | 'sphere';
  args: number[];
  position: Vec3;
}

const HOVER_LIFT = 0.35;
const LINE = '#334155';
const ACCENT = '#5b5bf0';
// Labels are bottom-anchored (styles.css) at these heights, so the hover line grows upward.
/** Primitive nodes: just under the shape's top, as before. */
const LABEL_BOTTOM = 0.85;
/** Robots: clears a hovered, hopping, waving robot; scaled with the robot size. */
const ROBOT_LABEL_BOTTOM = 2.9;

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
    case 'agent':
      return [];
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
  const ring = useRef<Mesh>(null);
  const downTime = useRef<number>(0);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const [x, z] = node.position;
  const isRobot = node.shape === 'agent' || node.shape === 'hub';
  const robotSize = node.shape === 'hub' ? 1.4 : 1;
  const lineColor = hovered ? ACCENT : LINE;

  const isClickable = Boolean(node.target && APP_LINKS[node.target]);
  const appLink = node.target ? APP_LINKS[node.target] : null;

  useFrame(() => {
    if (!group.current) return;
    const active = isNodeActive(node.id, scenarioNow());
    const isLit = hovered || active;
    const targetY = active ? 0.55 : (hovered ? HOVER_LIFT : 0);
    const targetScale = active ? 1.15 : (hovered ? 1.05 : 1.0);
    const y = group.current.position.y;
    group.current.position.y = y + (targetY - y) * 0.15;
    const s = group.current.scale.x;
    const nextScale = s + (targetScale - s) * 0.15;
    group.current.scale.set(nextScale, nextScale, nextScale);
    if (ring.current) {
      const m = ring.current.material as MeshStandardMaterial;
      const targetOpacity = isLit ? 0.95 : (isClickable ? 0.25 : (isRobot ? 0.15 : 0.0));
      m.opacity += (targetOpacity - m.opacity) * 0.2;
    }
  });

  const handleOver = (e: ThreeEvent<PointerEvent>): void => {
    e.stopPropagation();
    onHover(node.id);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    e.stopPropagation();
    if (isClickable) {
      onOpen(node);
    }
  };
  const handlePointerDown = (e: ThreeEvent<PointerEvent>): void => {
    downTime.current = Date.now();
    downPos.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = (e: ThreeEvent<PointerEvent>): void => {
    if (!downPos.current) return;
    const dt = Date.now() - downTime.current;
    const dx = Math.abs(e.clientX - downPos.current.x);
    const dy = Math.abs(e.clientY - downPos.current.y);
    downPos.current = null;
    if (dt < 600 && dx < 12 && dy < 12) {
      e.stopPropagation();
      if (isClickable) {
        onOpen(node);
      }
    }
  };

  return (
    <group
      ref={group}
      position={[x, 0, z]}
      onPointerOver={handleOver}
      onPointerOut={() => onHover(null)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
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
      {isRobot && (
        <Suspense fallback={null}>
          <AgentRobot agentId={node.id} hovered={hovered} size={robotSize} />
        </Suspense>
      )}
      <mesh ref={ring} position={[0, 0.03, 0]}>
        <cylinderGeometry
          args={[
            isRobot ? 0.75 * robotSize : 1.3,
            isRobot ? 0.75 * robotSize : 1.3,
            0.04,
            32,
          ]}
        />
        <meshStandardMaterial
          color="#5b5bf0"
          emissive="#5b5bf0"
          emissiveIntensity={0.8}
          transparent
          opacity={isRobot ? 0.15 : 0.0}
        />
      </mesh>
      <Html
        position={[0, isRobot ? ROBOT_LABEL_BOTTOM * robotSize : LABEL_BOTTOM, 0]}
        style={{ pointerEvents: isClickable ? 'auto' : 'none' }}
      >
        {isClickable && appLink ? (
          <a
            href={appLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`node-label is-clickable${hovered ? ' is-hovered' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <span className="node-label__head">
              <span className="material-symbols-outlined" aria-hidden="true">
                {node.icon}
              </span>
              <span className="node-label__title">{node.label}</span>
              <span className="material-symbols-outlined node-label__ext-icon" aria-hidden="true">
                open_in_new
              </span>
            </span>
          </a>
        ) : (
          <div className={`node-label${hovered ? ' is-hovered' : ''}`}>
            <span className="node-label__head">
              <span className="material-symbols-outlined" aria-hidden="true">
                {node.icon}
              </span>
              <span className="node-label__title">{node.label}</span>
            </span>
          </div>
        )}
      </Html>
    </group>
  );
}
