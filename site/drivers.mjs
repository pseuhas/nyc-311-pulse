import { ALL, BOROUGHS, freshness, summarize, validateSnapshot } from './model.mjs';

export const DATASET = 'https://data.cityofnewyork.us/d/erm2-nwe9';
const MAX_DRIVERS = 12;
const ABSENT_METHODOLOGY = 'Requires a valid two-window snapshot; no estimates or causal claims.';
const METHODOLOGY = 'Counts are 311 service requests, not unique incidents or underlying prevalence. These are arithmetic contributions to observed change, not evidence of cause.';

function evidence(scope, snapshot = null, status = 'unavailable', reason = '') {
  return {
    scope, status, reason, source: DATASET, fetchedAt: snapshot?.generatedAt ?? null,
    windows: snapshot ? Object.fromEntries(['current','previous'].map(k=>[k,{start:snapshot[k].start,endExclusive:snapshot[k].end}])) : null,
    methodology: snapshot ? METHODOLOGY : ABSENT_METHODOLOGY,
  };
}

export function explainChange(snapshot, {borough = ALL, limit = 5, now = new Date()} = {}) {
  if (![ALL,...BOROUGHS].includes(borough)) throw new RangeError('Unsupported borough');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DRIVERS) throw new RangeError('Limit must be an integer between 1 and 12');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Expected a valid evaluation date');
  try { validateSnapshot(snapshot); }
  catch { return evidence(borough, null, 'unavailable', 'Missing or invalid source snapshot'); }
  if (snapshot.mode === 'sample') return evidence(borough, snapshot, 'sample', 'Synthetic sample counts are excluded from evidence.');
  // Reject a snapshot with a missing date; a genuine citywide zero warrants an explicit feed operator review.
  for (const w of [snapshot.current,snapshot.previous]) {
    const days = new Set(w.rows.map(row=>row[0]));
    if (days.size !== 7) return evidence(borough,snapshot,'unavailable','The snapshot has a missing reporting date.');
  }
  if (Date.parse(snapshot.generatedAt) > now.getTime()+5*60*1000)
    return evidence(borough,snapshot,'unavailable','The snapshot timestamp is in the future.');
  const state = freshness(snapshot, now);
  const {total,byCategory} = summarize(snapshot,borough);
  const nameOrder = (a,b) => a.name===b.name?0:a.name<b.name?-1:1;
  const ranked = byCategory.filter(d=>d.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||nameOrder(a,b));
  const detailed = ranked.slice(0,limit);
  const drivers = detailed.map(({name,current,previous,delta})=>({name,current,previous,delta}));
  const subtotal = drivers.reduce((sum,d)=>sum+d.delta,0);
  const allDelta = byCategory.reduce((sum,d)=>sum+d.delta,0);
  if (allDelta !== total.delta) return evidence(borough,snapshot,'unavailable','Category changes do not reconcile to totals.');
  return {
    ...evidence(borough,snapshot,state,state==='stale'?'Snapshot refresh is overdue; these are historical counts.':''),
    totals:{current:total.current,previous:total.previous,netDelta:total.delta},
    drivers, omittedCategories:ranked.length-drivers.length, otherDelta:allDelta-subtotal, reconciled:true,
  };
}
