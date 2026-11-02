#!/bin/sh
# 石墙十件设计里用户挑的三件（2026-10-29）× A / K / ♥，R7
#   wallsuit-suit  堆上跟堆底同花色的牌都带上【石墙】
#   wallsuit-color 同上，同颜色
#   wallseal       它带上【石墙】；堆上带【石墙】的牌都变成【无点数】
#   foewall        对方堆牌 2；那两张落堆时带上【石墙】（= heapwall · HW_SELF=0 HW_FOE=2 HW_WALL=heap）
#   stonebase      砌墙（它带上【石墙】）—— 同批锚
# 口径：`one <key> -n 20000`（两侧都量；Δ胜率取「两侧平均」那行）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-wallx
for v in "wallsuit-suit wallsuit WALLSUIT_MATCH=suit" "wallsuit-color wallsuit WALLSUIT_MATCH=color" \
         "wallseal wallseal X=1" "foewall heapwall HW_SELF=0,HW_FOE=2,HW_WALL=heap" "stonebase stonebase X=1"; do
  for s in "A lockold 0" "K pond 2" "H mirror 0"; do echo "$v $s"; done
done | xargs -P 6 -L 1 sh -c 'env $(echo $2 | tr , " ") node sim.js one $1 -n '"$N"' --role $4 --slot $5 | grep -E "X |两侧|局长" > out-wallx/$0-$3.txt'
for f in out-wallx/*.txt; do b=$(basename $f .txt); echo "$b | $(grep -o 'X [+-][0-9.]*' $f) | $(grep -o 'D [+-][0-9.]*' $f) | $(grep -o '：[+-][0-9.]* 点' $f) | $(grep -o '局长 [+-][0-9.]*%' $f)"; done
