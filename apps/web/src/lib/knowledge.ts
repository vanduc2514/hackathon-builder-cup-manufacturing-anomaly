// Knowledge Hub content: SOP runbooks and technician walkthrough videos (static reference library).

export type TagTone = 'neutral' | 'accent' | 'red' | 'green';

export interface Tag {
  label: string;
  tone: TagTone;
  icon?: string;
}

export interface SopMetric {
  label: string;
  value: string;
  tone?: 'accent' | 'red' | 'green' | 'ink';
}

export interface SopChangeLine {
  op: '+' | '-';
  text: string;
}

export interface SopChange {
  rev: string;
  date: string;
  author: string;
  reason: string;
  lines: SopChangeLine[];
}

export interface Sop {
  code: number;
  station: string;
  rev: string;
  updated: string;
  category: string;
  title: string;
  summary: string;
  tags: Tag[];
  metrics: SopMetric[];
  note: string;
  noteTrail: { kind: 'spark' | 'text' | 'status'; value: string };
  sideLink: { icon: string; label: string };
  action: string;
  safety?: boolean;
  walkthroughId?: string;
  changes: SopChange[];
}

export const SOP_CATEGORIES = [
  'CNC Milling',
  'Injection Molding',
  'Optical Metrology',
  'Hydraulics & Cooling',
  'Preventative Maint.',
  'Emergency Interlock',
] as const;

export const SOPS: Sop[] = [
  {
    code: 209,
    station: 'CNC-02',
    rev: '4.2',
    updated: '2h ago',
    category: 'CNC Milling',
    title: 'CNC-02 Spindle Damper Calibration & Zero-Set',
    summary: 'Step-by-step laser micro-gauge sequence, axial runout dampening, and automated torque sensor calibration.',
    tags: [
      { label: 'Milling Line-01', tone: 'neutral' },
      { label: '3D Ready', tone: 'accent', icon: 'view_in_ar' },
      { label: 'AI Verified', tone: 'accent' },
    ],
    metrics: [
      { label: 'Run Time', value: '4m 15s' },
      { label: 'Adherence', value: '99.8%', tone: 'accent' },
      { label: 'Cycles (M)', value: '142' },
    ],
    note: 'Axial Tolerance Target: ±0.0015mm',
    noteTrail: { kind: 'spark', value: '' },
    sideLink: { icon: 'schema', label: 'Schematic' },
    action: 'Launch Procedure',
    walkthroughId: 'MW-08',
    changes: [
      {
        rev: '4.2',
        date: '2h ago',
        author: 'Continuous Learning agent · approved by J. Taylor',
        reason: 'Root cause 8D-INC-A389F1: T07 insert ran past tool life, radial runout drifted.',
        lines: [
          { op: '-', text: 'radial_runout_tolerance_mm: 0.004' },
          { op: '+', text: 'radial_runout_tolerance_mm: 0.0015' },
          { op: '+', text: 'pre_run_check: laser_auto_offset' },
          { op: '+', text: 'tool_life_interlock_cycles: 440' },
        ],
      },
      {
        rev: '4.1',
        date: 'Mar 02',
        author: 'S. Jenkins (Tooling Lead)',
        reason: 'Torque spec aligned with OEM bulletin.',
        lines: [
          { op: '-', text: 'damper_torque_nm: 22.0' },
          { op: '+', text: 'damper_torque_nm: 24.5' },
        ],
      },
    ],
  },
  {
    code: 114,
    station: 'CAM-EOL',
    rev: '3.0',
    updated: '5d ago',
    category: 'Optical Metrology',
    title: 'Optical Defect Scan Recalibration for CAM-EOL',
    summary: 'Chromatic aberration compensation and illumination balance to neutralize false micro-scratch flags.',
    tags: [
      { label: 'Quality Gate', tone: 'neutral' },
      { label: 'Vision AI', tone: 'accent' },
      { label: 'Key-X480', tone: 'neutral' },
    ],
    metrics: [
      { label: 'Run Time', value: '8m 00s' },
      { label: 'False Positives Delta', value: '2.8% → 0.04%', tone: 'accent' },
    ],
    note: 'Strobe Flux: 18,200 Lux calibrated',
    noteTrail: { kind: 'status', value: 'Synchronized' },
    sideLink: { icon: 'history_edu', label: 'View History' },
    action: 'Launch Checklist',
    walkthroughId: 'WT-CAM',
    changes: [
      {
        rev: '3.0',
        date: '5d ago',
        author: 'E. Rostova (Lead Optical Eng)',
        reason: 'False scratch flags from specular glare on machined faces.',
        lines: [
          { op: '-', text: 'strobe_flux_lux: 15000' },
          { op: '+', text: 'strobe_flux_lux: 18200' },
          { op: '+', text: 'polarizer_angle_deg: 42' },
        ],
      },
    ],
  },
  {
    code: 305,
    station: 'IM-05',
    rev: '5.1',
    updated: '1w ago',
    category: 'Injection Molding',
    title: 'IM-05 Barrel Purge & Polymer Changeover',
    summary: 'Standardized dual-stage barrel thermal cycle flush and nozzle tip inspection before high-temp polyetherimide runs.',
    tags: [
      { label: 'Injection Molding', tone: 'neutral' },
      { label: 'Hydraulics', tone: 'neutral' },
      { label: 'Scrap Minimization', tone: 'accent' },
    ],
    metrics: [
      { label: 'Run Time', value: '12m 30s' },
      { label: 'Purge Material Saved', value: '42 kg / cycle', tone: 'accent' },
    ],
    note: 'Target Purge Temp: 340°C',
    noteTrail: { kind: 'text', value: 'PEI-1000 grade' },
    sideLink: { icon: 'description', label: 'Material Sheet' },
    action: 'Launch Procedure',
    changes: [
      {
        rev: '5.1',
        date: '1w ago',
        author: 'D. Kowalski (Master Millwright)',
        reason: 'Splay defects after PEI changeover; purge temperature raised.',
        lines: [
          { op: '-', text: 'purge_temp_c: 325' },
          { op: '+', text: 'purge_temp_c: 340' },
          { op: '+', text: 'nozzle_tip_inspection: required' },
        ],
      },
    ],
  },
  {
    code: 82,
    station: 'WASH-02',
    rev: '2.4',
    updated: '2w ago',
    category: 'Preventative Maint.',
    title: 'Ultrasonic ST-06 Transducer Calibration',
    summary: '40 kHz piezoelectric transducer impedance tuning and surfactant degreaser concentration measurement.',
    tags: [
      { label: 'Cleaning Bay', tone: 'neutral' },
      { label: 'Frequency Sweep', tone: 'accent' },
      { label: 'Preventative', tone: 'neutral' },
    ],
    metrics: [
      { label: 'Run Time', value: '6m 10s' },
      { label: 'Cleanliness Pass Rate', value: '100.0% ISO-16232', tone: 'accent' },
    ],
    note: 'Resonant Point: 39.92 kHz',
    noteTrail: { kind: 'text', value: 'Z=24.1Ω' },
    sideLink: { icon: 'edit_note', label: 'Log Test' },
    action: 'Launch Procedure',
    walkthroughId: 'WT-WASH',
    changes: [
      {
        rev: '2.4',
        date: '2w ago',
        author: 'S. Jenkins (Lead Maintenance)',
        reason: 'Transducer drift detected in quarterly sweep.',
        lines: [
          { op: '-', text: 'sweep_interval_days: 90' },
          { op: '+', text: 'sweep_interval_days: 30' },
        ],
      },
    ],
  },
  {
    code: 419,
    station: 'CNC (all)',
    rev: '1.9',
    updated: 'Tier 3 Safety',
    category: 'Emergency Interlock',
    title: 'Spindle Thermal Lockout Override & Diagnostic Trace',
    summary: 'Two-man interlock release protocol for Axis-Z overtemp tripwire with automated telemetry blackbox dump.',
    tags: [
      { label: 'Safety Critical', tone: 'red' },
      { label: 'Interlock', tone: 'neutral' },
      { label: 'Line Lead Auth', tone: 'accent' },
    ],
    metrics: [
      { label: 'Execution', value: 'Immediate', tone: 'red' },
      { label: 'Authorization Required', value: '2-Factor Phys. Key', tone: 'ink' },
    ],
    note: 'Dual Physical Key Interlock',
    noteTrail: { kind: 'text', value: 'OSHA 1910.147' },
    sideLink: { icon: 'verified_user', label: 'Auth Guidelines' },
    action: 'Review Protocol',
    safety: true,
    walkthroughId: 'WT-LOTO',
    changes: [
      {
        rev: '1.9',
        date: 'Feb 11',
        author: 'D. Perez (Chief Safety Officer)',
        reason: 'Annual OSHA 1910.147 review.',
        lines: [
          { op: '-', text: 'authorization: single_key' },
          { op: '+', text: 'authorization: dual_physical_key' },
          { op: '+', text: 'telemetry_blackbox_dump: automatic' },
        ],
      },
    ],
  },
  {
    code: 164,
    station: 'Coolant loop',
    rev: '2.0',
    updated: 'Jan 14',
    category: 'Hydraulics & Cooling',
    title: 'Coolant Micro-Filtration Manifold Flush',
    summary: 'Differential pressure sensor trigger check and dual-cartridge replacement procedure to prevent cavitation.',
    tags: [
      { label: '8D Kaizen Proven', tone: 'accent' },
      { label: 'Automated Purge', tone: 'neutral' },
      { label: 'Post-Resolution', tone: 'accent' },
    ],
    metrics: [
      { label: 'Run Time', value: '18m 00s' },
      { label: 'Cost Reduction (QTD)', value: '$21,400 Saved', tone: 'accent' },
    ],
    note: 'Zero pump cavitation in 90 days',
    noteTrail: { kind: 'spark', value: '' },
    sideLink: { icon: 'folder_open', label: '8D Archive' },
    action: 'Launch Procedure',
    changes: [
      {
        rev: '2.0',
        date: 'Jan 14',
        author: 'Continuous Learning agent · approved by J. Taylor',
        reason: '8D Kaizen: pump cavitation from clogged cartridge.',
        lines: [
          { op: '-', text: 'filter_change_trigger_bar: 1.2' },
          { op: '+', text: 'filter_change_trigger_bar: 0.8' },
          { op: '+', text: 'dual_cartridge: true' },
        ],
      },
    ],
  },
];

export interface Chapter {
  at: number;
  label: string;
}

export interface Walkthrough {
  id: string;
  station: string;
  title: string;
  shortTitle: string;
  category: string;
  asset: string;
  durationSec: number;
  image: string;
  badge: Tag;
  description: string;
  author: { initials: string; name: string; role: string };
  views: number;
  helpful: string;
  topics: string[];
  required?: boolean;
  chapters?: Chapter[];
  gates?: { at: number; text: string }[];
  sop?: number;
}

export const WALKTHROUGH_FILTERS = [
  '2-Min Micro-Walkthroughs',
  'Spindle & Tooling',
  'Hydraulics & Pressure',
  'Optics & Camera Alignment',
  'Safety & Interlocks',
  'Master Tech Verified',
] as const;

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'MW-08',
    station: 'CNC Milling',
    title: 'Master Walkthrough #08: Rapid Tool T07 Insert Replacement & Dial Indicator Runout Check',
    shortTitle: 'Tool T07 Insert Replacement & Runout Check',
    category: 'Standard Routine',
    asset: 'OKUMA-MILL-04',
    durationSec: 134,
    image: '/knowledge/wt-hero.jpg',
    badge: { label: 'Quality Guild Certified', tone: 'accent', icon: 'verified' },
    description: 'Master-guild routine for indexing the T07 carbide insert and verifying spindle runout without arbor detachment.',
    author: { initials: 'SJ', name: 'Sarah Jenkins', role: 'Tooling Bay 3B • 18 yrs exp • Master Guild Lead' },
    views: 418,
    helpful: '99% helpful',
    topics: ['Spindle & Tooling', 'Master Tech Verified'],
    chapters: [
      { at: 15, label: 'Torque Feel & Anti-Backlash' },
      { at: 55, label: 'Dial Indicator Runout Sync' },
      { at: 100, label: 'PLC Zero-Offset Calibration' },
    ],
    gates: [
      { at: 15, text: 'Tactile torque feel and anti-backlash seating on tungsten inserts.' },
      { at: 55, text: '30-second dial indicator runout verification without arbor detachment.' },
      { at: 100, text: 'Micro-gauge zero-offset synchronization with Fanuc 31i PLC.' },
    ],
    sop: 209,
  },
  {
    id: 'WT-DAMPER',
    station: 'CNC Milling',
    title: 'CNC-02 Spindle Damper Zero-Set Under 3 Minutes',
    shortTitle: 'CNC-02 Spindle Damper Zero-Set',
    category: 'Spindle Maintenance',
    asset: 'CNC-02',
    durationSec: 165,
    image: '/knowledge/wt-spindle-damper.jpg',
    badge: { label: 'Linked to INC-A389F1', tone: 'accent' },
    description: 'Real repair capture from Incident INC-A389F1 showing damper tensioner adjustment and vibration dampening.',
    author: { initials: 'MV', name: 'Marcus Vance (Badge #TECH-902)', role: 'Senior Mill Specialist' },
    views: 312,
    helpful: '98% helpful',
    topics: ['Spindle & Tooling'],
    required: true,
    sop: 209,
  },
  {
    id: 'WT-CAM',
    station: 'Vision QA · CAM-EOL',
    title: 'Keyence CV-X480 Camera Lens Cleaning & Polarization Angle Calibration',
    shortTitle: 'Keyence CV-X480 Lens Cleaning',
    category: 'Vision AI & Metrology',
    asset: 'CV-X480-OPTIC',
    durationSec: 110,
    image: '/knowledge/wt-camera-lens.jpg',
    badge: { label: 'Essential QA', tone: 'accent' },
    description: 'Correct lint-free wipe technique and polarizing filter rotation to eliminate specular glare on machined faces.',
    author: { initials: 'ER', name: 'Elena Rostova (Lead Optical Eng)', role: 'Lead Optical Engineer' },
    views: 540,
    helpful: '100% helpful',
    topics: ['Optics & Camera Alignment', '2-Min Micro-Walkthroughs', 'Master Tech Verified'],
    sop: 114,
  },
  {
    id: 'WT-VALVE',
    station: 'Injection Molding · IM-05',
    title: 'IM-05 Hydraulic Pressure Relief Valve Inspection & O-Ring Swap',
    shortTitle: 'IM-05 Relief Valve & O-Ring Swap',
    category: 'Extrusion & Hydraulics',
    asset: 'IM-05 PRESS',
    durationSec: 190,
    image: '/knowledge/wt-hydraulic-valve.jpg',
    badge: { label: 'Safety Certified', tone: 'green' },
    description: 'Depressurizing the line safely, valve spool extraction, and high-temp Viton seal placement without fluid leakage.',
    author: { initials: 'DK', name: 'Dave Kowalski (Master Millwright)', role: 'Master Millwright' },
    views: 219,
    helpful: '96% helpful',
    topics: ['Hydraulics & Pressure'],
  },
  {
    id: 'WT-WASH',
    station: 'Wash Line',
    title: 'Ultrasonic Degreaser Frequency Sweep & Transducer Test',
    shortTitle: 'Ultrasonic Degreaser Frequency Sweep',
    category: 'Chemical & Wash',
    asset: 'WASH-LINE-02',
    durationSec: 125,
    image: '/knowledge/wt-degreaser.jpg',
    badge: { label: 'SOP #082 Companion', tone: 'accent' },
    description: 'Using a handheld oscilloscope probe to check cavitation resonance across the 40 kHz bath.',
    author: { initials: 'SJ', name: 'Sarah Jenkins (Lead Maintenance)', role: 'Lead Maintenance' },
    views: 184,
    helpful: '95% helpful',
    topics: ['2-Min Micro-Walkthroughs', 'Hydraulics & Pressure'],
    sop: 82,
  },
  {
    id: 'WT-LASER',
    station: 'CNC Milling',
    title: 'Laser Micro-Gauge Zero-Offset Calibration for Axis-Z',
    shortTitle: 'Laser Micro-Gauge Zero-Offset',
    category: 'Tooling & Precision',
    asset: 'TITAN-MILL-AXIS',
    durationSec: 150,
    image: '/knowledge/wt-laser-gauge.jpg',
    badge: { label: 'Highly Rated', tone: 'accent' },
    description: 'Thermal cycle compensation and laser reflection beam calibration on high-speed milling arbors.',
    author: { initials: 'MV', name: 'Marcus Vance (Senior Mill Spec)', role: 'Senior Mill Specialist' },
    views: 405,
    helpful: '99% helpful',
    topics: ['Spindle & Tooling', 'Master Tech Verified'],
    required: true,
  },
  {
    id: 'WT-LOTO',
    station: 'Electrical & Safety',
    title: 'Lockout / Tagout (LOTO) Physical Verification for 480V Feeder Disconnect',
    shortTitle: 'LOTO Verification · 480V Feeder',
    category: 'Safety Protocol',
    asset: 'FEEDER-DIST-04',
    durationSec: 100,
    image: '/knowledge/wt-loto.jpg',
    badge: { label: 'Annual Mandatory', tone: 'red' },
    description: 'Mandatory zero-voltage test procedure with a calibrated multimeter before cabinet entry.',
    author: { initials: 'DP', name: 'Chief Safety Officer Dan Perez', role: 'Chief Safety Officer' },
    views: 1120,
    helpful: '100% compliant',
    topics: ['Safety & Interlocks', '2-Min Micro-Walkthroughs'],
    required: true,
    sop: 419,
  },
];

/** Machine stations in floor order; walkthroughs are grouped under these on the tablet list. */
export const WALKTHROUGH_STATIONS = [
  'CNC Milling',
  'Vision QA · CAM-EOL',
  'Injection Molding · IM-05',
  'Wash Line',
  'Electrical & Safety',
] as const;

export function formatDuration(sec: number): string {
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}

export function formatClockTime(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}
