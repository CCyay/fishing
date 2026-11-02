#!/bin/sh
# 2026-10-30 · 顺子匹配设计矩阵：贴几张（FLOW_KEY_N）× 步长（FLOW_KEY_STEP）× 槽（A / K / ♥），外加〈wildkey〉参照
# 钥匙一律不当通配（FLOW_KEY_SELF=own，现行默认）。输出 out-flowkeyd/
cd "$(dirname "$0")"
mkdir -p out-flowkeyd
N=${N:-20000}
for n in 1 all; do for st in 1 2; do
  FLOW_KEY_N=$n FLOW_KEY_STEP=$st node sim.js one flowdraft --role lockold --slot 0 -n $N > out-flowkeyd/n$n-s$st-A.txt 2>&1 &
  FLOW_KEY_N=$n FLOW_KEY_STEP=$st node sim.js one flowdraft --role pondold --slot 2 -n $N > out-flowkeyd/n$n-s$st-K.txt 2>&1 &
  FLOW_KEY_N=$n FLOW_KEY_STEP=$st node sim.js one flowdraft --role mirror --slot 0 -n $N > out-flowkeyd/n$n-s$st-H.txt 2>&1 &
done; done
WILDKEY=pile node sim.js one wildkey --role lockold --slot 0 -n $N > out-flowkeyd/wildkey-A.txt 2>&1 &
WILDKEY=pile node sim.js one wildkey --role mirror --slot 0 -n $N > out-flowkeyd/wildkey-H.txt 2>&1 &
wait
