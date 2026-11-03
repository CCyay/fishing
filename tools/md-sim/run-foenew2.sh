#!/bin/sh
# 2026-11-02 · 庄家素材池重做第二轮（削）：同口径
cd "$(dirname "$0")"
o=out-foenew2; mkdir -p $o
run() { name=$1; slots=$2; shift 2
  for sd in 1 10007; do env "$@" FOE_OVERRIDE="{\"9\":$slots}" node campaign.js -n 2000 --seed $sd --only normal > $o/$name-s$sd.txt 2>&1 & done; }
run bare      '[]'
run 赤礁1     '[["foex",1,false]]' FX_MODE=char
run 赤潮A     '[["foex",1,false],["fuel",1,false],["wild",1,false]]' FX_MODE=tide
run 赤潮B     '[["foex",1,true],["fuel",1,false]]' FX_MODE=tide
run 叠浪A     '[["foex",2,false],["stackdraft",1,false]]' FX_MODE=wave
run 叠浪B     '[["foex",1,false],["stackdraft",1,false]]' FX_MODE=wave
run 沙垒A     '[["zeroself",1,false],["stackdraft",1,false],["zerodraft",1,false]]'
wait
run 沙垒B     '[["zeroself",1,false],["zerodraft",1,false]]'
run 漫江A     '[["foex",1,false],["hue",1,false]]' FX_MODE=net
run 漫江B     '[["foex",1,false]]' FX_MODE=net
wait
