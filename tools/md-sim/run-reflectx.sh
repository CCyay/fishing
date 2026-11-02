#!/bin/sh
# 2026-11-01 · 【映照】新载体评价矩阵。输出 out-reflectx/
cd "$(dirname "$0")"
mkdir -p out-reflectx
N=${N:-20000}
o=out-reflectx
slots="A:lock:0 7:pondold:0 K:pondold:2 H:mirror:0"
for sp in $slots; do n=${sp%%:*}; r=${sp#*:}; r=${r%%:*}; sl=${sp##*:}
  for m in pilestraight pileorder hand deck; do
    RX_MODE=$m node sim.js one reflectx --role $r --slot $sl -n $N > $o/$m-$n.txt 2>&1 &
  done
  REFLECT_COLOR=suit node sim.js one reflect --role $r --slot $sl -n $N > $o/self-$n.txt 2>&1 &
  KW_SELF=order REFLECT_WITH=kwself REFLECT_SPECIAL=1 REFLECT_COLOR=suit node sim.js one kwself --role $r --slot $sl -n $N > $o/selforder-$n.txt 2>&1 &
  wait
done
node sim.js one pilereflect --role lockold --slot 0 -n $N > $o/jingshui-A.txt 2>&1
