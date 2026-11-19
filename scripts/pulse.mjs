const API = 'https://data.cityofnewyork.us/resource/erm2-nwe9.json';
export const SOURCE = 'https://data.cityofnewyork.us/d/erm2-nwe9';
export const AREAS = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island', 'Unspecified'];
export const ZONE = 'America/New_York';
const DAY = 86_400_000;
const LIMIT = 5000;
const ENDPOINT_MAX_TRIES = 3;

export function localDate(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(({type,value}) => [type,value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function shiftDate(date, days) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}

export function windows(now, days = 7, lag = 1) {
  if (!Number.isInteger(days) || days < 1 || days > 31 || !Number.isInteger(lag) || lag < 0 || lag > 7) throw new RangeError('Invalid window');
  const end = shiftDate(localDate(now), -lag);
  const start = shiftDate(end, -days);
  return { current: {start, end}, previous: {start: shiftDate(start, -days), end: start} };
}

export function queryUrl({start, end}) {
  if (![start,end].every(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) || start >= end) throw new TypeError('Invalid date interval');
  const midnight = d => "'" + d + "T00:00:00.000'";
  const params = new URLSearchParams({
    '$select': 'date_trunc_ymd(created_date) as day,borough,complaint_type,count(*) as n',
    '$where': 'created_date >= ' + midnight(start) + ' and created_date < ' + midnight(end),
    '$group': 'date_trunc_ymd(created_date),borough,complaint_type',
    '$order': 'day,borough,complaint_type',
    '$limit': String(LIMIT)
  });
  return API + '?' + params;
}

export async function getRows(range, {fetcher = fetch, sleep = ms => new Promise(r => setTimeout(r,ms))} = {}) {
  const url = queryUrl(range);
  for (let attempt=0; attempt<ENDPOINT_MAX_TRIES; attempt++) {
    try {
      const response = await fetcher(url, {signal: AbortSignal.timeout(30_000), headers: {Accept: 'application/json'}});
      if (!response.ok) {
        const err = new Error('NYC Open Data HTTP ' + response.status);
        err.permanent = response.status !== 429 && response.status < 500;
        throw err;
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0 || rows.length >= LIMIT)
        throw Object.assign(new Error('Empty, malformed or capped aggregate response'), {permanent:true});
      return rows;
    } catch (error) {
      if (error.permanent || attempt === ENDPOINT_MAX_TRIES-1) throw error;
      await sleep(1000 * (2 ** attempt));
    }
  }
}

export function normalize(rows, range) {
  const groups = new Map();
  for (const row of rows) {
    const day = typeof row?.day === 'string' ? row.day.slice(0,10) : '';
    const n = Number(row?.n);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < range.start || day >= range.end || !/^[1-9]\d*$/.test(String(row?.n)) || !Number.isSafeInteger(n))
      throw new Error('Invalid row: missing or out-of-range day/count');
    const b = typeof row.borough === 'string' ? row.borough.trim().toLowerCase() : '';
    const area = AREAS.find(x => x.toLowerCase() === b) ?? 'Unspecified';
    const category = typeof row.complaint_type === 'string' ? row.complaint_type.trim() || 'Unspecified' : 'Unspecified';
    const key = JSON.stringify([day, area, category]);
    groups.set(key, (groups.get(key) ?? 0) + n);
  }
  return [...groups].map(([key,n]) => [...JSON.parse(key),n])
    .sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
}

export async function fetchSnapshot(now = new Date(), options) {
  const ranges = windows(now);
  const result = [];
  for (const [name, range] of Object.entries(ranges)) {
    const rows = normalize(await getRows(range, options), range);
    const observed = new Set(rows.map(row => row[0]));
    for (let d=range.start; d<range.end; d=shiftDate(d,1)) {
      if (!observed.has(d)) throw new Error('No citywide rows on ' + d + '; not publishing a partial ' + name + ' window.');
    }
    result.push([name, {...range, rows}]);
  }
  return {schema:1, mode:'published-data', generatedAt:now.toISOString(), timezone:ZONE, source:SOURCE, ...Object.fromEntries(result)};
}

export function sampleSnapshot() {
  const now = new Date('2025-04-16T15:00:00.000Z');
  const categories = ['Noise - Residential', 'Illegal Parking', 'Street Condition', 'Rodent', 'Missed Collection', 'Water System'];
  const rangeData = ({start,end}, period) => {
    const rows = [];
    for (let i=0; i<7; i++) for (let b=0; b<5; b++) for(let c=0; c<categories.length;c++) {
      rows.push([shiftDate(start,i), AREAS[b], categories[c], (b+3)*(7-c)*4 + (i*17+b*31+c*13+period*7)%49 + (period && c===2?29:0)]);
    }
    return {start,end,rows};
  };
  const w = windows(now);
  return {schema:1,mode:'sample',generatedAt:now.toISOString(),timezone:ZONE,source:SOURCE,
    current:rangeData(w.current,1),previous:rangeData(w.previous,0)};
}
