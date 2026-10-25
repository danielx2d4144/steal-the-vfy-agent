// Per-turn response cache so platform retries get the identical answer.
// Upstash Redis REST when its env vars are set (Vercel), otherwise in-memory/file.
const fs = require('fs'); const path = require('path');
function redisStore(url, token) {
  const cmd = async (...args) => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(args) });
    const j = await r.json(); if (j.error) throw new Error('redis: ' + j.error); return j.result;
  };
  return { kind: 'redis',
    get: async (k) => { const v = await cmd('GET', `vfy:resp:${k}`); return v ? JSON.parse(v) : null; },
    put: (k, v) => cmd('SET', `vfy:resp:${k}`, JSON.stringify(v), 'EX', 60 * 60 * 24 * 30) };
}
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, 'turns.json');
  let s = {}; try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return { kind: 'file', get: async (k) => s[k] || null,
    put: async (k, v) => { s[k] = v; fs.writeFileSync(file, JSON.stringify(s)); } };
}
function makeStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return redisStore(url, token);
  return fileStore(process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/vfy-data' : path.join(__dirname, '../data')));
}
module.exports = { makeStore };
