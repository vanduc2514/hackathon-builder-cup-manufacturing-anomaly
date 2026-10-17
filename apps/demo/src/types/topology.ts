// Domain types for the 3D system topology: nodes on the floor grid, routed edges, zones.

export type AppTarget = 'web' | 'mobile' | 'factory';

export type NodeShape =
  | 'machine'
  | 'gateway'
  | 'router'
  | 'database'
  | 'cloud'
  | 'hub'
  | 'agents'
  | 'phone'
  | 'monitor';

export type ZoneId = 'onprem' | 'cloud' | 'people';

export interface TopologyNode {
  id: string;
  label: string;
  sublabel: string;
  shape: NodeShape;
  zone: ZoneId;
  /** Grid `[x, z]` on the floor plane. */
  position: [number, number];
  target: AppTarget;
  /** Material Symbols icon name. */
  icon: string;
}

export interface TopologyEdge {
  from: string;
  to: string;
  label: string;
  bidir?: boolean;
}

export interface Zone {
  id: ZoneId;
  label: string;
  /** Floor rectangle `[x0, z0, x1, z1]`. */
  rect: [number, number, number, number];
}
