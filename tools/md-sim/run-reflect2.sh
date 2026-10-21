#!/usr/bin/env bash
# 2026-10-21 ·【映照】第二批：**定稿档**（用户 10-21 定「可以展示，非必须」）。
#
# ---- 第一批留下的那一个数，以及它为什么被否掉 ----
#
# 第一批按字面的「变成」实现了**强制**档，A 槽量出 **−1.42 / −1.32 → X = −1.37**，
# 全表 52 件里**倒数第一**。而那个负号的来路是一条现成判据，不是 bug ——
# `ap-fishing.uvue` 的 `swapForStraight` 写着：「**换了不如不换就不换**
# —— desc 写的是『可以』替换，而连竿那次的教训是『desc 写「可」而实现是
# 强制』会把空技能变成负的」。
#
# 映照比易流还狠一层：**一副牌里每张只有一张**，所以「变成跟手里某张相同」
# **必然真的变** —— 连「展示一张正好跟它一样的」这个退路都没有。
#
# 用户据此把定稿改成「**可以**展示」，于是 `REFLECT_OPT` 的默认值
# **从 0 翻到了 1**（CLAUDE.md：旋钮默认值 = 游戏里那件技能的样子）。
# 所以这个脚本里**不带 env 跑的就是定稿档**，强制档要显式 `REFLECT_OPT=0`。
#
# ---- 这一批要回答三件事 ----
#
#   一、定稿档落在哪一档（槽技能 +2.7~4.5），**♣ 槽那一格是定价上界**
#      （它的价值 = 发动次数 × 每次买几张，而发动次数跟槽覆盖面成正比）
#   二、**「不能复制 J」那道闸值多少** —— `REFLECT_J=1` 的 X 差，
#      和诊断口 `jbest` 两条路互相印证
#   三、全表同槽排名（定价直接读那张表的建议价列）
#
# ---- 三条自检（**先看这三条，再看别的**）----
#
# 一、**强制档 A 槽必须逐位重现 −1.42 / −1.32。** 第一批之后我动过
#    `reflectPick`（加了 `REFLECT_OPT` / `cands`）又翻了默认值 ——
#    `REFLECT_OPT=0` 那条路**该一个字节都没变**。对不上 = 重构改坏了，
#    这一批全部作废。
#
# 二、**定稿档诊断里 `worse` 必须恒为 0。** 可选档不可能变得更差；
#    不为 0 就是 `bestScore` 的初始值接错了。
#
# 三、**定稿档 `kept` 必须明显大于 0。** 贴着 0 = 旋钮没接上
#    （那一档会跟强制档逐位相同 —— 看着像「可选不值钱」）。
#
# 旋钮：N=局数 ND=诊断局数 NA=全表局数 J=并发 NOALL=1 跳过全表（快 2 分钟）
set -u
N=${N:-20000}
ND=${ND:-4000}
NA=${NA:-8000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# ⚠ 第一批那个 `pick` 的第二条分支（`^    后手（我） `）**一条都匹配不上**
#   —— 实际输出是「后手（我）手里：」，中间没空格。靠第一条分支兜住的。
#   这儿顺手把**表头（角色/槽/局数）**和「先手 − 后手」那行也收进来：
#   没有表头的话，一堆数贴在一起分不清是哪个槽跑的。
pick() {
  grep -E '手里：|都插第|先手 − 后手' | head -5 \
    | sed -e 's/^ *//' -e 's/标准误/se/'
}
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { echo "-- $2"; [ -f "$TMP/$1" ] && cat "$TMP/$1" | pick; }

echo "################ 0. 结构 ################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -3 "$TMP/refs"; echo; tail -3 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"; exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"        # A 槽：点数、4 张（窄）
K="--role deepline --slot 1"    # K 槽：点数、4 张
C="--role deepline --slot 0"    # ♣ 槽：花色、13 张（宽）

# 定稿档（不带 env = 可选 + 不能复制 J）
job o_a  X=1 $V reflect reflect -n $N $A
job o_k  X=1 $V reflect reflect -n $N $K
job o_c  X=1 $V reflect reflect -n $N $C
# 定稿档 + 开 J 闸：量那道闸
job j_a  REFLECT_J=1 $V reflect reflect -n $N $A
job j_c  REFLECT_J=1 $V reflect reflect -n $N $C
# 强制档 A 槽：**只为自检**（该重现 −1.42 / −1.32）
job f_a  REFLECT_OPT=0 $V reflect reflect -n $N $A
# 诊断
job d_oa X=1 node tools/md-sim/proto-diag.js reflect $ND 0 lock
job d_oc X=1 node tools/md-sim/proto-diag.js reflect $ND 0 deepline
job d_fa REFLECT_OPT=0 node tools/md-sim/proto-diag.js reflect $ND 0 lock
# 全表同槽排名（定价直接读这张表的建议价列）
if [ "${NOALL:-0}" != "1" ]; then
  job all_a X=1 node tools/md-sim/sim.js all -n $NA $A
fi
# 基线：翻过默认值，确认规则层没被碰到
job base X=1 node tools/md-sim/sim.js base -n $N
wait

echo
echo "################ 1. 自检：强制档 A 槽该重现 −1.42 / −1.32 ################"
show f_a "强制（REFLECT_OPT=0，已被否掉的那一读）· A"
echo "〔对不上 = 翻默认值 / 加 cands 时把那条路改坏了，**下面全部作废**〕"

echo
echo "################ 2. 定稿档：可以展示 · 不能复制 J ################"
show o_a "定稿 · A 槽（点数 · 4 张）"
show o_k "定稿 · K 槽（点数 · 4 张）"
show o_c "定稿 · ♣ 槽（花色 · 13 张）"
echo
echo "〔档位：槽技能 +2.7~4.5。读 X = 两侧平均（vs 报的那个差是 2D）。"
echo " **♣ 那一格是定价的上界** —— 上架后玩家会往最宽的槽插它。"
echo " A/K 两格该接近（同是 4 张），差出噪声就是跟点数轴缠上了。"
echo " 「定稿 − 强制」（A 槽）= 「可以不展示」这半句值多少 ——"
echo "  它买的不是收益，是**把一个下行整个砍掉**，所以这个差会很大。"
echo " ⚠ 而代价砍掉之后，它就**不再有「会自损」这个不超模的理由**了。〕"

echo
echo "################ 3. 定稿档 + 能复制 J（量那道闸）################"
show j_a "J闸开 · A"
show j_c "J闸开 · ♣"
echo "〔跟第 2 节同槽相减 = **「不能复制 J」那道闸的价钱**。"
echo "  要跟第 5 节的 jbest 互相印证：差近 0 而 jbest 也近 0 = 闸拦的是空气，"
echo "  差近 0 但 jbest 很大 = 哪儿接错了。〕"

echo
echo "################ 4. 全表同槽排名（A 槽）—— 定价读这张 ################"
if [ "${NOALL:-0}" != "1" ]; then
  [ -f "$TMP/all_a" ] && cat "$TMP/all_a"
else
  echo "（NOALL=1，跳过）"
fi

echo
echo "################ 5. 诊断 ################"
echo "---- 定稿 · A 槽 ----"; [ -f "$TMP/d_oa" ] && cat "$TMP/d_oa"
echo; echo "---- 定稿 · ♣ 槽（13 张）----"; [ -f "$TMP/d_oc" ] && cat "$TMP/d_oc"
echo; echo "---- 强制 · A（对照：看 −1.37 的来路）----"; [ -f "$TMP/d_fa" ] && cat "$TMP/d_fa"
echo
echo "〔要对的几个数（reflect 那一行）："
echo "   fires    **0 = 没接上**（SK 常量漏行的症状是精确 0.00）。"
echo "            该 ≈ 命中那个槽的次数：A 槽 4/52、♣ 槽 13/52。**两档该一样**"
echo "   kept     定稿档**必须明显大于 0**；贴着 0 = 旋钮没接上。"
echo "            强制档**该恒为 0** ← 那就是 −1.37 的来路"
echo "   worse    定稿档**必须恒为 0**（可选档不可能变差）；强制档该很大"
echo "   changed  真变了几次。定稿档 changed + kept + noHand 该 = fires"
echo "   gainSum/fires  **这一件到底买到了多少张牌** ← 正收益看这个"
echo "   jbest    J 本来是严格最优的次数 ← 那道闸的价钱的另一条量法〕"

echo
echo "################ 6. 基线 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
echo "〔该是 21.8 / −0.07 / 52 ✓ —— 翻默认值只该动 reflect，碰到规则层这儿会炸〕"
