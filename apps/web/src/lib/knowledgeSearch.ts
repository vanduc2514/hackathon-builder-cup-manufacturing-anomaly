// Knowledge search: ranks verified 8D solutions against a plain-language question.
import type { VerifiedSolution } from './eightD';

export type HitKind = 'solution' | 'sop' | 'video';

export interface SearchHit {
  kind: HitKind;
  id: string;
  page?: number;
  title: string;
  snippet: string;
  score: number;
}

const STOP = new Set(
  'a an and are at be by can do does for from how i in is it me my of on or our should that the this to was what when where which who why will with we you'.split(' '),
);

/** Word stems for loose matching: "scratches" ~ "scratch", "worn" ~ "wear". */
const SYNONYM: Record<string, string> = {
  worn: 'wear',
  vibrating: 'vibration',
  vibrate: 'vibration',
  chatter: 'vibration',
  defects: 'defect',
  scratches: 'scratch',
};

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#\- ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => SYNONYM[t] ?? t.replace(/(es|s)$/, ''));
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

export function searchVerifiedSolutions(
  query: string,
  solutions: VerifiedSolution[],
  limit = 5,
): SearchHit[] {
  const q = terms(query);
  if (q.length === 0) return [];

  const docs = solutions.map((s) => ({
    kind: 'solution' as const,
    id: s.incidentId,
    title: `${s.defect}${s.machine ? ` on ${s.machine}` : ''} — verified fix · ${s.incidentId}`,
    body: [s.problem, s.rootCause, s.fix, s.workOrder, s.sopUpdate, s.lesson, s.machine, s.tool]
      .filter(Boolean)
      .join('. '),
  }));

  return docs
    .map((d) => {
      const title = terms(d.title);
      const body = terms(d.body);
      const raw = q.reduce(
        (sum, t) => sum + (title.includes(t) ? 3 : 0) + body.filter((b) => b === t).length,
        0,
      );
      const coverage = q.filter((t) => title.includes(t) || body.includes(t)).length / q.length;
      return { d, score: raw * coverage * 1.5 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d, score }) => ({
      kind: d.kind,
      id: d.id,
      title: d.title,
      snippet: bestSentence(d.body, q),
      score,
    }));
}
