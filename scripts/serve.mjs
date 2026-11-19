import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const paths = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'application/javascript; charset=utf-8']],
  ['/model.mjs', ['model.mjs', 'application/javascript; charset=utf-8']],
  ['/pulse.json', ['pulse.json', 'application/json; charset=utf-8']]
]);
const port = Number(process.env.PORT ?? 4173);
createServer(async (req,res) => {
  const asset = paths.get(req.url?.split('?')[0]);
  if (req.method !== 'GET' || !asset) {res.writeHead(404).end('Not found'); return;}
  try {
    const content = await readFile(new URL('../dist/'+asset[0], import.meta.url));
    res.writeHead(200, {'content-type':asset[1],'x-content-type-options':'nosniff'}).end(content);
  } catch {
    res.writeHead(404).end('No build yet: run npm run build:sample or npm run build');
  }
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:'+port));
