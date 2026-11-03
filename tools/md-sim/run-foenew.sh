#!/bin/sh
# 2026-11-02 · 庄家素材池重做：新配装的技能那一半放第 9 关（枯水没模 ⇒ 纯技能对比），普通档第 9 关胜率，两个种子
cd "$(dirname "$0")"
o=out-foenew; mkdir -p $o
run() { name=$1; slots=$2; shift 2
  for sd in 1 10007; do env "$@" FOE_OVERRIDE="{\"9\":$slots}" node campaign.js -n 2000 --seed $sd --only normal > $o/$name-s$sd.txt 2>&1 & done; }
run bare      '[]'
run 回漩      '[["hook",1,false]]'
run 礁石      '[["press",1,false]]'
run 潮眼      '[["tide",2,false],["hook",1,false]]'
run 湾口      '[["suited",2,false]]'
run 雾港      '[["murk",1,false],["press",1,false]]'
run 涡心      '[["suitify",2,false]]'
wait
run 鲸落      '[["zerodraft",1,false],["cast",1,false]]'
run 深渊      '[["wild",1,true],["hook",1,false],["suited",1,false]]'
run 旧叠浪    '[["raise",2,false],["stackdraft",1,false]]'
run 旧沙垒    '[["stackdraft",1,true],["raise",1,false],["stackdraft",1,false]]'
run 旧漫江    '[["hue",1,true]]'
run 新赤礁    '[["foex",2,false]]' FX_MODE=char
run 新赤潮    '[["foex",1,true],["fuel",1,false],["wild",1,false]]' FX_MODE=tide
wait
run 新叠浪    '[["foex",2,false],["raise",1,false]]' FX_MODE=wave
run 新沙垒    '[["zeroself",1,false],["stackdraft",1,true],["zerodraft",1,false]]'
run 新漫江    '[["foex",2,false],["hue",1,false]]' FX_MODE=net
run 新东海1   '[["foex",1,true],["suited",1,false],["hook",1,false]]' FX_MODE=suck FX_SUCK_N=1
run 新东海2   '[["foex",1,true],["suited",1,false],["hook",1,false]]' FX_MODE=suck FX_SUCK_N=2
run 新东海all '[["foex",1,true],["suited",1,false],["hook",1,false]]' FX_MODE=suck FX_SUCK_N=all
run 旧东海    '[["suited",1,true],["hook",1,false],["hue",1,false]]'
wait
