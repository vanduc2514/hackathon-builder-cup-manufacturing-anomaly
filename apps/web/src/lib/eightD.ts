// 8D helpers: parse the Incident Scribe's report text, build the 5-Whys causal chain and the verified-solution record.
import type { AgentFinding, IncidentState } from '../types';
import { friendlyDefectName, matchesAgentRole } from './incident';

export interface Parsed8D {
  problem: string | null;
  directCause: string | null;
  rootCause: string | null;
  corrective: string | null;
}

const SENTENCE_END = '(?=\\.(?:\\s|$))';

function grab(text: string, pattern: string): string | null {
  const m = text.match(new RegExp(pattern, 'i'));
  return m ? m[1].trim() : null;
}

/** Splits "8D Report: <problem> due to <cause>. Root Cause: <root>. Corrective Action: <fix>." into parts. */
export function parse8D(text: string | null | undefined): Parsed8D {
  if (!text) return { problem: null, directCause: null, rootCause: null, corrective: null };
  return {
    problem: grab(text, `8D Report:\\s*(.+?)(?:\\s+due to|${SENTENCE_END})`),
    directCause: grab(text, `due to\\s+(.+?)${SENTENCE_END}`),
    rootCause: grab(text, `Root Cause:\\s*(.+?)${SENTENCE_END}`),
    corrective: grab(text, `Corrective Action:\\s*(.+?)\\.?$`),
  };
}

export interface WhyNode {
  level: number;
  question: string;
  answer: string;
  source: string;
  evidence?: string;
}

export interface CausalChain {
  nodes: WhyNode[];
  /** 'agent' when the Root Cause agent supplied five_whys; 'derived' when stitched from agent findings + 8D. */
  origin: 'agent' | 'derived';
}

const docText = (incident: IncidentState, key: string): string | null => {
  const v = incident.documents?.[key];
  return typeof v === 'string' ? v : null;
};

const latest = (findings: AgentFinding[], role: string) => findings.slice().reverse().find((f) => matchesAgentRole(f, role));

export function buildCausalChain(incident: IncidentState): CausalChain {
  const agentWhys = incident.findings.slice().reverse().find((f) => f.five_whys?.length)?.five_whys;
  if (agentWhys?.length) {
    return {
      origin: 'agent',
      nodes: agentWhys.map((w) => ({
        level: w.level,
        question: w.why,
        answer: w.answer,
        source: 'Root Cause agent',
        evidence: [w.evidence, w.citation].filter(Boolean).join(' · ') || undefined,
      })),
    };
  }

  const f = incident.findings;
  const qi = f.find((x) => matchesAgentRole(x, 'quality_inspector'));
  const trace = latest(f, 'traceability');
  const process = latest(f, 'process_analyst');
  const d8 = parse8D(docText(incident, 'report_8d'));
  const defect = friendlyDefectName(incident.defect_type).toLowerCase();

  const raw: Omit<WhyNode, 'level'>[] = [];
  if (qi) raw.push({ question: `Why were parts rejected?`, answer: qi.finding, source: qi.agent_name, evidence: qi.evidence });
  if (trace) raw.push({ question: `Where did the ${defect} come from?`, answer: trace.finding, source: trace.agent_name, evidence: trace.evidence });
  if (process) raw.push({ question: `What changed on ${incident.suspect_machine ?? 'the machine'}?`, answer: process.finding, source: process.agent_name, evidence: process.evidence });
  if (d8.directCause) raw.push({ question: 'Why did it change?', answer: capitalise(d8.directCause), source: 'Incident Scribe · 8D report' });
  if (d8.rootCause) raw.push({ question: 'Why was it not prevented?', answer: d8.rootCause, source: 'Incident Scribe · 8D report' });

  return { origin: 'derived', nodes: raw.map((n, i) => ({ ...n, level: i + 1 })) };
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The systemic root cause to show: agent 5-Whys bottom line, else the 8D root cause, else null. */
export function rootCauseOf(incident: IncidentState): string | null {
  const chain = buildCausalChain(incident);
  if (chain.origin === 'agent') return chain.nodes[chain.nodes.length - 1]?.answer ?? null;
  return parse8D(docText(incident, 'report_8d')).rootCause;
}

export interface VerifiedSolution {
  incidentId: string;
  recordedAt: string;
  defect: string;
  machine: string | null;
  tool: string | null;
  problem: string;
  rootCause: string | null;
  fix: string | null;
  workOrder: string | null;
  sopUpdate: string | null;
  lesson: string | null;
  verified: string;
  approved: boolean;
  report8d: string | null;
  team: string[];
}

/** Snapshot of a closed incident as a reusable, verified solution (feeds the Knowledge Base table and 8D views). */
export function buildSolution(incident: IncidentState): VerifiedSolution {
  const f = incident.findings;
  const report = docText(incident, 'report_8d');
  const d8 = parse8D(report);
  const qi = f.find((x) => matchesAgentRole(x, 'quality_inspector'));
  return {
    incidentId: incident.incident_id,
    recordedAt: new Date().toISOString(),
    defect: friendlyDefectName(incident.defect_type),
    machine: incident.suspect_machine,
    tool: incident.suspect_tool,
    problem: d8.problem ?? qi?.finding ?? friendlyDefectName(incident.defect_type),
    rootCause: rootCauseOf(incident),
    fix: d8.corrective ?? latest(f, 'technician_copilot')?.finding ?? null,
    workOrder: docText(incident, 'work_order'),
    sopUpdate: docText(incident, 'sop_proposal'),
    lesson: latest(f, 'continuous_learning')?.finding ?? null,
    verified: `${incident.verification_count}/${incident.verification_target}`,
    approved: incident.approved,
    report8d: report,
    team: Array.from(new Set(f.map((x) => x.agent_name))),
  };
}

export interface EightDStep {
  d: string;
  /** Plain-language heading a technician reads first. */
  title: string;
  /** Formal 8D discipline name, shown small for auditors. */
  term: string;
  body: string | null;
  detail?: string;
  done: boolean;
}

/** True once the verified count reached its target ("50/50"). */
export function proofComplete(s: VerifiedSolution): boolean {
  const [count, target] = s.verified.split('/').map(Number);
  return Number.isFinite(count) && Number.isFinite(target) && target > 0 && count >= target;
}

const APPROVER = 'John Tran (Shift Leader)';

/** D1–D8 for a solution in plain language; `done` marks which disciplines already have content. */
export function eightDSteps(s: VerifiedSolution): EightDStep[] {
  const proof = proofComplete(s);
  const where = [s.machine, s.tool ? `tool ${s.tool}` : null].filter(Boolean).join(' · ');
  return [
    { d: 'D1', title: 'Who worked on it', term: 'Team', body: [...s.team, `${APPROVER}, approver`].join(' · '), done: s.team.length > 0 },
    { d: 'D2', title: 'What went wrong', term: 'Problem', body: s.problem, detail: [s.defect, where].filter(Boolean).join(' · '), done: true },
    { d: 'D3', title: 'How bad parts were stopped', term: 'Containment', body: s.workOrder, done: Boolean(s.workOrder) },
    { d: 'D4', title: 'Why it happened', term: 'Root cause', body: s.rootCause, done: Boolean(s.rootCause) },
    { d: 'D5', title: 'What was fixed', term: 'Corrective action', body: s.fix, done: Boolean(s.fix) },
    {
      d: 'D6',
      title: 'How the fix was proven',
      term: 'Verification',
      body: `${s.verified} good parts in a row at the end-of-line camera.`,
      detail: proof ? undefined : 'Still counting — the streak resets if a bad part comes through.',
      done: proof,
    },
    { d: 'D7', title: 'How we stop it coming back', term: 'Prevent recurrence', body: s.sopUpdate, detail: s.lesson ?? undefined, done: Boolean(s.sopUpdate || s.lesson) },
    {
      d: 'D8',
      title: 'Sign-off',
      term: 'Closure',
      body: s.approved
        ? `Approved by ${APPROVER}. Line released and record archived.`
        : proof
          ? `Ready for ${APPROVER} to approve.`
          : 'Waiting for the good-part streak before it can be signed.',
      done: s.approved,
    },
  ];
}

/** The 8D as a Markdown file for download / sharing. */
export function eightDMarkdown(s: VerifiedSolution): string {
  const lines = [`# 8D Report — ${s.incidentId}`, '', `${s.defect}${s.machine ? ` on ${s.machine}` : ''} · ${s.approved ? 'Approved' : 'Awaiting sign-off'}`, ''];
  for (const step of eightDSteps(s)) {
    lines.push(`## ${step.d} ${step.term} — ${step.title}`, step.body ?? '_Not recorded yet._');
    if (step.detail) lines.push('', step.detail);
    lines.push('');
  }
  if (s.report8d) lines.push('## Original Incident Scribe text', s.report8d, '');
  return lines.join('\n');
}
