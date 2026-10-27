#!/bin/sh
# 【推牌】挪到特殊匹配之前 —— **前后对照**〔2026-10-26 用户定的规则改动〕
#
# 为什么非量不可：用户定的是「推牌在特殊匹配前执行」，而那是**关键词本身**
# 的规则，不是某一件技能的旋钮。于是三件**已上架**的件跟着变，
# 而且变的是**符号** —— 判据原文在 `draw-skills.uts:3598-3605`：
#
#  「符号由『推完轮到谁出牌』决定 … 厚堆对**下一个出牌的人**有利 …
#   而引潮贴的是**对方的**手牌 —— 他打出那张、推完牌，**轮到我**。
#   所以这个动作的收益归我。同一个动作换成「我打出、我推」就是负的
#  （压底族六件 X 全负、填塘 X=0.00，两个都是「推完轮到对手」）。
#   **这一条是这件技能的全部。**」
#
# 'early' 档下「推完轮到谁」变成「**推完还是他自己判匹配**」——
# 他可能当场把推上来的那几张吃掉。所以这三件从「稳赚厚堆」
# 变成「赌他那一手凑不成」。**这是设计上的符号翻转，要量，不能推。**
#
# ---- 口径跟各自的定价依据对齐（不是随手一跑）----
#
#   引潮 —— `SURGE_AVOID=2`（表项 3613「受害方躲 2 档 +2.27 ← 定价依据」）
#   薪潮 —— 裸跑（表项 1547 记的 2.66 是裸的）
#   逆涌 —— **这个脚本量不了**：它是庄家常驻技（`SP.JSURGE`，开河工），
#           不走槽技能那条口径。要走 `campaign.js`，而那边绝对数不可信、
#           只能读「同一套假设下两个档位的相对关系」。单开一轮。
#
# ⚠ 六格是**同一个脚本、同一个局数**跑的，所以前后可以直接相减。
#   跨脚本跟台账里的旧数相减要先看标签（R 档 + 代码状态）。
set -e
OUT=tools/md-sim
N=20000

two() {
  tag=$1; shift
  echo "=== $tag ==="
  env "$@" node $OUT/sim.js vs $A $A -n $N > $OUT/out-surgewhen-$tag.txt 2>&1
  grep -E '手里：|先手 − 后手' $OUT/out-surgewhen-$tag.txt
  echo ""
}

# ---- 甲、引潮（价 115）----
A=surge
two surge_late  SURGE_AVOID=2
two surge_early SURGE_AVOID=2 SURGE_WHEN=early

# ---- 乙、薪潮（价 90）----
A=fuel
two fuel_late
two fuel_early SURGE_WHEN=early

# ---- 丙、新件本身：同一张手牌上两个标签 ----
#
# 用户定稿：「1 张手牌带上【推牌】【21 匹配】」。
# 载体 `tagdraft`（递吃原型）只贴【21 匹配】那一个标签，所以这一跑
# 走的还是 `DRAFT_SURGE` 那个原型旋钮 —— 它推在 `resolveMatch` 开头，
# **正是 'early' 那个位置**。两条路量出来该一致，这一跑是**接线自检**：
#
#   DRAFT_SURGE=1 （原型路，推在 resolveMatch 内部）  该复现 3.49
#
# 真正的「两个标签同一张牌」要等 `SK.TAGSURGE` 那件进表才量得到 ——
# 那是上架实现的一部分，不在这个脚本里。
A=tagdraft
two newskill_proto DRAFT_SURGE=1

# ---- 丁、基线回归：'early' 档不该动到不碰推牌的局 ----
#
# 两侧都不带任何推牌件时，'late' 和 'early' 该**逐位相同** ——
# 不同就说明那两处插入点碰到了别的路（比如 surged 没清、推了两次）
echo "=== regress_base（该逐位相同）==="
node $OUT/sim.js base -n $N > $OUT/out-surgewhen-base-late.txt 2>&1
SURGE_WHEN=early node $OUT/sim.js base -n $N > $OUT/out-surgewhen-base-early.txt 2>&1
diff $OUT/out-surgewhen-base-late.txt $OUT/out-surgewhen-base-early.txt \
  && echo "  ✓ 逐位相同 —— 两处插入点没碰到不带推牌的路" \
  || echo "  ✗ 有差异 —— 上面就是。先查 surged 有没有置 0（静默推两次）"
