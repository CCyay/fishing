#!/bin/sh
# 【顺序匹配】整堆档（用户 2026-10-30：「可以插入任意位置，全堆都有序时整堆收走」）× 插入开 / 关 × 整堆至少 2 / 3 / 4 张
# 口径：`ORDER_MODE=full one <key> -n 20000`，R7。A 槽全扫；K 槽只跑门槛 2 那两档（看随不随点数变）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-orderfull
{
for k in orderins orderpile orderswap; do for ins in 1 0; do
  for m in 2 3 4; do echo "$k $ins $m A lock 0"; done
  echo "$k $ins 2 K pond 2"
done; done
} | xargs -P 6 -L 1 sh -c 'ORDER_MODE=full ORDER_FULL_INSERT=$1 ORDER_FULL_MIN=$2 node sim.js one $0 -n '"$N"' --role $4 --slot $5 | grep -E "X |两侧" > out-orderfull/$0-ins$1-min$2-$3.txt'
for f in out-orderfull/*.txt; do b=$(basename $f .txt); echo "$b | $(grep -o 'X [+-][0-9.]*' $f) | $(grep -o 'D [+-][0-9.]*' $f) | $(grep -o '：[+-][0-9.]* 点' $f)"; done
