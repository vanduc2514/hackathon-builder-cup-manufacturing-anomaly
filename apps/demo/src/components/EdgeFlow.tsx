// One topology link routed as an L-shaped floor polyline with arrowheads; it carries one packet
// start -> end during the scenario steps that use it.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Quaternion, Vector3, type Mesh, type MeshStandardMaterial } from 'three';
import type { Line2, LineMaterial, LineSegments2 } from 'three-stdlib';
import { SCENARIO, edgeKey, scenarioAt, scenarioNow } from '../data/topology';
import type { TopologyEdge, TopologyNode } from '../types/topology';

const FLOOR_Y = 0.05;
const PACKET_Y = 0.16;
const ACTIVE = '#4338ca';
const IDLE = '#64748b';
const ARROW_INSET = 1.1;

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

interface ArrowPose {
  position: Point;
  quaternion: Quaternion;
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

/** Arrowhead inset from the route end, or from the start pointing back at the start node. */
function arrowPose(route: Route, atEnd: boolean): ArrowPose {
  const { points } = route;
  const [ax, , az] = atEnd ? points[points.length - 2] : points[1];
  const [bx, , bz] = atEnd ? points[points.length - 1] : points[0];
  const length = Math.hypot(bx - ax, bz - az);
  const d = new Vector3((bx - ax) / length, 0, (bz - az) / length);
  const inset = Math.min(ARROW_INSET, length / 2);
  return {
    position: [bx - d.x * inset, FLOOR_Y + 0.02, bz - d.z * inset],
    // The cone points +Y; turn it along the segment.
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d),
  };
}

const easeInOut = (p: number): number => p * p * (3 - 2 * p);

export default function EdgeFlow({ edge, from, to, hoveredId }: EdgeFlowProps): React.ReactElement {
  const route = useMemo(() => buildRoute(from, to, edge.route), [from, to, edge.route]);
  const arrows = useMemo(
    () => (edge.bidir ? [arrowPose(route, true), arrowPose(route, false)] : [arrowPose(route, true)]),
    [route, edge.bidir],
  );
  const steps = useMemo(
    () => SCENARIO.flatMap((s, i) => (s.edges.includes(edgeKey(edge)) ? [i] : [])),
    [edge],
  );
  const line = useRef<Line2 | LineSegments2>(null);
  const packet = useRef<Mesh>(null);
  const arrowMaterials = useRef<(MeshStandardMaterial | null)[]>([]);

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
    for (const m of arrowMaterials.current) {
      if (!m) continue;
      m.color.set(color);
      m.opacity = opacity;
    }
  });

  return (
    <group>
      <Line ref={line} points={route.points} transparent />
      {arrows.map((pose, i) => (
        <mesh key={i} position={pose.position} quaternion={pose.quaternion} raycast={() => null}>
          <coneGeometry args={[0.28, 0.7, 12]} />
          <meshStandardMaterial
            ref={(m) => {
              arrowMaterials.current[i] = m;
            }}
            color={IDLE}
            transparent
          />
        </mesh>
      ))}
      <mesh ref={packet} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#5b5bf0" emissive="#5b5bf0" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}
