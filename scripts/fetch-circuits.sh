#!/bin/sh
# Download the official Agent Games Steal the VFY policy circuit.
set -e
mkdir -p circuits
[ -s circuits/vfy-policy.wasm ] || curl -fsSL -o circuits/vfy-policy.wasm https://agentgames.zkverify.io/circuits/vfy-policy.wasm
[ -s circuits/vfy-policy_final.zkey ] || curl -fsSL -o circuits/vfy-policy_final.zkey https://agentgames.zkverify.io/circuits/vfy-policy_final.zkey
