import { cp, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchSnapshot, sampleSnapshot } from './pulse.mjs';

const sample = process.argv.includes('--sample');
const snapshot = sample ? sampleSnapshot() : await fetchSnapshot();
const dst = resolve('dist');
await mkdir(dst, {recursive:true});
await cp(resolve('site'), dst, {recursive:true});
const temp = resolve(dst, 'pulse.json.tmp');
await writeFile(temp, JSON.stringify(snapshot));
await rename(temp, resolve(dst,'pulse.json'));
console.log('Built ' + snapshot.mode + ': ' + snapshot.current.rows.length + ' current, ' + snapshot.previous.rows.length + ' previous aggregate rows.');
