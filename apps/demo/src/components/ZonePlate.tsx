// Tinted floor plate with a dashed outline and a chip label for one topology zone.
import React, { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import type { Zone, ZoneId } from '../types/topology';

const FILL: Record<ZoneId, string> = {
  onprem: '#e2e8f0',
  cloud: '#dbe1fb',
  people: '#d9f2e3',
};

const OUTLINE: Record<ZoneId, string> = {
  onprem: '#475569',
  cloud: '#5b5bf0',
  people: '#12a150',
};

interface ZonePlateProps {
  zone: Zone;
}

export default function ZonePlate({ zone }: ZonePlateProps): React.ReactElement {
  const [x0, z0, x1, z1] = zone.rect;
  const outline = useMemo<[number, number, number][]>(
    () => [
      [x0, 0.01, z0],
      [x1, 0.01, z0],
      [x1, 0.01, z1],
      [x0, 0.01, z1],
      [x0, 0.01, z0],
    ],
    [x0, z0, x1, z1],
  );

  return (
    <group>
      <mesh position={[(x0 + x1) / 2, -0.05, (z0 + z1) / 2]}>
        <boxGeometry args={[x1 - x0, 0.1, z1 - z0]} />
        <meshStandardMaterial color={FILL[zone.id]} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <Line points={outline} color={OUTLINE[zone.id]} lineWidth={1.5} dashed dashSize={0.4} gapSize={0.25} />
      {/* Front (bottom-screen) vertex: the far corner sits behind node labels. */}
      <Html position={[x1 + 0.6, 0.02, z1 + 0.6]} center style={{ pointerEvents: 'none' }}>
        <div className={`zone-pill zone-pill--${zone.id}`}>{zone.label}</div>
      </Html>
    </group>
  );
}
