#!/usr/bin/env bash
# 2026-10-21 · 用户「21 匹配的新设计」三条，一次量完。
#
#   设计一  置 0，1 张手牌带上【21 匹配】
#   设计二  牌堆点数 −N，1 张手牌带上【21 匹配】
#   设计三  1 张手牌带上【顺子匹配】，对方 N 张手牌带上【通配】【推牌】
#
# 三条的共同点是**后半句都是【递吃】**（10-21 刚量过：A 3.17 / K 2.81），
# 所以设计一、二不是新技能，是**递吃上的一个旋钮**；只有设计三是新件。
#
# ================== 量之前必须知道的三件事 ==================
#
# 一、**设计三的原型没有验过**，所以它的数现在还不能用来否这个设计。
#    CLAUDE.md 第四节那条是这个项目最贵的一条：
#   「原型跟规则对不上时，那个数不是『这个设计的数』，是『我写的那个
#    东西的数』—— 拿它去否一个设计，会让一条本来成立的路线被永久关掉。」
#    凌流那次就是这么丢的（−2.16 全是 bug）。
#
#    所以 §4 的 X **要等 §3 的诊断过了才能读**，而过关线是三条：
#      `tagged/局` ≈ 我方出牌数（每手贴一张，手里贴满了才贴不动）
#      `fired`     ≈ `cashed`（贴了的打出去就该跑顺子，差很多 = 闸没接上）
#      `cashed/tagged` 落在 **88.9~92.6%** 附近（递吃实测的自控链兑现率）
#    任何一条明显不对，下面的 X 都是废的。
#
# 二、**设计三有两半，而两半方向相反**，所以 `GIFT_N=0` 那一档
#    不是可选的：自己那半是正的（递吃证明了标签形式成立），
#    对手那半在送分，合起来只有一个和，**分不出送出去多少**。
#
# 三、设计一、二都是**宽松读法**（减 / 置 0 跟「走 21 匹配」挤进同一手），
#    所以量出来是**上限**。字面读法（贴标签那一手就减）中间隔着对手
#    一手，只会更差。**上限都不值，字面版不用写。**
#
# ---- 设计二那个旋钮的自检 ----
#
# `DRAFT_MINUS=13` 应当 ≈ `DRAFT_ZERO=10`（见 rules.js 那段注释）：
# K 减 13 到底，所以 13 那一档把整堆压成 0；而堆常年 2.3~3.3 张、
# `DRAFT_ZERO` 的循环按 `n < G.pile.length` 截断，所以 10 那一档也是整堆 0。
# **两条路不同、落点相同** —— 差超出噪声就是有一头接错了。
#
# 〔⚠ 别拿低吃的 3.76 当自检。低吃在 `protoOnLand` 里减、**含它自己**、
#   每手都减；这个在 `resolveMatch` 里减、**不含自己**、只在判 21 匹配
#   那一手减。不含自己是有意的：含自己会连带改掉「预算 = 21 − 自己点数」，
#   一个旋钮同时动两样就读不出是哪一样在动〕
#
# 旋钮：N=20000 局数、ND=4000 诊断局数、J=并发数、SKIP_GATE=1 跳过结构检查
set -u
N=${N:-20000}
ND=${ND:-4000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 照 run-tagdraft.sh 那一套：后台跑、各写各的临时文件、最后按**写死的
# 顺序**拼出来，所以读起来跟串行版一样而墙上时间是「最慢那一个」
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( "$@" >"$TMP/$tag" 2>&1 ) &
}
# 带环境变量的那种（旋钮档）
jobe() {
  local tag=$1; local env=$2; shift 2
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env $env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { [ -f "$TMP/$1" ] && cat "$TMP/$1"; }

echo "################ 0. 结构（闸：不过就不跑后面）################"
# 加了【让流】→ SKILLS 表、SK 常量、refs.js 的 SIM_ONLY 白名单**三处**都要改到
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -12 "$TMP/refs"; echo; tail -4 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo
    echo "!!!! 结构检查没过（refs=$rc_refs check=$rc_check）—— 停在这儿。"
    echo "     坏表上跑出来的数是废的。"
    echo "     确实想跑：SKIP_GATE=1 bash tools/md-sim/run-designs.sh"
    exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

echo
echo "################ 并发起跑（J=$J）################"

A="--role lock --slot 0"      # 江口闸官 A 槽（吃水 3.41 / 递吃 3.17 那一格）
K="--role deepline --slot 1"  # 深海钓手 K 槽（吃水 1.17 / 递吃 2.81 那一格）

# ---- 对照：这一版代码上的递吃（**同一批**，所以下面减得动）----
#
# 加了三个旋钮 + 一件原型，而默认档下它们全是死代码
#（`DRAFT_MINUS=0`、`flowTagOn` 恒假）。所以这两格该跟 10-21 上一轮
# **逐位相同**：3.28/3.54 和 2.72/2.89。不同就说明动到了公共路径，
# 那时候整张表都要重跑
job c_tag_a node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
job c_tag_k node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K

# ---- 设计一：递吃 + 堆顶 N 张置 0 ----
#
# 「置 0」原话没写几张，所以三档都量：1 张、2 张、整堆
#（堆常年 2.3~3.3 张，循环按 `n < G.pile.length` 截断，所以 10 = 整堆）。
#
# ⚠ 事前就看得见的病：**0 点不占预算也不断链**（21 匹配词条里那半句），
#   所以置得越多越靠近「无条件收整堆」—— 那正是压吃那个病
#  （压吃诊断：99.7~100% 吃光整堆、预算用掉 0~18.6%，21 匹配退化成摆设）。
#   所以这三档要**对着 §3 的「整堆吃完」那一列读**，不是只看 X
jobe z1_a "DRAFT_ZERO=1"  node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe z1_k "DRAFT_ZERO=1"  node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K
jobe z2_a "DRAFT_ZERO=2"  node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe z2_k "DRAFT_ZERO=2"  node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K
jobe zA_a "DRAFT_ZERO=10" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe zA_k "DRAFT_ZERO=10" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K

# ---- 设计二：递吃 + 整堆 −N（不含自己）----
jobe m1_a "DRAFT_MINUS=1" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe m1_k "DRAFT_MINUS=1" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K
jobe m2_a "DRAFT_MINUS=2" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe m2_k "DRAFT_MINUS=2" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K
jobe m3_a "DRAFT_MINUS=3" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A
jobe m3_k "DRAFT_MINUS=3" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $K
# 自检：这一格该 ≈ 上面的 zA_a（两条路不同、落点都是「整堆 0」）
jobe m13_a "DRAFT_MINUS=13" node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" $A

# ---- 设计三：【让流】----
#
# 这一件**不吃槽标签**（它不是 21 匹配，没有「21 − 点数」那个预算），
# 所以只在 A 槽量一格，省下的机器时间给诊断
jobe g0_a "GIFT_N=0" node tools/md-sim/sim.js vs chaingift chaingift -n "$N" $A
job        g2_a      node tools/md-sim/sim.js vs chaingift chaingift -n "$N" $A
jobe gs_a "GIFT_SURGE=0" node tools/md-sim/sim.js vs chaingift chaingift -n "$N" $A
# 参照物：【伏流】—— 它是「每手都走顺子匹配」的那件正式技能。
# 让流自己那半截是「**只有贴了标签的那张**走顺子」，所以伏流是它的天花板
job fl_a node tools/md-sim/sim.js vs flow flow -n "$N" $A

# ---- 诊断（**先读这些，再读上面的 X**）----
jobe d_g0 "GIFT_N=0" node tools/md-sim/proto-diag.js chaingift "$ND" 0 lock
job        d_g2      node tools/md-sim/proto-diag.js chaingift "$ND" 0 lock
jobe d_m2 "DRAFT_MINUS=2" node tools/md-sim/proto-diag.js tagdraft "$ND" 0 lock
jobe d_z1 "DRAFT_ZERO=1"  node tools/md-sim/proto-diag.js tagdraft "$ND" 0 lock

# ---- 基线：不带这几件的路径一行都没动，所以该跟上一轮逐位相同 ----
job base node tools/md-sim/sim.js base -n "$N"

wait

echo
echo "################ 1. 对照：这一版代码上的递吃 ################"
echo "〔该跟 10-21 上一轮逐位相同：A 3.28/3.54、K 2.72/2.89〕"
echo "---- A 槽 ----"; show c_tag_a
echo; echo "---- K 槽 ----"; show c_tag_k

echo
echo "################ 2. 诊断：机制到底跑没跑通 ################"
echo "---- 【让流】GIFT_N=0（只有自己那半）----"
echo "〔过关线：tagged ≈ 出牌数、fired ≈ cashed、cashed/tagged ≈ 0.89~0.93〕"
show d_g0
echo
echo "---- 【让流】GIFT_N=2（完整）----"
echo "〔多看一个 gifted/giftPlayed：gifted 恒 0 = 送不出去（手里全 J / 全贴过）〕"
show d_g2
echo
echo "---- 【递吃】+ DRAFT_MINUS=2 ----"
echo "〔draftminus.fires 该 ≈ tagdraft.cashed；zeroed/fires 是它买到的免费垫片〕"
show d_m2
echo
echo "---- 【递吃】+ DRAFT_ZERO=1 ----"
show d_z1

echo
echo "################ 3. 设计一：递吃 + 堆顶 N 张置 0 ################"
echo "---- N=1 · A ----"; show z1_a
echo; echo "---- N=1 · K ----"; show z1_k
echo; echo "---- N=2 · A ----"; show z2_a
echo; echo "---- N=2 · K ----"; show z2_k
echo; echo "---- 整堆 · A ----"; show zA_a
echo; echo "---- 整堆 · K ----"; show zA_k

echo
echo "################ 4. 设计二：递吃 + 整堆 −N（不含自己）################"
echo "---- N=1 · A ----"; show m1_a
echo; echo "---- N=1 · K ----"; show m1_k
echo; echo "---- N=2 · A ----"; show m2_a
echo; echo "---- N=2 · K ----"; show m2_k
echo; echo "---- N=3 · A ----"; show m3_a
echo; echo "---- N=3 · K ----"; show m3_k
echo
echo "---- 自检：N=13 · A（该 ≈ 上面「整堆置 0 · A」）----"; show m13_a

echo
echo "################ 5. 设计三：【让流】################"
echo "⚠ **先确认 §2 那三条过关线都过了**，不然这几个数不是这个设计的数。"
echo
echo "---- GIFT_N=0（只有自己那半，正的）----"; show g0_a
echo; echo "---- GIFT_N=2（完整：自己 1 张 + 送对手 2 张）----"; show g2_a
echo "〔g2 − g0 就是**送出去那半截的净值**，这是量它的全部理由〕"
echo; echo "---- GIFT_N=2 但不带推牌（GIFT_SURGE=0）----"; show gs_a
echo "〔g2 − gs 是【推牌】那一条单独值多少，正负都有可能〕"
echo; echo "---- 参照：【伏流】（每手都走顺子，所以是让流自己那半的天花板）----"
show fl_a

echo
echo "################ 6. 基线没被动过 ################"
show base

echo
echo "################ 跑完：怎么读 ################"
echo "  ⚠ sim.js vs 报的是**两侧原始值**，X 是两侧平均、D 是差的一半。"
echo "  档位：槽技能 +2.7~4.5。递吃本体 A 3.17 / K 2.81。"
echo
echo "  设计一、二 → 它们要回答的是「比光一个递吃多值多少」，"
echo "              所以读的是 §3/§4 减 §1，**而且还要看 §2 的整堆吃完率**："
echo "              贴着 100% 就是压吃那个病（决策被删掉，21 匹配退化成摆设）。"
echo "  设计三   → 读 §5 的 g2 − g0。g0 是上限（自己那半），"
echo "              g2 − g0 是送出去的代价。两个都要，一个和没用。"
