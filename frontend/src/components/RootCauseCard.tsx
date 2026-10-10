// RootCauseCard: 5-Whys deduction chain, causal hypothesis, and grounded RAG citations.
import React from 'react';
import type { AgentFinding } from '../types';
import IshikawaViewer from './IshikawaViewer';

export interface RootCauseCardProps {
  rootCause: string | null;
  suspectMachine: string | null;
  suspectTool: string | null;
  findings: AgentFinding[];
}

export default function RootCauseCard({
  rootCause,
  suspectMachine,
  suspectTool,
  findings,
}: RootCauseCardProps): React.ReactElement {
  return (
    <IshikawaViewer
      rootCause={rootCause}
      suspectMachine={suspectMachine}
      suspectTool={suspectTool}
      findings={findings}
    />
  );
}
