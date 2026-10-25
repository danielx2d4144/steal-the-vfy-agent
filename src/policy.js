// Mirror of the official vfy-policy circuit's decision rule (reverse-engineered by
// probing vfy-policy.wasm; see test/test.js, which checks this against the circuit).
// strategyParams[8]:
//   p0 extract amount (1..10)
//   p1 FORTIFY when selfBalance < p1
//   p2 otherwise HOLD when opponentBalance <= p2
//   p3 1 = HOLD by default instead of EXTRACT (0 or 1)
//   p4..p7 reserved, must be 0
const ACTIONS = { HOLD: 0, FORTIFY: 1, EXTRACT: 2 };

function parseParams(str) {
  const p = String(str || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (p.length !== 8 || p.some(x => !Number.isInteger(x) || x < 0)) throw new Error('STRATEGY_PARAMS must be 8 non-negative integers');
  if (p[0] < 1 || p[0] > 10) throw new Error('p0 (extract amount) must be 1..10');
  if (p[3] > 1) throw new Error('p3 must be 0 or 1');
  if (p.slice(4).some(x => x !== 0)) throw new Error('p4..p7 must be 0');
  return p;
}

function policy(p, self, opp) {
  if (self < p[1]) return { type: 'FORTIFY' };
  if (opp <= p[2] || p[3] === 1) return { type: 'HOLD' };
  return { type: 'EXTRACT', amount: p[0] };
}
module.exports = { policy, parseParams, ACTIONS };
