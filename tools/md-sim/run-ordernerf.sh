#!/bin/sh
# 顺序匹配三件（插流 / 调序 / 换序）太强（R7 前五占三）→ 量关键词的两个旋钮（2026-10-30 用户）
#   min4   ORDER_MIN=4（一段至少 4 张）
#   tie0   ORDER_TIE=0（相等不算有序）
#   both   两个一起
# 口径：`one <key> -n 20000`，R7，A / K 槽
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-ordernerf
for k in orderins orderpile orderswap; do
  for v in "min4 ORDER_MIN=4" "tie0 ORDER_TIE=0" "both ORDER_MIN=4,ORDER_TIE=0"; do
    for s in "A lock 0" "K pond 2"; do echo "$k $v $s"; done
  done
done | xargs -P 6 -L 1 sh -c 'env $(echo $2 | tr , " ") node sim.js one $0 -n '"$N"' --role $4 --slot $5 | grep -E "X |两侧" > out-ordernerf/$0-$1-$3.txt'
for f in out-ordernerf/*.txt; do b=$(basename $f .txt); echo "$b | $(grep -o 'X [+-][0-9.]*' $f) | $(grep -o 'D [+-][0-9.]*' $f) | $(grep -o '：[+-][0-9.]* 点' $f)"; done
