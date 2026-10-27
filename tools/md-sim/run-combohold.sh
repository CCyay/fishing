#!/bin/sh
# 【攒组合】留在手中等集齐再打 vs 原打法 —— **前后对照**〔2026-10-26 用户定的量法〕
#
# 用户原话：「像这类配合件 应该要手牌集齐了这两件后再接连打出吧。
# 量一下，留在手中等集齐再打 / 原打法 比较下哪一种分数比较高」。
#
# ---- 为什么是 `pair` 而不是 `vs`，以及为什么开 `COMBO_HOLD_BOTH` ----
#
# 这个旋钮改的是**打法**不是技能，而 `ai.js:314-318` 那条写着：
# 「两边都变聪明的话差值是 0，要的是不对称」。
#
# 这一跑的不对称**不是靠只给一侧开旋钮拿到的，是靠配装拿到的** ——
# `comboRanksOf` 装不齐两件就返回 null，所以 `COMBO_HOLD_BOTH=1` 的真实
# 语义是「**谁带着这套组合，谁就这么打**」：
#
#   `pair` 的 7 格里，「我带两件」那格只有我这侧有组合（旋钮只对我生效），
#   「对手带两件」那格只有他那侧有（只对他生效），基线格两边都没有（全程空转）。
#
# 于是 back / front / X **三个数口径一致**，可以直接跟原打法那一跑相减。
# ⚠ **反过来只给 R.ME 开（不设 BOTH）是错的**：那样 back 带忍法、
#   front 不带，X = (back+front)/2 变成两种打法的混合，减出来的数没有含义。
#
# ---- 读哪几个数 ----
#
#   甲 「两件都带」那一行的 **X / back** —— 正着变大就是这个打法更强；
#   乙 **边际 X** —— 配合件的合格线（用户 2026-10-26 定 ≥ 1）在这个数上；
#   丙 **攒组合诊断那一段** —— 分差一个数答不了「它做了几次」
#      （CLAUDE.md 第四节）。三件事：忍成了没有 / 集齐频不频繁 /
#      **下一手接连打出发生了没有**。第三件决定还要不要再加一个连击旋钮。
#
# ⚠ 四格是**同一个脚本、同一个局数、同一个种子**跑的，所以前后可以直接相减。
#   跟台账里的旧数相减要先看标签（R 档 + 代码状态）。
set -e
OUT=tools/md-sim
N=20000

# 料件 = 拢水（落堆码两张料，自带【通配】【保护】）
# 提款件 = 搭档（顺子匹配 + 通配，才是把料兑成分的那一手）
BAIT=stow

two() {
  partner=$1
  echo "############ ${BAIT} + ${partner} ############"
  echo "=== 原打法（见料就打）==="
  node $OUT/sim.js pair $BAIT $partner -n $N \
    > $OUT/out-combohold-$partner-off.txt 2>&1
  grep -E '只带|两件都带|标准误|再加|协同' $OUT/out-combohold-$partner-off.txt
  echo ""
  echo "=== 攒组合·纯形态（一律忍到集齐）==="
  COMBO_HOLD=$BAIT,$partner COMBO_HOLD_BOTH=1 \
    node $OUT/sim.js pair $BAIT $partner -n $N \
    > $OUT/out-combohold-$partner-on.txt 2>&1
  grep -E '只带|两件都带|标准误|再加|协同|忍了|料牌打出|忍不住|账面' \
    $OUT/out-combohold-$partner-on.txt
  echo ""
  # 第三档〔2026-10-26 加〕：**只忍钓不着的那张料**。
  #
  # 纯形态那一跑的诊断口指出两条成本，这一档只拆掉第一条：
  #   甲 `账面放弃 3.93 张/局`（能收 5 张也照样攥着）—— 这一档拆掉它；
  #   乙 `忍了 52.6% 的手` + `集齐 18.0%`（A 牌常驻堵手）—— 这一档拆不掉。
  # 所以它量的是「甲占了 −2.84 里的几分」。要是差额很小，
  # 那就证明主项是乙，而乙是结构性的、加闸救不回来。
  #
  # ⚠ 它的语义**退化成「料牌不当饵烧掉」**（钓不着的牌在主循环里本来也
  #   选不上），所以这是**另一个打法**，不是「弱一点的攒组合」——
  #   三档别连成一条曲线读
  echo "=== 攒组合·只忍钓不着的（钓得着就当场兑现）==="
  COMBO_HOLD=$BAIT,$partner COMBO_HOLD_BOTH=1 COMBO_HOLD_IDLE=1 \
    node $OUT/sim.js pair $BAIT $partner -n $N \
    > $OUT/out-combohold-$partner-idle.txt 2>&1
  grep -E '只带|两件都带|标准误|再加|协同|忍了|料牌打出|忍不住|账面' \
    $OUT/out-combohold-$partner-idle.txt
  echo ""
}

# 伏流 = 这一族最强的提款手柄（全表 X 4.01），拢水上架时就是拿它定的价
two flow
# 涉水 = 同族弱一档的那一件（X 2.22）。两个搭档一起量是为了看这个打法的
# 收益**跟搭档强度是不是同向** —— 只量一个的话分不清「这个打法有用」
# 和「伏流那一格刚好吃到了」
two wade

# ---- 回归：不带这套组合的跑不该有任何变化 ----
#
# `comboRanksOf` 装不齐两件就返回 null，所以 `base` 下这个旋钮该**全程空转**。
# 不逐位相同就说明那两处 `continue` 碰到了别的路（最可能是 `comboRanks`
# 真值判断写错，把「装不齐」当成了「装齐了」）
echo "=== regress_base（该逐位相同）==="
node $OUT/sim.js base -n $N > $OUT/out-combohold-base-off.txt 2>&1
COMBO_HOLD=$BAIT,flow COMBO_HOLD_BOTH=1 \
  node $OUT/sim.js base -n $N > $OUT/out-combohold-base-on.txt 2>&1
diff $OUT/out-combohold-base-off.txt $OUT/out-combohold-base-on.txt \
  && echo "  ✓ 逐位相同 —— 旋钮在不带组合的跑里空转" \
  || echo "  ✗ 有差异 —— 上面就是。先查 comboRanksOf 那两条 null 返回"
