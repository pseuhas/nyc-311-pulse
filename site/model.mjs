export const ALL = 'All boroughs';
export const BOROUGHS = ['Bronx','Brooklyn','Manhattan','Queens','Staten Island','Unspecified'];
const DAY_MS = 86_400_000;
const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x));

export function validateSnapshot(s) {
  if (s?.schema !== 1 || !['sample','published-data'].includes(s.mode) || typeof s.generatedAt !== 'string' || !Number.isFinite(Date.parse(s.generatedAt)) || s.timezone !== 'America/New_York')
    throw Error('Snapshot schema not recognized');
  const validate = p => {
    if (!date(p?.start) || !date(p?.end) || (Date.parse(p.end)-Date.parse(p.start))/DAY_MS !== 7 || !Array.isArray(p.rows) || p.rows.length === 0)
      throw Error('Missing or invalid reporting period');
    for (const r of p.rows)
      if (!Array.isArray(r) || r.length !== 4 || !date(r[0]) || r[0] < p.start || r[0] >= p.end || !BOROUGHS.includes(r[1]) || typeof r[2] !== 'string' || !r[2] || !Number.isSafeInteger(r[3]) || r[3] < 1)
        throw Error('Invalid aggregate row');
  };
  validate(s.current);
  validate(s.previous);
  if (s.current.start !== s.previous.end) throw Error('Periods are not contiguous');
  return s;
}

export function dates(period) {
  return Array.from({length:7}, (_,i) => new Date(Date.parse(period.start) + DAY_MS*i).toISOString().slice(0,10));
}

export function summarize(snapshot, area = ALL) {
  const currentDaily = new Map(dates(snapshot.current).map(d=>[d,0]));
  const previousDaily = new Map(dates(snapshot.previous).map(d=>[d,0]));
  const areas = new Map(BOROUGHS.map(x=>[x,[0,0]]));
  const categories = new Map();
  [snapshot.current,snapshot.previous].forEach((p,i) => {
    const daily = i === 0 ? currentDaily : previousDaily;
    for (const [day, b, category, n] of p.rows) {
      areas.get(b)[i] += n;
      if (area !== ALL && b !== area) continue;
      daily.set(day,daily.get(day)+n);
      if (!categories.has(category)) categories.set(category,[0,0]);
      categories.get(category)[i] += n;
    }
  });
  const nums = ([name,[current,previous]]) => ({name,current,previous,delta:current-previous,pct:previous ? (current-previous)/previous : null});
  const byCategory = Array.from(categories, nums).sort((a,b)=>b.current-a.current||a.name.localeCompare(b.name));
  const byArea = Array.from(areas,nums).sort((a,b)=> b.current-a.current || a.name.localeCompare(b.name));
  const sum = m => [...m.values()].reduce((a,b)=>a+b,0);
  return {currentDaily:[...currentDaily],previousDaily:[...previousDaily],byArea,byCategory,total:nums([area,[sum(currentDaily),sum(previousDaily)]])};
}

export function freshness(snapshot, now = new Date()) {
  if (snapshot.mode === 'sample') return 'sample';
  const age = now - new Date(snapshot.generatedAt);
  return age > 36*60*60*1000 ? 'stale' : 'recent';
}
