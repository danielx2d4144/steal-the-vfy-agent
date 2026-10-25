// Prints the strategy commitment to register on the dashboard. Never prints params or salt.
const { parseParams } = require('../src/policy');
const { commitmentOf } = require('../src/prove');
const p = parseParams(process.env.STRATEGY_PARAMS); const salt = BigInt(process.env.STRATEGY_SALT || '0');
if (salt === 0n) { console.error('Set STRATEGY_SALT'); process.exit(1); }
const c = commitmentOf(p, salt);
console.log('commitment (hex):', '0x' + c.toString(16).padStart(64, '0'));
console.log('commitment (dec):', c.toString());
