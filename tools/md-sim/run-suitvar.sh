#!/bin/sh
# 传色 / 收色的改法（用户 2026-10-29）× A / K / ♥
#   传色 SUITCOLOR_MODE = color（现行）/ two（2 张手牌带【花色匹配】）/ bottom（跟堆底同颜色的手牌带）
#   收色 HUE_MODE       = color（现行）/ bottom（此牌花色变成跟堆底相同，严格同花色判）
# 口径：`one <key> -n 20000`（两侧都量；Δ胜率取「两侧平均」那行）。R6
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-suitvar
for v in "SUITCOLOR_MODE color suitcolor" "SUITCOLOR_MODE two suitcolor" "SUITCOLOR_MODE bottom suitcolor" \
         "HUE_MODE color hue" "HUE_MODE bottom hue"; do
  for s in "A lockold 0" "K pond 2" "H mirror 0"; do echo "$v $s"; done
done | xargs -P 6 -L 1 sh -c 'env $0=$1 node sim.js one $2 -n '"$N"' --role $4 --slot $5 | grep -E "X |两侧|局长" > out-suitvar/$2-$1-$3.txt'
for f in out-suitvar/*.txt; do echo "== $f"; grep -E "X |两侧|局长" "$f"; done
