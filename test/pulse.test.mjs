import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windows, queryUrl, localDate, shiftDate, normalize, getRows, fetchSnapshot, sampleSnapshot } from '../scripts/pulse.mjs';
import { validateSnapshot, summarize, freshness } from '../site/model.mjs';

test('New York calendar dates survive UTC midnight and DST weekend', () => {
  assert.equal(localDate(new Date('2026-11-02T02:00:00Z')),'2026-11-01');
  assert.deepEqual(windows(new Date('2026-11-02T02:00:00Z')),{
    current:{start:'2026-10-24',end:'2026-10-31'},
    previous:{start:'2026-10-17',end:'2026-10-24'}
  });
});
test('SoQL requests only aggregate data and uses half-open time bounds', () => {
  const url = new URL(queryUrl({start:'2026-11-01',end:'2026-11-08'}));
  assert.equal(url.host,'data.cityofnewyork.us');
  assert.equal(url.pathname,'/resource/erm2-nwe9.json');
  assert.equal(url.searchParams.get('$select'),'date_trunc_ymd(created_date) as day,borough,complaint_type,count(*) as n');
  assert.match(url.searchParams.get('$where'),/created_date >= '2026-11-01.*and created_date < '2026-11-08/);
  assert.throws(()=>queryUrl({start:"2026-11-01' or true",end:'2026-11-08'}), /Invalid/);
});
test('unknown borough merges, source display-case preserved, no raw data retained', () => {
  const b={start:'2026-11-01',end:'2026-11-08'};
  assert.deepEqual(normalize([
    {day:'2026-11-04T00:00:00.000',borough:'UNSPECIFIED',complaint_type:' Noise ',n:'2',incident_address:'must-not-leak'},
    {day:'2026-11-04T00:00:00.000',borough:null,complaint_type:'Noise',n:'4'}
  ],b), [['2026-11-04','Unspecified','Noise',6]]);
  assert.throws(()=>normalize([{day:'2026-11-08T00:00:00.000',n:'3'}],b),/Invalid row/);
  assert.throws(()=>normalize([{day:'2026-11-03',n:'5.0'}],b),/Invalid row/);
});
test('temporary errors retry and invalid responses fail closed', async () => {
  const b={start:'2026-11-01',end:'2026-11-08'};
  const row={day:'2026-11-03',n:'5'};
  let hits=0, pauses=[];
  assert.deepEqual(await getRows(b,{fetcher:async()=>++hits===1?{ok:false,status:429}:{ok:true,json:async()=>[row]},sleep:async ms=>{pauses.push(ms)}}),[row]);
  assert.deepEqual(pauses,[1000]);
  await assert.rejects(getRows(b,{fetcher:async()=>({ok:true,json:async()=>[]})}),/capped aggregate/);
  await assert.rejects(getRows(b,{fetcher:async()=>({ok:true,json:async()=>Array(5000).fill(row)})}),/capped aggregate/);
});
test('build refuses partial periods and happy path reports exactly two windows', async () => {
  const now=new Date('2026-11-10T16:00:00Z');
  const options={fetcher:async raw=>{
    const where=new URL(raw).searchParams.get('$where');
    const start=where.match(/\d{4}-\d{2}-\d{2}/)[0];
    const rows=Array.from({length:7},(_,i)=>({day:shiftDate(start,i),borough:'BRONX',complaint_type:'Pothole',n:'5'}));
    return {ok:true,json:async()=>rows};
  }};
  const result=validateSnapshot(await fetchSnapshot(now,options));
  assert.equal(result.mode,'published-data');
  assert.equal(summarize(result).total.current,35);
  assert.equal(summarize(result).total.pct,0);
  options.fetcher=async()=>({ok:true,json:async()=>[{day:windows(now).current.start,n:'5'}]});
  await assert.rejects(fetchSnapshot(now,options),/not publishing a partial/);
});
test('filter reconciles to city total; no comparison denominator is not infinity', () => {
  const sample=validateSnapshot(sampleSnapshot());
  const city=summarize(sample);
  assert.equal(city.total.current,city.byArea.reduce((s,x)=>s+x.current,0));
  const bronx=summarize(sample,'Bronx');
  assert.equal(bronx.total.current,city.byArea.find(x=>x.name==='Bronx').current);
  assert.equal(bronx.total.current,bronx.byCategory.reduce((s,x)=>s+x.current,0));
  sample.current.rows.push([sample.current.start,'Bronx','New problem',100]);
  assert.equal(summarize(sample,'Bronx').byCategory.find(x=>x.name==='New problem').pct,null);
  assert.equal(freshness(sample),'sample');
  sample.mode='published-data';
  assert.equal(freshness(sample,new Date('2025-04-18T04:00:00Z')),'stale');
  assert.equal(freshness(sample,new Date('2025-04-17T04:00:00Z')),'recent');
});
test('browser rejects malformed snapshots and impossible bounds', () => {
  const sample=sampleSnapshot();
  sample.current.rows[0][3]=-1;
  assert.throws(()=>validateSnapshot(sample),/Invalid aggregate row/);
  assert.throws(()=>validateSnapshot({schema:2}),/Snapshot schema/);
});
