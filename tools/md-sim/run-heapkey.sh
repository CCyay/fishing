#!/bin/sh
# 〈heapkey〉「堆牌 2；1 张手牌带上【X 匹配】」× X = 顺子 / 花色 / 21 / 顺序 × 堆牌开 / 关 × A / K 槽
# 规则：**R7**（2026-10-29：特殊匹配不能被抢、可以用特殊匹配抢牌）
# 口径：`one heapkey -n 20000`（两侧都量；Δ胜率取「两侧平均」那行）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-heapkey
for k in straight suit draft order; do for h in 2 0; do for s in "A lock 0" "K pond 2"; do echo "$k $h $s"; done; done; done \
| xargs -P 6 -L 1 sh -c 'HEAPKEY_KIND=$0 HEAPKEY_HEAP=$1 node sim.js one heapkey -n '"$N"' --role $3 --slot $4 | grep -E "X |两侧|局长" > out-heapkey/$0-heap$1-$2.txt'
for f in out-heapkey/*.txt; do b=$(basename $f .txt); echo "$b | $(grep -o 'X [+-][0-9.]*' $f) | $(grep -o 'D [+-][0-9.]*' $f) | $(grep -o '：[+-][0-9.]* 点' $f) | $(grep -o '局长 [+-][0-9.]*%' $f)"; done
