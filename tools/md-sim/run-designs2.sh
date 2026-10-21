#!/usr/bin/env bash
# 2026-10-21 · run-designs.sh 的**紧凑版**：同样的格子，只打三行。
#
# 为什么要这一版：上一轮完整输出被截断在设计一的一半 ——
# `sim.js vs` 一格就是 70 行（诊断 + 局面长度 + 四格分数），24 格读不完。
# 这一版每格只留「两侧原始值 / 整堆吃完 / 预算用掉几成」三样，
# 因为这三样正好是判这三条设计的全部依据：
#   两侧原始值  → X（两侧平均），跟档位 +2.7~4.5 比
#   整堆吃完    → 压吃那个病的温度计（贴着 100% = 决策被删掉）
#   预算用掉    → 同一件事的另一头（贴着 0 = 21 匹配退化成摆设）
#
# 要看某一格的全貌就单独跑那一行，命令在每个小节上面写着。
set -u
N=${N:-20000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# 从 70 行里挑出那三样。`vs` 报的是**两侧原始值**，X 是两侧平均 ——
# 这儿不替你算，因为算了就看不出标准误落在哪一侧
pick() {
  grep -E '手里：|^    后手（我） ' | head -4 \
    | sed -e 's/^ *//' -e 's/标准误/se/'
}

job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { echo "-- $2"; [ -f "$TMP/$1" ] && cat "$TMP/$1" | pick; }

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"
K="--role deepline --slot 1"

# 设计一剩下的两格半
job z2k  DRAFT_ZERO=2   $V tagdraft tagdraft -n $N $K
job zAa  DRAFT_ZERO=10  $V tagdraft tagdraft -n $N $A
job zAk  DRAFT_ZERO=10  $V tagdraft tagdraft -n $N $K
# 设计二全部
job m1a  DRAFT_MINUS=1  $V tagdraft tagdraft -n $N $A
job m1k  DRAFT_MINUS=1  $V tagdraft tagdraft -n $N $K
job m2a  DRAFT_MINUS=2  $V tagdraft tagdraft -n $N $A
job m2k  DRAFT_MINUS=2  $V tagdraft tagdraft -n $N $K
job m3a  DRAFT_MINUS=3  $V tagdraft tagdraft -n $N $A
job m3k  DRAFT_MINUS=3  $V tagdraft tagdraft -n $N $K
job m13a DRAFT_MINUS=13 $V tagdraft tagdraft -n $N $A
# 设计三全部 + 参照
job g0   GIFT_N=0       $V chaingift chaingift -n $N $A
job g2   GIFT_N=2       $V chaingift chaingift -n $N $A
job g4   GIFT_N=4       $V chaingift chaingift -n $N $A
job gs   GIFT_SURGE=0   $V chaingift chaingift -n $N $A
job fl   X=1            $V flow flow -n $N $A
job base X=1            node tools/md-sim/sim.js base -n $N
wait

echo "################ 设计一：递吃 + 堆顶 N 张置 0 ################"
echo "〔已有：递吃 3.08/3.26 · N=1 A 3.52/3.69 · N=1 K 3.34/3.51 · N=2 A 3.61/3.80〕"
show z2k "N=2 · K"
show zAa "整堆 · A"
show zAk "整堆 · K"

echo
echo "################ 设计二：递吃 + 整堆 −N（不含自己）################"
show m1a "N=1 · A"; show m1k "N=1 · K"
show m2a "N=2 · A"; show m2k "N=2 · K"
show m3a "N=3 · A"; show m3k "N=3 · K"
echo
echo "-- 自检：N=13 · A（**该 ≈ 上面「整堆置 0 · A」**，两条路不同、落点都是整堆 0）"
[ -f "$TMP/m13a" ] && cat "$TMP/m13a" | pick

echo
echo "################ 设计三：【让流】（A 槽；它不吃槽标签）################"
show g0 "GIFT_N=0 —— 只有自己那半（贴 1 张顺子匹配）"
show g2 "GIFT_N=2 —— 完整"
show g4 "GIFT_N=4 —— 送满（手牌下限就是 4，所以这是上界）"
show gs "GIFT_N=2 但不带推牌"
show fl "参照：【伏流】（每手都走顺子 = 让流自己那半的天花板）"
echo
echo "〔g2 − g0 = 送出去那半截的净值；g2 − gs = 推牌单独值多少。"
echo "  ⚠ 诊断已经给了一个反直觉的信号：GIFT_N=2 之下我方出牌 23.0 → 20.9 次/局"
echo "    （局面缩短），**而我自己的顺子收成 3.27 → 4.69 涨了** ——"
echo "    推牌把堆垫厚，那对我的顺子有利。所以这个差的符号事先定不下来。〕"

echo
echo "################ 基线 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
