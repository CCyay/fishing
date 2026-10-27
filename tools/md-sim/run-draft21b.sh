#!/bin/sh
# 第二批：补上第一批读不到的两格 —— 跟 run-draft21.sh **同一个载体、同一个局数**，
# 所以这两格的数可以直接跟第一批相减（同口径、同版本、同一天）。
#
# 为什么要第二批（两格各有各的理由，别混成一个）：
#
# 甲、**穿过无点数的主场缺两列。** 第一批那一跑（`vs tagdraft suitcolor`）
#     X 读到了（+1.90 → +4.58，反制 +2.68），而**判读它的两列读不到** ——
#     不对称那条分支原先一张【21 匹配】诊断表都不打（诊断块整个在
#     `if (mirror)` 里面，`sim.js:2013`）。而「用掉几成」和「整堆吃完」
#     **比 X 先看**：它们判这条轴是活的还是死的。
#     `sim.js` 那头 2026-10-26 补上了，这儿重跑一次把两列读出来。
#     ⚠ 顺带也是那次改动的**回归检查** —— 对称跑的表不该有任何变化
#     （`dRow`/`sRow` 是从 mirror 块里**提出来共用**的，不是复制一份）。
#
# 乙、**送对手推牌那一档只量了 N=2，而它超档 2.25 分**（6.75 vs 上限 4.5）。
#     N=1 是这条线上唯一还没量的格子。一次量全，别从 N=2 往下推 ——
#     CLAUDE.md：「一次把矩阵量全，不边推边量」。
#
# 载体理由见 run-draft21.sh 的头注（四条，第四条是决定性的：
# `DRAFT_GIFT_N` 的闸是 `has(skills, SK.TAGDRAFT)`，不是 `hasDraftLine`）。
set -e
OUT=tools/md-sim
CARRIER=tagdraft
N=20000

run() {
  tag=$1; shift
  echo "=== $tag ==="
  env "$@" node $OUT/sim.js vs $CARRIER $CARRIER -n $N > $OUT/out-draft21b-$tag.txt 2>&1
  grep -E '手里：|先手 − 后手|后手（我）|先手（对手）' $OUT/out-draft21b-$tag.txt
  echo ""
}

# 乙：送对手 1 张推牌（N=2 实测 6.75，超档；这一格判它还救不救得回来）
run gift1 DRAFT_GIFT_N=1

# 丙、**决策所在的那一格**〔2026-10-26 加〕：整堆 −2 点。
#
# 为什么非量不可：【漫流】那块墓碑（`draw-skills.uts:3886`）读全之后，
# 它的死因不是「缩局」，是**「同族里换了一件更强而且无代价的」**
#（易流 3.60 > 漫流 3.00，且不碰牌库）。而这条线上
# `DRAFT_ZERO=2`（3.72）和 `DRAFT_MINUS=3`（3.57）都 **> 推牌1层的 3.49**
# 而且局长精确 46.00 —— **推牌1层正站在漫流当年那个位置**。
#
# 唯一能救它的是「它不生压吃病」（用掉 72.8%，置0档只剩 16.2%）。
# 于是三项（X 进档 / 不缩局 / 不生病）全优的那一格就落在 N=2 上，
# 而矩阵只量了 N=1（2.87、48.0%）和 N=3（3.57、36.0%）—— **中间这格空着**。
#
# ⚠ 不许从两头内插。CLAUDE.md：「一次把矩阵量全，不边推边量」，
#   而那一节记着五层推算层层错的实例。这一格是**上架决策本身**，
#   内插出来的数不能用来定一件要进游戏的技能。
run minus2 DRAFT_MINUS=2

# 甲：穿过无点数的主场，这次带诊断表
echo "=== thru_field（vs tagdraft suitcolor · 不对称 · 带诊断）==="
DRAFT_VOID_THRU=1 node $OUT/sim.js vs $CARRIER suitcolor -n $N \
  > $OUT/out-draft21b-thru_field.txt 2>&1
cat $OUT/out-draft21b-thru_field.txt
echo ""

# 甲的回归检查：对称跑的诊断表该跟第一批 base 逐位相同
echo "=== regress_base（该跟第一批 base 逐位相同）==="
node $OUT/sim.js vs $CARRIER $CARRIER -n $N > $OUT/out-draft21b-regress.txt 2>&1
diff $OUT/out-draft21-base.txt $OUT/out-draft21b-regress.txt \
  && echo "  ✓ 逐位相同 —— 提 dRow/sRow 那次改动没碰坏对称跑" \
  || echo "  ✗ 有差异 —— 上面就是，先查那次改动"
