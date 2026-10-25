// Per-turn Groth16 policy proof with the official vfy-policy circuit, plus the publicInputsHash
// exactly as specified on agentgames.zkverify.io/build (keccak256 of 8 x 32-byte big-endian fields).
const snarkjs = require('snarkjs');
const path = require('path');
const { poseidon9 } = require('poseidon-lite');
const { keccak_256 } = require('@noble/hashes/sha3.js');
const { ACTIONS } = require('./policy');
const WASM = path.join(__dirname, '../circuits/vfy-policy.wasm');
const ZKEY = path.join(__dirname, '../circuits/vfy-policy_final.zkey');

const commitmentOf = (params, salt) => poseidon9([...params.map(BigInt), BigInt(salt)]);
const matchIdField = (m) => BigInt('0x' + String(m).replace(/-/g, ''));
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

function publicInputsHash({ commitment, matchId, turn, self, opp, action, amount }) {
  const hex = [BigInt(commitment), matchIdField(matchId), turn, self, opp, ACTIONS[action], amount, 1n].map(word).join('');
  return '0x' + Buffer.from(keccak_256(Buffer.from(hex, 'hex'))).toString('hex');
}

async function prove({ params, salt, commitment, matchId, turn, self, opp, action, amount }) {
  const input = {
    commitment: BigInt(commitment).toString(), salt: BigInt(salt).toString(),
    strategyParams: params.map(String), action: String(ACTIONS[action]), amount: String(amount),
    matchId: matchIdField(matchId).toString(), turnNumber: String(turn),
    selfBalance: String(self), opponentBalance: String(opp), circuitVersion: '1',
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return { proof, public_signals: publicSignals };
}
module.exports = { prove, publicInputsHash, commitmentOf, matchIdField };
