// The 2013 PHP service is replaced by a local, persistent Top 5. No request leaves the machine.
import { get, set } from 'zinc:storage';
export interface Score { user_name: string; score: number; }
const KEY = 'fatty.top5';
export function getHighScores(): Score[] {
  const saved = get(KEY);
  const parsed: unknown = saved ? JSON.parse(saved) : [];
  if (!Array.isArray(parsed)) throw new Error('Fatty: invalid saved scores');
  const scores: Score[] = [];
  for (const row of parsed as Score[]) {
    if (!row || typeof row.user_name !== 'string' || !Number.isFinite(row.score) || row.score < 0) {
      throw new Error('Fatty: invalid saved score');
    }
    scores.push({ user_name: row.user_name.slice(0,24), score: Math.floor(row.score) });
  }
  scores.sort((a,b) => b.score-a.score);
  scores.length = Math.min(5,scores.length);
  while (scores.length < 5) scores.push({ user_name: '—', score: 0 });
  return scores;
}
export function saveScore(name: string, score: number): void {
  if (!Number.isFinite(score) || score <= 0) throw new Error('Fatty: invalid score');
  const scores = getHighScores().filter(s => s.score > 0);
  scores.push({ user_name: name.trim().slice(0,24) || 'Anonyme', score: Math.floor(score) });
  scores.sort((a,b) => b.score-a.score);
  set(KEY,JSON.stringify(scores.slice(0,5)));
}
