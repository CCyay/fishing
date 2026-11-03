#!/bin/sh
# 2026-11-02 · 庄家素材池定稿阵容（真 key），同口径：第 9 关、普通档、两个种子
cd "$(dirname "$0")"
o=out-foefinal; mkdir -p $o
run() { name=$1; slots=$2
  for sd in 1 10007; do FOE_OVERRIDE="{\"9\":$slots}" node campaign.js -n 2000 --seed $sd --only normal > $o/$name-s$sd.txt 2>&1 & done; }
run bare   '[]'
run 赤礁   '[["charfire",1,false]]'
run 叠浪   '[["wavepress",2,false],["stackdraft",1,false]]'
run 赤潮   '[["tidefire",1,false],["fuel",1,false],["wild",1,false]]'
run 沙垒   '[["dike",1,false],["zerodraft",1,false]]'
run 东海   '[["suckhand",1,true],["suited",1,false],["hook",1,false]]'
run 漫江1  '[["netsuit",1,false]]'
wait
run 漫江1收 '[["netsuit",1,false],["hue",1,false]]'
run 漫江2  '[["netsuit",2,false]]'
wait
