#!/bin/sh
# 2026-10-30 · 【顺子匹配】「匹配失败则带上【通配】」规则落地后的重量（STRAIGHT_FAIL_WILD=1 现行）。输出 out-failwild/
cd "$(dirname "$0")"
mkdir -p out-failwild
N=${N:-20000}
o=out-failwild
slots="A:lock:0 7:pondold:0 Q:rigger:2 K:pondold:2 H:mirror:0"
run() { tag=$1; shift; for sp in $slots; do n=${sp%%:*}; r=${sp#*:}; r=${r%%:*}; sl=${sp##*:}
  env "$@" node sim.js one $SKILL --role $r --slot $sl -n $N > $o/$tag-$n.txt 2>&1 & done; }
SKILL=flowdraft run fd STRAIGHT_FAIL_WILD=1
SKILL=swapflow run swap SWAPFLOW_SELF=own
SKILL=kwself run self1 KW_SELF=straight CHAIN_SELF=own CHAIN_STEP=1
SKILL=kwself run self2 KW_SELF=straight CHAIN_SELF=own CHAIN_STEP=2
wait
node sim.js one flow --role lock --slot 0 -n $N > $o/flow-A.txt 2>&1 &
KIT=stonefull,flow,gift,orderins SLOTTAG_KIND=straight node sim.js slottag --full -n $N > $o/slottag-on.txt 2>&1 &
KIT=stonefull,flow,gift,orderins SLOTTAG_KIND=off node sim.js slottag --full -n $N > $o/slottag-off.txt 2>&1 &
node sim.js vs flowdraft flowdraft -n $N > $o/vs-fd.txt 2>&1 &
SWAPFLOW_SELF=own node sim.js vs swapflow swapflow -n $N > $o/vs-swap.txt 2>&1 &
KW_SELF=straight CHAIN_SELF=own CHAIN_STEP=2 node sim.js vs kwself kwself -n $N > $o/vs-self2.txt 2>&1 &
KW_SELF=straight CHAIN_SELF=own CHAIN_STEP=1 node sim.js vs kwself kwself -n $N > $o/vs-self1.txt 2>&1 &
wait
