// Offline tests: policy mirror vs the official circuit, publicInputsHash vs the /build reference,
// a full signed turn with a real Groth16 proof verified against the zkey's verification key.
const assert = require('assert'); const crypto = require('crypto'); const path = require('path');
const snarkjs = require('snarkjs');
process.env.AGENT_GAMES_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
process.env.STRATEGY_PARAMS = process.env.TEST_PARAMS || '10,0,0,0,0,0,0,0';
process.env.STRATEGY_SALT = BigInt('0x' + crypto.randomBytes(30).toString('hex')).toString();
process.env.DATA_DIR = path.join(require('os').tmpdir(), 'vfy-test-' + Date.now());
const { policy, ACTIONS } = require('../src/policy');
const { publicInputsHash, commitmentOf, matchIdField } = require('../src/prove');
const { handleRaw } = require('../src/core');
const { WitnessCalculatorBuilder } = require('circom_runtime');
let pass = 0; const ok = (name) => { pass++; console.log('PASS', name); };

(async () => {
  const wc = await WitnessCalculatorBuilder(require('fs').readFileSync(path.join(__dirname, '../circuits/vfy-policy.wasm')));
  const quiet = console.error; console.error = () => {};
  const accepts = async (p, a, amt, self, opp, turn) => { try { await wc.calculateWitness({ commitment: commitmentOf(p, 7n).toString(), salt: '7', strategyParams: p, action: ACTIONS[a], amount: amt, matchId: '123', turnNumber: turn, selfBalance: self, opponentBalance: opp, circuitVersion: 1 }, true); return true; } catch { return false; } };
  // 1. policy mirror agrees with the circuit on random strategies and states
  for (let i = 0; i < 60; i++) {
    const p = [1 + (i % 10), [0, 50, 90, 100, 150][i % 5], [0, 30, 80, 100, 200][(i * 3) % 5], i % 7 === 0 ? 1 : 0, 0, 0, 0, 0];
    const self = Math.floor(Math.random() * 200), opp = Math.floor(Math.random() * 200), turn = 1 + (i % 20);
    const mine = policy(p, self, opp);
    assert(await accepts(p, mine.type, mine.amount || 0, self, opp, turn), `circuit rejected our action ${JSON.stringify({ p, self, opp, mine })}`);
    for (const alt of [['HOLD', 0], ['FORTIFY', 0], ['EXTRACT', p[0]]]) if (alt[0] !== mine.type) assert(!(await accepts(p, alt[0], alt[1], self, opp, turn)), 'circuit allowed a second action');
  }
  console.error = quiet; ok('policy mirror matches circuit (60 random cases, unique action)');
  // 2. publicInputsHash equals the /build reference implementation (viem)
  const { keccak256, concat, numberToHex } = require('viem');
  const c = '0x' + commitmentOf([10, 0, 0, 0, 0, 0, 0, 0], 5n).toString(16), m = '9f4e1b2a-1111-4222-8333-444455556666';
  const ref = keccak256(concat([numberToHex(BigInt(c), { size: 32 }), numberToHex(BigInt('0x' + m.replace(/-/g, '')), { size: 32 }), numberToHex(3n, { size: 32 }), numberToHex(95n, { size: 32 }), numberToHex(105n, { size: 32 }), numberToHex(2n, { size: 32 }), numberToHex(10n, { size: 32 }), numberToHex(1n, { size: 32 })]));
  assert.strictEqual(publicInputsHash({ commitment: c, matchId: m, turn: 3, self: 95, opp: 105, action: 'EXTRACT', amount: 10 }), ref); ok('publicInputsHash matches /build reference');
  // 3. bad signature rejected
  const sign = (b) => crypto.createHmac('sha256', Buffer.from(process.env.AGENT_GAMES_HMAC_SECRET, 'hex')).update(b).digest('hex');
  const bad = await handleRaw(Buffer.from('{"type":"agent-games.preflight.v1"}'), 'deadbeef'); assert.strictEqual(bad.status, 401); ok('bad signature -> 401');
  // 4. preflight signed
  const pf = Buffer.from(JSON.stringify({ type: 'agent-games.preflight.v1', agent_id: 'agt_x', nonce: 'n1' }));
  const r1 = await handleRaw(pf, sign(pf)); assert.deepStrictEqual(JSON.parse(r1.body), { ok: true, protocolVersion: 'v1' }); assert.strictEqual(r1.headers['x-agent-games-signature'], sign(r1.body)); ok('preflight signed ok');
  // 5. full turn with proof
  const s = require('../src/core').strategy();
  const env = { protocolVersion: 'v1', eventId: 'steal-the-vfy', mode: 'practice', matchId: m, turn: 3, state: { selfBalance: '95', opponentBalance: '105', selfFortifiedUntilTurn: null, opponentFortifiedUntilTurn: null }, strategyCommitment: { hash: '0x' + s.commitment.toString(16) }, resolverVersion: 'v1', nonce: 'abc' };
  const b = Buffer.from(JSON.stringify(env)); const t0 = Date.now();
  const r2 = await handleRaw(b, sign(b)); const out = JSON.parse(r2.body); const ms = Date.now() - t0;
  assert.strictEqual(out.matchId, m); assert.strictEqual(out.turn, 3); assert.deepStrictEqual(out.action, policy(s.params, 95, 105));
  if (out.action.type !== 'EXTRACT') assert(!('amount' in out.action));
  const vk = await snarkjs.zKey.exportVerificationKey(path.join(__dirname, '../circuits/vfy-policy_final.zkey'));
  assert(await snarkjs.groth16.verify(vk, out.public_signals, out.proof), 'proof did not verify');
  assert.strictEqual(r2.headers['x-agent-games-signature'], sign(r2.body));
  assert(out.public_signals.includes(matchIdField(m).toString()), 'matchId not public');
  ok(`turn proof verifies (${ms} ms), action ${JSON.stringify(out.action)}`);
  // 6. retry returns identical body and idempotency key
  const r3 = await handleRaw(b, sign(b)); assert.strictEqual(r3.body.toString(), r2.body.toString()); ok('retry is idempotent');
  console.log(`\n${pass}/6 passed`); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
