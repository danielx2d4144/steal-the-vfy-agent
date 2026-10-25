// Transport-independent agent: verify HMAC on the raw body, run the committed policy,
// prove it, and sign the reply. Strategy params and salt come only from env and are never logged.
const crypto = require('crypto');
const { policy, parseParams } = require('./policy');
const { prove, publicInputsHash, commitmentOf } = require('./prove');
const { makeStore } = require('./store');

const store = makeStore();
const log = (...a) => console.log(new Date().toISOString(), ...a);
const secret = () => process.env.AGENT_GAMES_HMAC_SECRET || '';
const keys = () => {
  const s = secret();
  const hex = /^[0-9a-f]{64}$/i.test(s) && process.env.SECRET_IS_HEX !== '0';
  return hex ? [Buffer.from(s, 'hex'), Buffer.from(s)] : [Buffer.from(s)];
};
const hmac = (buf, key) => crypto.createHmac('sha256', key).update(buf).digest();
function verifySig(raw, header) {
  if (!secret() || !header) return null;
  const h = String(header).replace(/^sha256=/i, '').trim();
  for (const key of keys()) {
    const d = hmac(raw, key);
    for (const enc of [d.toString('hex'), d.toString('base64')])
      if (enc.length === h.length && crypto.timingSafeEqual(Buffer.from(enc), Buffer.from(h))) return key;
  }
  return null;
}
function reply(status, obj, key) {
  const body = Buffer.from(JSON.stringify(obj));
  const sig = hmac(body, key || keys()[0]).toString('hex');
  return { status, body, headers: { 'content-type': 'application/json', 'x-agent-games-signature': sig } };
}

let strat = null;
function strategy() {
  if (strat) return strat;
  const params = parseParams(process.env.STRATEGY_PARAMS);
  const salt = BigInt(process.env.STRATEGY_SALT || '0');
  if (salt === 0n) throw new Error('STRATEGY_SALT not set');
  strat = { params, salt, commitment: commitmentOf(params, salt) };
  return strat;
}
const idemKey = (m, t) => {
  const h = crypto.createHash('sha256').update(`${m}:${t}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : 0; };

async function turn(msg) {
  const { matchId, turn: t } = msg;
  const key = `${matchId}:${t}`;
  const cached = await store.get(key); if (cached) return cached;
  const s = strategy();
  const self = int(msg.state?.selfBalance), opp = int(msg.state?.opponentBalance);
  const claimed = msg.strategyCommitment?.hash;
  if (claimed && BigInt(claimed) !== s.commitment) log('WARN commitment mismatch: env strategy differs from registered commitment');
  const action = policy(s.params, self, opp);
  const amount = action.type === 'EXTRACT' ? action.amount : 0;
  // Hash uses the platform's frozen commitment value when given, so it matches what the platform recomputes.
  const commitment = claimed || '0x' + s.commitment.toString(16);
  const pih = publicInputsHash({ commitment, matchId, turn: t, self, opp, action: action.type, amount });
  const pr = await prove({ ...s, commitment: s.commitment, matchId, turn: t, self, opp, action: action.type, amount });
  const out = {
    matchId, turn: t, action,
    policyProof: { circuitVersion: 'v1', publicInputsHash: pih },
    proof: pr.proof, public_signals: pr.public_signals,
    agentTimestamp: new Date().toISOString(), idempotencyKey: idemKey(matchId, t),
  };
  await store.put(key, out);
  log('turn', matchId, t, action.type, amount || '');
  return out;
}

async function handle(msg) {
  if (msg.type === 'agent-games.preflight.v1') return { ok: true, protocolVersion: 'v1' };
  if (msg.eventId === 'steal-the-vfy' || msg.matchId) return turn(msg);
  return { error: 'unsupported_type' };
}

async function handleRaw(raw, sigHeader) {
  const key = verifySig(raw, sigHeader);
  if (!key) { log('bad signature'); return reply(401, { error: 'bad_signature' }); }
  let msg; try { msg = JSON.parse(raw.toString('utf8')); } catch { return reply(400, { error: 'bad_json' }, key); }
  const limit = Number(process.env.TURN_BUDGET_MS || 25000);
  // Last resort if proving stalls: an unproven HOLD (scored as a timeout-like penalty, never a crash).
  const fallback = msg.matchId ? { matchId: msg.matchId, turn: msg.turn, action: { type: 'HOLD' },
    policyProof: { circuitVersion: 'v1' }, agentTimestamp: new Date().toISOString(), idempotencyKey: idemKey(msg.matchId, msg.turn) } : { error: 'timeout' };
  try {
    const out = await Promise.race([handle(msg), new Promise(r => setTimeout(() => r(fallback), limit).unref?.())]);
    return reply(200, out, key);
  } catch (e) { log('error', e.message); return reply(200, fallback, key); }
}
module.exports = { handleRaw, store, strategy };
