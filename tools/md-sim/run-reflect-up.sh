#!/usr/bin/env bash
# 2026-10-21 ·【映照】当**追加子句**挂到现有技能上：一次量全表。
#
# ---- 问的是什么 ----
#
# 用户三问：现有技能加映照分会不会更高？该升级带上映照的有哪些？
# 配合映照需要调效果的有哪些？
#
# ---- 为什么不是「两件插两个槽」----
#
# `triggersOf` 一张牌最多触发 **2 件**（花色槽 1 + 点数槽 1），所以两件
# 同时作用在同一手牌上只发生在「花色槽 ∩ 点数槽」= 52 张里 1 张
#（≈0.44 手/局）—— 协同基本是噪声，量它等于量噪声。
# 能让多件同时响的只有【红钩】和【点数互通】那两件常驻技。
#
# 所以这儿量的是 `REFLECT_WITH=all`：**每件技能自己带上映照那一句**，
# 等于给它的 desc 末尾追加「并且可以展示 1 张手牌，这张变成跟它相同」。
#
# ---- 口径（CLAUDE.md：两个数相减前先确认同一次跑、同一版代码）----
#
# **基线表跟升级表在同一个脚本里跑**，不去减第二批那张旧表 ——
# 中间动过 `ai.js` 的 `pickCard` 和 `reflectOn`，隔版相减正是这个项目
# 反复栽的那一条（「1.29 分是版本差，不是口径差」）。
#
# 对照锚也取自**同一次跑**：基线表里【映照】自己那一行的 X，
# 就是「这个槽里单独放映照值多少」。于是
#
#   Δ    = 那件技能带上映照 − 不带          （升级值多少）
#   协同 = Δ − 映照自己的 X                 （>0 才叫有协同，否则只是叠了一件）
#
# ⚠ 映照自己那一行的 Δ 该 ≈ 0（两边都是映照），它是这张表的**自检格**。
#
# ⚠ 两道闸照旧是默认值：不能复制 J（REFLECT_J 未开）、可以不展示
#  （REFLECT_OPT 默认可选）。所有数带着这两个前提。
#
# ⚠ 这一批的数**仍然是下限**：`reflectPick` 只按「这一手收几张」贪心，
#   AI 不会算「这张留着下一手更值钱」。照【凝水】那条，别指望重跑变高。
#
# 旋钮：NA=全表局数 N=base 局数 SKIP_GATE=1 跳过结构检查
set -u
NA=${NA:-8000}
N=${N:-20000}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

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

A="--role lock --slot 0"        # A 槽：点数、4 张（窄）
C="--role deepline --slot 0"    # ♣ 槽：花色、13 张（宽）

( X=1 node tools/md-sim/sim.js all -n $NA $A >"$TMP/a_off" 2>&1 ) &
( X=1 REFLECT_WITH=all node tools/md-sim/sim.js all -n $NA $A >"$TMP/a_on" 2>&1 ) &
( X=1 node tools/md-sim/sim.js all -n $NA $C >"$TMP/c_off" 2>&1 ) &
( X=1 REFLECT_WITH=all node tools/md-sim/sim.js all -n $NA $C >"$TMP/c_on" 2>&1 ) &
( X=1 node tools/md-sim/sim.js base -n $N >"$TMP/base" 2>&1 ) &
wait

# 两张表按技能名 join。列：Δ / 协同 / 名字 / 覆盖面 / 原 X / 带映照 X
# 锚 = 基线表里【映照】那一行的 X（同一次跑）
joint() {
  awk '
    # 两行非数据行也是 7 个字段（表头的「全表定价表 · …」和尾注的
    # 「目标档位：单件每局 +2.7 …」），会混进来打印成两行 0.00。
    # 按「名字里带全角冒号」和「覆盖面是那个间隔点」把它们剔掉
    function isrow() { return NF==7 && $1 !~ /：/ && $2 != "·" }
    NR==FNR { if (isrow()) { b[$1]=$5 }; next }
    FNR==1  { anchor = ("映照" in b) ? b["映照"] : 0 }
    isrow() && ($1 in b) {
      printf "%+7.2f %+8.2f   %-10s %-6s %7.2f -> %7.2f\n",
        $5-b[$1], $5-b[$1]-anchor, $1, $2, b[$1], $5
    }
    END { printf "   〔锚：这一槽里【映照】单件 X = %+.2f〕\n", anchor }
  ' "$1" "$2"
}
head_row() {
  echo "       Δ      协同   技能       覆盖   原 X  ->  带映照"
  echo "  $(printf '%.0s-' $(seq 1 56))"
}

echo
echo "################ 1. 回归：base 该一位没动 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
echo
echo "〔必须是 21.8 / -0.07 / 43.6+2.4+6.0 = 52.0。"
echo " REFLECT_WITH 默认空，reflectOn 退化成原来那个 has()，base 不该变。"
echo " 它变了 = reflectOn 那次重构漏了路径，整批作废。〕"

echo
echo "################ 2. A 槽（点数 · 4 张 · 窄）按 Δ 排 ################"
head_row
joint "$TMP/a_off" "$TMP/a_on" | sort -g -r

echo
echo "################ 3. ♣ 槽（花色 · 13 张 · 宽）按 Δ 排 ################"
head_row
joint "$TMP/c_off" "$TMP/c_on" | sort -g -r

echo
echo "################ 4. 怎么读这两张表 ################"
echo "〔标准误：单件约 0.18（n=8000），**两表相减后约 0.25** ——"
echo "  |Δ| < 0.5 的行基本读不出东西，别拿去定设计。"
echo
echo " 三问各看哪一列："
echo "   『加映照会不会更好』   看 Δ > 0 的行（而 Δ 里有一半是映照自带的）"
echo "   『该升级带上映照的』   看**协同**那一列 —— 它才是「1+1 > 2」的部分；"
echo "                          协同 ≈ 0 = 只是把两件捆一起，不如各占一个槽"
echo "   『需要调效果的』       看**协同显著为负**的行 —— 那是两件在抢同一"
echo "                          条资源（同一张牌既要当原脸触发、又要被改脸），"
echo "                          升级前得先改那件技能的判定时点"
echo
echo " ⚠ 自检格：【映照】自己那一行的 Δ 该 ≈ 0（两边都是映照）。"
echo "   它偏离 0 超过 0.3 就说明 REFLECT_WITH=all 这个档有副作用，先查它。"
echo
echo " ⚠ 被动件（不读 skills 的那些）在这张表里的 Δ 该 ≈ 锚本身，"
echo "   也就是协同 ≈ 0 —— 它们是这张表的**第二组对照**，不是结论。〕"
echo
echo "〔原始四张表留在 $TMP —— 脚本退出时会删。要留的话自己重定向。〕"
