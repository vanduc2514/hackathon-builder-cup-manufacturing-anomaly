// One topology link routed as an L-shaped floor polyline; it carries one packet
// start -> end during the scenario steps that use it.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { Line2, LineMaterial, LineSegments2 } from 'three-stdlib';
import { SCENARIO, edgeKey, scenarioAt, scenarioNow } from '../data/topology';
import type { TopologyEdge, TopologyNode } from '../types/topology';

const FLOOR_Y = 0.05;
const PACKET_Y = 0.16;
const ACTIVE = '#4338ca';
const IDLE = '#64748b';

type Point = [number, number, number];

interface EdgeFlowProps {
  edge: TopologyEdge;
  from: TopologyNode;
  to: TopologyNode;
  hoveredId: string | null;
}

interface Route {
  points: Point[];
  /** cumulative[i] = arc length from points[0] to points[i]. */
  cumulative: number[];
  total: number;
}

function buildRoute(from: TopologyNode, to: TopologyNode, via: TopologyEdge['route']): Route {
  const [fx, fz] = from.position;
  const [tx, tz] = to.position;
  const corner: Point = via === 'zx' ? [fx, FLOOR_Y, tz] : [tx, FLOOR_Y, fz];
  const points: Point[] =
    fx === tx || fz === tz
      ? [
          [fx, FLOOR_Y, fz],
          [tx, FLOOR_Y, tz],
        ]
      : [[fx, FLOOR_Y, fz], corner, [tx, FLOOR_Y, tz]];
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const [ax, , az] = points[i - 1];
    const [bx, , bz] = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return { points, cumulative, total: cumulative[cumulative.length - 1] };
}

function placeAt(mesh: Mesh, route: Route, distance: number): void {
  const { points, cumulative } = route;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < distance) i += 1;
  const span = cumulative[i] - cumulative[i - 1];
  const t = span === 0 ? 0 : (distance - cumulative[i - 1]) / span;
  const [ax, , az] = points[i - 1];
  const [bx, , bz] = points[i];
  mesh.position.set(ax + (bx - ax) * t, PACKET_Y, az + (bz - az) * t);
}

const easeInOut = (p: number): number => p * p * (3 - 2 * p);

export default function EdgeFlow({ edge, from, to, hoveredId }: EdgeFlowProps): React.ReactElement {
  const route = useMemo(() => buildRoute(from, to, edge.route), [from, to, edge.route]);
  const steps = useMemo(
    () => SCENARIO.flatMap((s, i) => (s.edges.includes(edgeKey(edge)) ? [i] : [])),
    [edge],
  );
  const line = useRef<Line2 | LineSegments2>(null);
  const packet = useRef<Mesh>(null);

  const highlighted = hoveredId !== null && (hoveredId === edge.from || hoveredId === edge.to);
  const dimmed = hoveredId !== null && !highlighted;
  const hover = useRef({ highlighted, dimmed });
  hover.current = { highlighted, dimmed };

  useFrame(() => {
    const { index, progress } = scenarioAt(scenarioNow());
    const active = steps.includes(index);
    if (packet.current) {
      packet.current.visible = active;
      if (active) placeAt(packet.current, route, route.total * easeInOut(progress));
    }
    let color = active ? ACTIVE : IDLE;
    let width = active ? 3 : 1.4;
    let opacity = active ? 1 : 0.45;
    if (hover.current.highlighted) {
      color = ACTIVE;
      width = 2.6;
      opacity = 1;
    } else if (hover.current.dimmed) {
      opacity = 0.2;
    }
    if (line.current) {
      const m = line.current.material as LineMaterial;
      m.color.set(color);
      m.linewidth = width;
      m.opacity = opacity;
    }
  });

  return (
    <group>
      <Line ref={line} points={route.points} transparent />
      <mesh ref={packet} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#5b5bf0" emissive="#5b5bf0" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}
