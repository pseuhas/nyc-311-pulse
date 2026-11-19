import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explainChange,DATASET} from '../analysis/drivers.mjs';

const live = () => {
  const mk=(start,end,segments)=>({start,end,rows:[
    ...Array.from({length:7},(_,i)=>[start.slice(0,8)+String(Number(start.slice(-2))+i).padStart(2,'0'),'Queens','Other fixture counts',10]),
    ...segments.map(([b,n,x])=>[start,b,n,x]),
  ]});
  return {schema:1,mode:'published-data',generatedAt:'2026-11-19T16:00:00Z',timezone:'America/New_York',
    current:mk('2026-11-11','2026-11-18',[['Bronx','Heat',21],['Bronx','Parking',4],['Brooklyn','Misc',16],['Bronx','Noise',5]]),
    previous:mk('2026-11-04','2026-11-11',[['Bronx','Heat',5],['Bronx','Parking',20],['Brooklyn','Misc',12],['Bronx','Noise',2]])};
};
const NOW = new Date('2026-11-19T17:00:00Z');
const run = (s, opts={}) => explainChange(s,{now:NOW,...opts});

test('ranks signed drivers, deterministic ties, and keeps offsetting categories',()=>{
  const r=run(live());
  assert.equal(r.status,'recent'); assert.equal(r.source,DATASET);
  assert.equal(r.totals.netDelta,7);
  assert.deepEqual(r.drivers.map(x=>[x.name,x.delta]),[['Heat',16],['Parking',-16],['Misc',4],['Noise',3]]);
  assert.equal(r.otherDelta,0); assert.equal(r.reconciled,true);
  assert.equal(r.windows.current.endExclusive,'2026-11-18');
  assert.match(r.methodology,/not evidence of cause/);
});
test('borough/limit filters reconcile against omitted signed delta',()=>{
  const r=run(live(),{borough:'Bronx',limit:1});
  assert.equal(r.totals.netDelta,3); assert.equal(r.otherDelta,-13);
  assert.equal(r.drivers[0].delta+r.otherDelta,r.totals.netDelta);
  assert.equal(r.omittedCategories,2);
});
test('net flat is not confused with no underlying activity',()=>{
  const s=live(); s.current.rows=s.current.rows.filter(x=>x[2]!=='Misc'&&x[2]!=='Noise');
  s.previous.rows=s.previous.rows.filter(x=>x[2]!=='Misc'&&x[2]!=='Noise');
  const r=run(s); assert.equal(r.totals.netDelta,0);
  assert.deepEqual(r.drivers.map(x=>x.delta),[16,-16]);
});
test('missing/invalid/partial inputs fail without guessed totals',()=>{
  assert.equal(run(null).status,'unavailable'); assert.equal('totals' in run(null),false);
  const s=live(); s.current.rows=s.current.rows.filter(x=>x[0]!=='2026-11-12');
  assert.match(run(s).reason,/missing reporting date/);
  const future=live(); future.generatedAt='2026-11-20T16:00:00Z';
  assert.match(run(future).reason,/future/);
});
test('freshness and synthetic data have explicit states',()=>{
  const stale=run(live(),{now:new Date('2026-11-21T06:00:00Z')});
  assert.equal(stale.status,'stale'); assert.match(stale.reason,/historical counts/);
  const sample=live(); sample.mode='sample';
  assert.equal(run(sample).status,'sample'); assert.equal('drivers' in run(sample),false);
});
test('empty public borough is explicit and invalid arguments are rejected',()=>{
  const r=run(live(),{borough:'Staten Island'});
  assert.deepEqual(r.totals,{current:0,previous:0,netDelta:0});
  assert.deepEqual(r.drivers,[]);
  assert.throws(()=>run(live(),{borough:'Atlantis'}),/Unsupported/);
  assert.throws(()=>run(live(),{limit:9999}),/Limit/);
});
