// Knowledge Hub UI helper types and formatting utilities.

export type TagTone = 'neutral' | 'accent' | 'red' | 'green';

export interface Tag {
  label: string;
  tone: TagTone;
  icon?: string;
}

export const DOCUMENT_CATEGORIES = [
  'manual',
  'maint_log',
  '8d_report',
  'spec',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  manual: 'Operating Manual',
  maint_log: 'Maintenance Log',
  '8d_report': '8D Incident Report',
  spec: 'Engineering Spec',
};

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
