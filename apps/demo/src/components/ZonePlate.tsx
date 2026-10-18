// Tinted floor plate with a dashed outline and a chip label for one topology zone.
import React, { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { Zone, ZoneId } from '../types/topology';

const FILL: Record<ZoneId, string> = {
  onprem: '#e2e8f0',
  cloud: '#dbe1fb',
  people: '#d9f2e3',
  team: '#ddd6fe',
};

const OUTLINE: Record<ZoneId, string> = {
  onprem: '#475569',
  cloud: '#5b5bf0',
  people: '#12a150',
  team: '#7c3aed',
};

interface ZonePlateProps {
  zone: Zone;
}

const TEAM_PORTS: [number, number][] = [
  [-12, 1],
  [-4, 1],
  [4, 1],
  [12, 1],
  [-4, -12],
  [12, -12],
];

export default function ZonePlate({ zone }: ZonePlateProps): React.ReactElement {
  const [x0, z0, x1, z1] = zone.rect;
  // The team plate sits on top of the cloud plate it lies inside.
  const plateY = zone.id === 'team' ? -0.01 : -0.05;
  const lineY = zone.id === 'team' ? 0.03 : 0.01;
  const outline = useMemo<[number, number, number][]>(
    () => [
      [x0, lineY, z0],
      [x1, lineY, z0],
      [x1, lineY, z1],
      [x0, lineY, z1],
      [x0, lineY, z0],
    ],
    [x0, z0, x1, z1, lineY],
  );

  return (
    <group>
      <mesh position={[(x0 + x1) / 2, plateY, (z0 + z1) / 2]} raycast={() => null}>
        <boxGeometry args={[x1 - x0, 0.1, z1 - z0]} />
        <meshStandardMaterial color={FILL[zone.id]} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <Line points={outline} color={OUTLINE[zone.id]} lineWidth={1.5} dashed dashSize={0.4} gapSize={0.25} />
      {zone.id === 'team' &&
        TEAM_PORTS.map(([px, pz], idx) => (
          <mesh key={idx} position={[px, lineY + 0.02, pz]}>
            <boxGeometry args={[0.8, 0.06, 0.3]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.5} />
          </mesh>
        ))}
      <Html position={[zone.chip[0], lineY + 0.01, zone.chip[1]]} center style={{ pointerEvents: 'none' }}>
        <div className={`zone-pill zone-pill--${zone.id}`}>{zone.label}</div>
      </Html>
    </group>
  );
}
