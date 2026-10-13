// Knowledge search: ranks verified 8D solutions, SOPs and walkthroughs against a plain-language question.
import type { VerifiedSolution } from './eightD';
import { SOPS, WALKTHROUGHS } from './knowledge';

export type HitKind = 'solution' | 'sop' | 'video';

export interface SearchHit {
  kind: HitKind;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

interface Doc {
  kind: HitKind;
  id: string;
  title: string;
  body: string;
  /** Verified fixes from this line outrank generic reference material at equal relevance. */
  boost: number;
}

const STOP = new Set(
  'a an and are at be by can do does for from how i in is it me my of on or our should that the this to was what when where which who why will with we you'.split(' '),
);

/** Word stems for loose matching: "scratches" ~ "scratch", "worn" ~ "wear". */
const SYNONYM: Record<string, string> = { worn: 'wear', vibrating: 'vibration', vibrate: 'vibration', chatter: 'vibration', defects: 'defect' };

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#\- ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => SYNONYM[t] ?? t.replace(/(es|s)$/, ''));
}

function buildIndex(solutions: VerifiedSolution[]): Doc[] {
  const docs: Doc[] = solutions.map((s) => ({
    kind: 'solution',
    id: s.incidentId,
    title: `${s.defect}${s.machine ? ` on ${s.machine}` : ''} — verified fix · ${s.incidentId}`,
    body: [s.problem, s.rootCause, s.fix, s.workOrder, s.sopUpdate, s.lesson, s.machine, s.tool].filter(Boolean).join('. '),
    boost: 1.5,
  }));
  for (const sop of SOPS) {
    docs.push({
      kind: 'sop',
      id: String(sop.code),
      title: `SOP #${String(sop.code).padStart(3, '0')} · ${sop.title}`,
      body: [sop.summary, sop.station, sop.category, sop.note, ...sop.changes.map((c) => c.reason)].join('. '),
      boost: 1,
    });
  }
  for (const w of WALKTHROUGHS) {
    docs.push({ kind: 'video', id: w.id, title: w.shortTitle, body: [w.title, w.description, w.asset, w.station].join('. '), boost: 1 });
  }
  return docs;
}

/** Best-matching sentence of the body, so each hit shows why it matched. */
function bestSentence(body: string, q: string[]): string {
  const sentences = body.split(/(?<=\.)\s+/).filter(Boolean);
  let best = sentences[0] ?? '';
  let bestScore = -1;
  for (const s of sentences) {
    const t = new Set(terms(s));
    const sc = q.filter((x) => t.has(x)).length;
    if (sc > bestScore) [best, bestScore] = [s, sc];
  }
  return best;
}

export function searchKnowledge(query: string, solutions: VerifiedSolution[], limit = 6): SearchHit[] {
  const q = terms(query);
  if (q.length === 0) return [];
  return buildIndex(solutions)
    .map((d) => {
      const title = terms(d.title);
      const body = terms(d.body);
      const raw = q.reduce((sum, t) => sum + (title.includes(t) ? 3 : 0) + body.filter((b) => b === t).length, 0);
      const coverage = q.filter((t) => title.includes(t) || body.includes(t)).length / q.length;
      return { d, score: raw * coverage * d.boost };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({ kind: d.kind, id: d.id, title: d.title, snippet: bestSentence(d.body, q), score }));
}
