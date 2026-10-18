// One topology link routed as an L-shaped floor polyline; it carries one packet
// start -> end during the scenario steps that use it.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { Line2, LineMaterial, LineSegments2 } from 'three-stdlib';
import { AGENT_IDS, SCENARIO, edgeKey, isAgentId, scenarioAt, scenarioNow } from '../data/topology';
import type { TopologyEdge, TopologyNode } from '../types/topology';

const FLOOR_Y = 0.05;
const PACKET_Y = 0.16;
const ACTIVE = '#2563eb';
const IDLE = '#64748b';

type Point = [number, number, number];

interface EdgeFlowProps {
  edge: TopologyEdge;
  from: TopologyNode;
  to: TopologyNode;
  highlightedId: string | null;
}

interface Route {
  points: Point[];
  /** cumulative[i] = arc length from points[0] to points[i]. */
  cumulative: number[];
  total: number;
}

function buildRoute(
  from: TopologyNode,
  to: TopologyNode,
  edge: TopologyEdge,
): Route {
  const fx = edge.fromPort ? edge.fromPort[0] : from.position[0];
  const fz = edge.fromPort ? edge.fromPort[1] : from.position[1];
  const tx = edge.toPort ? edge.toPort[0] : to.position[0];
  const tz = edge.toPort ? edge.toPort[1] : to.position[1];
  const via = edge.route;
  const waypoints = edge.waypoints;

  let points: Point[];
  if (waypoints && waypoints.length > 0) {
    points = [
      [fx, FLOOR_Y, fz],
      ...waypoints.map(([wx, wz]) => [wx, FLOOR_Y, wz] as Point),
      [tx, FLOOR_Y, tz],
    ];
  } else {
    const corner: Point = via === 'zx' ? [fx, FLOOR_Y, tz] : [tx, FLOOR_Y, fz];
    points =
      fx === tx || fz === tz
        ? [
            [fx, FLOOR_Y, fz],
            [tx, FLOOR_Y, tz],
          ]
        : [[fx, FLOOR_Y, fz], corner, [tx, FLOOR_Y, tz]];
  }
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

export default function EdgeFlow({ edge, from, to, highlightedId }: EdgeFlowProps): React.ReactElement {
  const route = useMemo(() => buildRoute(from, to, edge), [from, to, edge]);
  const isGeminiEdge = edge.to === 'gemini';
  const steps = useMemo(
    () =>
      SCENARIO.flatMap((s, i) =>
        s.edges.includes(edgeKey(edge)) || (isGeminiEdge && s.working.some((w) => AGENT_IDS.has(w)))
          ? [i]
          : [],
      ),
    [edge, isGeminiEdge],
  );
  const line = useRef<Line2 | LineSegments2>(null);
  const packet = useRef<Mesh>(null);

  const highlighted =
    highlightedId !== null &&
    (highlightedId === edge.from ||
      highlightedId === edge.to ||
      (isGeminiEdge && (isAgentId(highlightedId) || highlightedId === 'gemini')));
  const dimmed = highlightedId !== null && !highlighted;
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
    let width = active ? 3.6 : 1.4;
    let opacity = active ? 1 : (edge.dynamic ? 0 : 0.45);
    if (hover.current.highlighted) {
      color = ACTIVE;
      width = 3.2;
      opacity = 1;
    } else if (hover.current.dimmed) {
      opacity = edge.dynamic ? 0 : 0.2;
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
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#2563eb" emissive="#3b82f6" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}
