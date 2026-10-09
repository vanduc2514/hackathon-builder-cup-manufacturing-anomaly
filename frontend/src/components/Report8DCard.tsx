// Report8DCard: 8D Incident Report viewer, containment actions, and shift-leader approval sign-off.
import React from 'react';
import type { AgentFinding } from '../types';
import DocumentApprovals from './DocumentApprovals';

export interface Report8DCardProps {
  incidentId: string;
  status: string;
  approved: boolean;
  documents?: Record<string, unknown>;
  findings?: AgentFinding[];
  suspectMachine?: string | null;
  suspectTool?: string | null;
  rootCause?: string | null;
  defectType?: string | null;
  onApproved?: () => void;
}

export default function Report8DCard(props: Report8DCardProps): React.ReactElement {
  return <DocumentApprovals {...props} />;
}
