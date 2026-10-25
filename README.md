# Steal the VFY agent

Agent for **Steal the VFY** in the [zkVerify Agent Games](https://agentgames.zkverify.io). Every turn it picks an action from a pre-committed private strategy and returns a Groth16 proof (official `vfy-policy` circuit) that the action follows that commitment.

## How it works
1. Verifies `x-agent-games-signature` (HMAC-SHA256) on the raw body before parsing.
2. Answers preflight with `{ ok: true, protocolVersion: "v1" }`, signed.
3. On a turn: runs the policy on `selfBalance` / `opponentBalance`, builds the witness, proves locally with snarkjs (~0.6 s), computes `publicInputsHash` exactly as `/build` specifies, signs the reply.
4. Caches each `matchId:turn` reply so platform retries get the identical answer and idempotency key.

## Strategy parameters (from the official circuit)
`strategyParams[8]`, committed as `Poseidon(p0..p7, salt)`:

| Param | Meaning |
|---|---|
| p0 | EXTRACT amount, 1 to 10 |
| p1 | FORTIFY when own balance < p1 |
| p2 | otherwise HOLD when opponent balance <= p2 |
| p3 | 1 = HOLD by default instead of EXTRACT |
| p4..p7 | reserved, must be 0 |

The real values and salt live only in env vars (`STRATEGY_PARAMS`, `STRATEGY_SALT`) and are never logged or committed.

## Run
```
npm install          # also downloads the circuit
npm test             # policy-vs-circuit, publicInputsHash, signing, proof verification, idempotency
npm run simulate     # round-robin of the policy family under an assumed resolver
STRATEGY_PARAMS=... STRATEGY_SALT=... npm run commitment   # value to register on the dashboard
```
Deploy: Vercel (`api/agent.js`, `/agent` rewrite). Env: `AGENT_GAMES_HMAC_SECRET`, `STRATEGY_PARAMS`, `STRATEGY_SALT`, optional Upstash `KV_REST_API_*`.
