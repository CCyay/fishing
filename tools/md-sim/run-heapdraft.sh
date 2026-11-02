#!/bin/sh
# 〈heapdraft〉「堆牌 N；1 张手牌带上【21 匹配】」× N=1/2/4 × A/K/♥（用户 2026-10-29 问「堆牌2N」）
# 口径：`one heapdraft -n 20000`（两侧都量；Δ胜率取「两侧平均」那行）。R6。
# 第十一节那批（A 5.48 / K 5.57）是 R4 的，不能跟这儿相减
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-heapdraft
for n in 1 2 4; do for s in "A lock 0" "K pond 2" "H mirror 0"; do echo "$n $s"; done; done \
| xargs -P 6 -L 1 sh -c 'HEAP_N=$0 node sim.js one heapdraft -n '"$N"' --role $2 --slot $3 | grep -E "X |两侧|局长" > out-heapdraft/$1-N$0.txt'
for f in out-heapdraft/*.txt; do echo "== $f"; grep -E "X |两侧|局长" "$f"; done
