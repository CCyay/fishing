#!/bin/sh
# 2026-11-02 · 庄家素材池复核：每个庄家的**技能槽**放到第 9 关（特殊技「枯水」模拟器没模 ⇒ 纯技能对比），读普通档第 9 关胜率
cd "$(dirname "$0")"
o=out-foepool; mkdir -p $o
run() { FOE_OVERRIDE="{\"9\":$2}" node campaign.js -n 2000 --seed 1 --only normal > $o/$1.txt 2>&1 & }
run bare      '[]'
run l05-回漩  '[["hook",1,false]]'
run l06-礁石  '[["press",1,false]]'
run l07-潮眼  '[["tide",2,false],["hook",1,false]]'
run l08-湾口  '[["suited",2,false]]'
run l09-雾港  '[["murk",1,false],["press",1,false]]'
run l10-涡心  '[["suitify",2,false]]'
run l11-鲸落  '[["zerodraft",1,false],["cast",1,false]]'
run l12-深渊  '[["wild",1,true],["hook",1,false],["suited",1,false]]'
run p-叠浪    '[["raise",2,false],["stackdraft",1,false]]'
run p-沙垒    '[["stackdraft",1,true],["raise",1,false],["stackdraft",1,false]]'
run p-漫江    '[["hue",1,true]]'
run p-赤礁    '[["wild",1,false]]'
run p-赤潮    '[["wild",2,false]]'
run p-东海    '[["suited",1,true],["hook",1,false],["hue",1,false]]'
wait
