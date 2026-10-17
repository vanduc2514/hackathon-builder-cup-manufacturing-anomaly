// One topology link routed as an L-shaped floor polyline, with packets flowing along it.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { TopologyEdge, TopologyNode } from '../types/topology';

const FLOOR_Y = 0.05;
const PACKET_Y = 0.16;
const SPEED = 2.5;

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

function buildRoute(from: TopologyNode, to: TopologyNode): Route {
  const [fx, fz] = from.position;
  const [tx, tz] = to.position;
  const points: Point[] =
    fx === tx || fz === tz
      ? [
          [fx, FLOOR_Y, fz],
          [tx, FLOOR_Y, tz],
        ]
      : [
          [fx, FLOOR_Y, fz],
          [tx, FLOOR_Y, fz],
          [tx, FLOOR_Y, tz],
        ];
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

export default function EdgeFlow({ edge, from, to, hoveredId }: EdgeFlowProps): React.ReactElement {
  const route = useMemo(() => buildRoute(from, to), [from, to]);
  const forward = useRef<Mesh>(null);
  const backward = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const travelled = clock.elapsedTime * SPEED;
    if (forward.current) placeAt(forward.current, route, travelled % route.total);
    if (backward.current) {
      placeAt(backward.current, route, route.total - ((travelled + route.total / 2) % route.total));
    }
  });

  const highlighted = hoveredId !== null && (hoveredId === edge.from || hoveredId === edge.to);
  const dimmed = hoveredId !== null && !highlighted;

  return (
    <group>
      <Line
        points={route.points}
        color={highlighted ? '#4338ca' : '#64748b'}
        lineWidth={highlighted ? 2.6 : 1.6}
        transparent
        opacity={dimmed ? 0.28 : 1}
      />
      <mesh ref={forward}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#5b5bf0" emissive="#5b5bf0" emissiveIntensity={0.6} />
      </mesh>
      {edge.bidir && (
        <mesh ref={backward}>
          <sphereGeometry args={[0.14, 16, 12]} />
          <meshStandardMaterial color="#5b5bf0" emissive="#5b5bf0" emissiveIntensity={0.6} />
        </mesh>
      )}
    </group>
  );
}
