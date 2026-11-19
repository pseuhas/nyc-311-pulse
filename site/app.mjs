import {explainChange} from './drivers.mjs';
import {validateSnapshot, summarize, freshness, ALL, BOROUGHS} from './model.mjs';

const byId = id => document.getElementById(id);
const area = byId('area'), search = byId('search'), more = byId('more');
const state = byId('state');
const fmt = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:1,signDisplay:'exceptZero'});
const dateLabel = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const weekday = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'});
const prettyDate = (d,f=dateLabel) => f.format(new Date(d+'T00:00:00Z'));
const datesLabel = p => prettyDate(p.start) + ' – ' + dateLabel.format(new Date(Date.parse(p.end)-86_400_000));
const change = p => p.pct === null ? (p.current ? 'New vs prior week' : 'No baseline') : percent.format(p.pct);
const text = (tag,s,cls) => {const el=document.createElement(tag);el.textContent=s;if(cls)el.className=cls;return el;};
const svg = (tag, attrs, value) => {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));
  if(value) node.textContent=value;
  return node;
};
let snapshot, view, rowLimit=12;

function table(host, headers, values) {
  const t = document.createElement('table');
  const head = t.createTHead().insertRow();
  for (const title of headers) { const h=text('th',title);h.scope='col';head.append(h); }
  const body = t.createTBody();
  for (const [label,...xs] of values) {
    const row=body.insertRow(), th=text('th',label);th.scope='row';row.append(th);
    for (const x of xs) row.append(text('td',x));
  }
  host.replaceChildren(t);
}

function chart() {
  const pts = view.currentDaily, prev = view.previousDaily;
  const graph=svg('svg',{viewBox:'0 0 620 228','aria-hidden':'true',focusable:'false'});
  const high = Math.max(4,...pts.map(x=>x[1]),...prev.map(x=>x[1]));
  const step = Math.max(1, Math.ceil(high/4 / Math.pow(10,Math.floor(Math.log10(high/4))))*Math.pow(10,Math.floor(Math.log10(high/4))));
  const max = step*4;
  const x = i => 65+i*86, y = n => 183-155*n/max;
  for(let i=0;i<=4;i++) {
    graph.append(svg('line',{x1:57,x2:589,y1:y(step*i),y2:y(step*i),stroke:'#cbd8cb'}));
    graph.append(svg('text',{x:50,y:y(step*i)+4,'text-anchor':'end',fill:'#4d6261','font-size':12},fmt.format(step*i)));
  }
  pts.forEach(([d],i)=>graph.append(svg('text',{x:x(i),y:211,'text-anchor':'middle',fill:'#4d6261','font-size':13},prettyDate(d,weekday))));
  for(const [series,color,dashed] of [[prev,'#ab5633',true],[pts,'#125743',false]]) {
    graph.append(svg('polyline',{points:series.map((p,i)=>x(i)+','+y(p[1])).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-dasharray':dashed?'6 5':'none','stroke-linejoin':'round'}));
    series.forEach((p,i)=>graph.append(svg('circle',{cx:x(i),cy:y(p[1]),r:4,fill:color})));
  }
  byId('chart').replaceChildren(graph);
  table(byId('daily-table'),['Current date','Requests','Prior date','Requests'],pts.map(([d,n],i)=>[prettyDate(d),fmt.format(n),prettyDate(prev[i][0]),fmt.format(prev[i][1])]));
}

function renderCategories() {
  const filter=search.value.trim().toLocaleLowerCase('en-US');
  const matching=view.byCategory.filter(r=>r.name.toLocaleLowerCase('en-US').includes(filter));
  const host=byId('categories');
  if(!matching.length) host.replaceChildren(text('p','No reported problems match this selection.'));
  else table(host,['Problem','Current','Previous','Change'],matching.slice(0,rowLimit).map(r=>[r.name,fmt.format(r.current),fmt.format(r.previous),change(r)]));
  more.hidden=matching.length<=rowLimit;
  more.textContent='Show more problems ('+fmt.format(Math.max(0,matching.length-rowLimit))+' remaining)';
}

function renderDrivers() {
  const report=explainChange(snapshot,{borough:area.value,limit:3});
  const host=byId('change-drivers');
  if (!report.reconciled) {
    host.replaceChildren(text('p',report.reason,'drivers-note'));
    return;
  }
  const deltaFmt=new Intl.NumberFormat('en-US',{signDisplay:'exceptZero'});
  const covering=report.omittedCategories>0;
  const list=document.createElement('ul');
  list.className='driver-list';
  const add=(label,delta)=>{
    const li=document.createElement('li');
    const amount=text('strong',deltaFmt.format(delta),'driver-delta');
    amount.dataset.direction=delta>0?'up':delta<0?'down':'flat';
    li.append(text('span',label),amount);
    list.append(li);
  };
  for(const driver of report.drivers) add(driver.name,driver.delta);
  if(covering) add('Other problems ('+fmt.format(report.omittedCategories)+')',report.otherDelta);
  const total=text('p','Net change · '+deltaFmt.format(report.totals.netDelta)+' requests · '+report.scope,'drivers-total');
  const caveat=text('p',((report.status==='stale')?report.reason+' ':'')+'These counts show what contributed to the change, not what caused it.','drivers-note');
  host.replaceChildren(total,report.drivers.length?list:text('p','No reported problem changed in this selection.','drivers-note'),caveat);
}

function render() {
  view=summarize(snapshot,area.value);
  const total=view.total, top=view.byCategory.find(c=>c.current>0);
  const cards=[
    ['Service requests',fmt.format(total.current),area.value],
    ['Week over week',change(total),fmt.format(total.previous)+' requests last period'],
    ['Top reported problem',top?.name ?? 'None',top ? fmt.format(top.current)+' requests' : 'No reported requests']
  ].map(([label,value,sub])=>{
    const el=document.createElement('div');el.className='metric';el.append(text('p',label,'eyebrow'),text('strong',value),text('small',sub));return el;
  });
  byId('metrics').replaceChildren(...cards);
  const max=Math.max(1,...view.byArea.map(x=>x.current));
  const rows=view.byArea.filter(x=>x.name!=='Unspecified'||x.current||x.previous).map(p=>{
    const b=text('button','','borough'), bar=document.createElement('progress');
    b.type='button';b.setAttribute('aria-pressed',String(area.value===p.name));
    bar.max=max;bar.value=p.current;bar.setAttribute('aria-hidden','true');
    b.append(text('strong',p.name),text('span',fmt.format(p.current)),bar);
    b.addEventListener('click',()=>{area.value=area.value===p.name?ALL:p.name;rowLimit=12;render();area.focus();});
    return b;
  });
  byId('boroughs').replaceChildren(...rows);
  renderDrivers();
  chart();
  renderCategories();
}

async function main() {
  try {
    const response = await fetch('./pulse.json');
    if(!response.ok) throw Error('Missing snapshot');
    snapshot=validateSnapshot(await response.json());
    const mode=freshness(snapshot);
    state.dataset.mode=mode;
    const refreshed=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(snapshot.generatedAt));
    state.textContent= mode==='sample' ? 'DEMO DATA · Synthetic counts for layout and testing, not actual 311 requests.' :
      (mode==='stale'?'STALE SNAPSHOT · Refresh overdue. ':'PUBLISHED DATA · ')+'Fetched '+refreshed+' New York time. Source counts may be revised.';
    byId('period').replaceChildren(text('span','REPORTING WINDOW','eyebrow'),text('strong',datesLabel(snapshot.current)),text('small','vs '+datesLabel(snapshot.previous)+' · New York dates'));
    const opts=[ALL,...BOROUGHS.filter(b=>[snapshot.current,snapshot.previous].some(p=>p.rows.some(row=>row[1]===b)))];
    area.replaceChildren(...opts.map(name=>{const o=text('option',name);o.value=name;return o;}));
    area.addEventListener('change',()=>{rowLimit=12;render()});
    search.addEventListener('input',()=>{rowLimit=12;renderCategories()});
    more.addEventListener('click',()=>{rowLimit+=12;renderCategories();if(more.hidden)search.focus();});
    render();
    byId('dashboard').hidden=false;
  } catch(e) {
    state.dataset.mode='error';
    state.textContent='A valid snapshot could not be loaded. Reload to try again, or use the official dataset below.';
    byId('period').replaceChildren(text('span','REPORTING WINDOW','eyebrow'),text('strong','Unavailable'));
    console.error(e);
  }
}
main();
