// Domain types for the 3D system topology: nodes on the floor grid, routed edges, zones.

export type AppTarget = 'web' | 'mobile' | 'factory';

export type NodeShape =
  | 'machine'
  | 'gateway'
  | 'router'
  | 'database'
  | 'cloud'
  | 'hub'
  | 'agent'
  | 'phone'
  | 'monitor';

export type ZoneId = 'onprem' | 'cloud' | 'people' | 'team';

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
  /** Corner choice of the L-shaped route: x-first by default, `'zx'` goes z-first. */
  route?: 'zx';
  /** If true, the edge is hidden when idle and only appears/highlights when active or hovered. */
  dynamic?: boolean;
}

/** One beat of the looping incident scenario. */
export interface ScenarioStep {
  caption: string;
  seconds: number;
  /** Edge keys `from->to` that carry a packet during this step (start -> end, once). */
  edges: string[];
  /** Agent node ids shown as working (processing data) during this step. */
  working: string[];
}

export interface Zone {
  id: ZoneId;
  label: string;
  /** Floor rectangle `[x0, z0, x1, z1]`. */
  rect: [number, number, number, number];
  /** Floor `[x, z]` anchor of the zone chip. */
  chip: [number, number];
}
