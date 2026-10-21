#!/usr/bin/env bash
# 2026-10-21 ·【映照】：用户给的新机制，用户已定「**加入游戏，不能复制 J**」。
#
#   「展示 1 张手牌，刚打出的那张变成跟它相同（点数和花色）」
#
# 这一批要回答三件事，而**第三件是这一批独有的**：
#
#   一、X 落在哪一档（槽技能 +2.7~4.5）
#   二、**宽槽里会不会炸**。它的价值 = 发动次数 × 每次买到几张，
#      而发动次数跟槽的覆盖面成正比 —— 所以 4 张的 A 槽和 13 张的
#      ♣ 槽**必须都量**。只量窄槽定价，宽槽上架就超模
#   三、**「不能复制 J」那道闸值多少**。两条互相印证的路：
#      `REFLECT_J=1` 两档的 X 差（直接量），和默认档的 `jbest`
#      诊断口（J 本来是严格最优的次数）。两个数对不上就是哪儿接错了
#
# ---- 自检（**先看这两格，再看 X**）----
#
# 一、诊断里 `fires` **不能是 0**。0 = SK 常量漏了那一行，
#    而那个症状是「X = 精确 0.00」不是报错（RISEHOLD 栽过）。
#    `fires` 该接近「打出的牌命中那个槽的次数」—— A 槽 4/52，♣ 槽 13/52。
#
# 二、`changed` 明显低于 `fires` 是**正常的**（挑不出更好的就只能变成
#    自己或者变差），而 `changed = fires` 反倒可疑：说明它每次都在变，
#    包括变差那些 —— 去对 `worse`。
#
# ---- 读数时记住：这个数是**下限** ----
#
# `reflectPick` 只按「这一手收几张」贪心，不算「那张留着下一手更值钱」。
# 照【凝水】那条：价值全在挑牌精度上的件，AI 挑得笨 → 记成下限，
# **别指望重跑会变高**。所以定价要在这个数之上留余量。
#
# 旋钮：N=局数 ND=诊断局数 NA=全表局数 J=并发
set -u
N=${N:-20000}
ND=${ND:-4000}
NA=${NA:-8000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

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

echo "################ 0. 结构（闸：不过就不跑后面）################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -8 "$TMP/refs"; echo; tail -4 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"
    exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"        # A 槽：点数、4 张（窄）
K="--role deepline --slot 1"    # K 槽：点数、4 张（窄，另一头的点数）
C="--role deepline --slot 0"    # ♣ 槽：花色、13 张（宽）

# 定稿档：不能复制 J
job r_a  X=1 $V reflect reflect -n $N $A
job r_k  X=1 $V reflect reflect -n $N $K
job r_c  X=1 $V reflect reflect -n $N $C
# 开闸档：只为量那道闸的价钱
job j_a  REFLECT_J=1 $V reflect reflect -n $N $A
job j_k  REFLECT_J=1 $V reflect reflect -n $N $K
job j_c  REFLECT_J=1 $V reflect reflect -n $N $C
# 诊断（定稿档，窄槽 + 宽槽各一次）
job d_a  X=1 node tools/md-sim/proto-diag.js reflect $ND 0 lock
job d_c  X=1 node tools/md-sim/proto-diag.js reflect $ND 0 deepline
# 全表同槽排名 —— 「它在这个槽里排第几」只有这一张表答得了
job all_a X=1 node tools/md-sim/sim.js all -n $NA $A
# 基线
job base X=1 node tools/md-sim/sim.js base -n $N
wait

echo
echo "################ 1. 定稿档：不能复制 J ################"
show r_a "A 槽（点数 · 4 张）"
show r_k "K 槽（点数 · 4 张）"
show r_c "♣ 槽（花色 · 13 张）"
echo
echo "〔档位：槽技能 +2.7~4.5。读 X = 两侧平均（vs 报的那个差是 2D）。"
echo " ⚠ **♣ 槽那一格才是定价的上界** —— 上架之后玩家会往最宽的槽插它。"
echo "   A/K 两格该接近（同是 4 张），差出噪声就是跟点数轴缠上了。〕"

echo
echo "################ 2. 开闸档：REFLECT_J=1（能复制 J）################"
show j_a "A 槽"
show j_k "K 槽"
show j_c "♣ 槽"
echo
echo "〔两档的差 = **那道闸的价钱**。这个数要跟第 3 节的 jbest 对得上。"
echo "  差很大 = 闸拦住了一个真洞，用户那条限制是对的；"
echo "  差近 0 = 要么 AI 根本不挑 J（看 jbest），要么哪儿接错了。〕"

echo
echo "################ 3. 诊断：它到底做了几次 ################"
echo "---- A 槽（点数 · 4 张）----"; [ -f "$TMP/d_a" ] && cat "$TMP/d_a"
echo; echo "---- ♣ 槽（花色 · 13 张）----"; [ -f "$TMP/d_c" ] && cat "$TMP/d_c"
echo
echo "〔要对的六个数（reflect 那一行）："
echo "   fires           **0 = 没接上**（SK 常量漏行的症状是精确 0.00）。"
echo "                   该 ≈ 命中那个槽的次数：A 槽 4/52、♣ 槽 13/52"
echo "   noHand          没得展示（手里空了，或者只剩 J）。该很小"
echo "   changed         真变了几次。**低于 fires 是正常的**"
echo "   gainSum/fires   **这一件到底买到了几张牌** ← 机制有没有用看这个"
echo "   worse           被迫变差几次 ← 它的**真代价**，真代价越大越不容易超模"
echo "   jbest           J 本来是严格最优的次数 ← **那道闸的价钱的另一条量法**〕"

echo
echo "################ 4. 全表同槽排名（A 槽）################"
[ -f "$TMP/all_a" ] && cat "$TMP/all_a"
echo
echo "〔「它在这个槽里排第几」—— 诊断口答不了这个，只有这张表能。〕"

echo
echo "################ 5. 基线 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
echo "〔该是 21.8 / −0.07 / 52 ✓ —— 动过规则层的话这儿会先炸〕"
