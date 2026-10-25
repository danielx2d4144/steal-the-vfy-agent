// Plain Node HTTP server for local testing or any VM.
const http = require('http');
const { handleRaw, store } = require('./core');
const PORT = Number(process.env.PORT || 8080); const AGENT_PATH = process.env.AGENT_PATH || '/agent';
http.createServer((req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}'); }
  if (req.method !== 'POST' || req.url.split('?')[0] !== AGENT_PATH) { res.writeHead(404); return res.end(); }
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', async () => { const r = await handleRaw(Buffer.concat(chunks), req.headers['x-agent-games-signature']); res.writeHead(r.status, r.headers); res.end(r.body); });
}).listen(PORT, () => console.log(`steal-the-vfy agent on :${PORT}${AGENT_PATH} (store: ${store.kind})`));
