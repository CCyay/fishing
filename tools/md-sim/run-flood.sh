#!/usr/bin/env bash
# 2026-10-21 · 洪水 ×「推牌 N 张，遇到匹配则收走算自己的」
#
# 用户给的效果**直译就是洪水加一个上限**：
#   「推牌 N 张」          = FLOOD_CAP=N
#   「遇到匹配则收走算自己的」= floodFor 本来的结算
# 同一个结算在【推牌】那边是 `SURGE_HIT='score'`，而那条注释自己写着
# 「**'score' 就是洪水**，X +4.7 超档那一档」。所以这不是一件新技能，
# 是**洪水的参数空间里的一格**，而那一格从来没在现行规则档下量过。
#
# ---- 为什么整张表要重跑，而不是去读 rules.js 里那张旧扫描表 ----
#
# 那张表（FLOOD_CAP 那段）是**旧规则档**：后手基线优势 +3.03、
# 每人每局 24.4 分。现行是 R3（基线 ≈ 0、21.8 分）。按项目规矩
# 「改了基准先声明哪些旧数作废」——**整表作废**，一格都不能拿来减。
#
# 而且那张表的否决词（「溢价在所有 N 下都是 +3.8~4.5」「后手变负」）
# **整段是在说 D**，而 D 那条死因已经被规则变更治掉了（洪水现在
# D +0.42~+0.45）。**这条路是被一个现在不成立的理由否掉的。**
#
# ---- 两个形状，别混着读 ----
#
#   FLOOD_STOP=hit   撞上就停 —— 删它之前的行为。落堆张数不定 →
#                    **翻牌库奇偶**（SURGE_HIT 那段记着量级约 0.8 分）
#   FLOOD_STOP=full  推满 N 张再结算 —— 恒落 N 张，偶数 N **奇偶安全**，
#                    而且「翻几张」完全确定 → 正面治掉那条死因
#                   （「强度来自『翻几张不由你定』这个不确定性本身」）
#
# full 比 hit 收得**多**（命中之后推的那几张也一起被收走），这是有意的。
# **别拿 full 的分直接跟 hit 比强弱** —— 要比的是「同一个 X 档位下谁的结构干净」。
#
# 口径：`one`、A 槽（定价锚，全表都按它定价）、n=20000、两侧都量。
# 目标档 +2.7~4.5，锚价 = 25 + X×21。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."
A="--role lock --slot 0"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# 跑一格。$1 = 文件名 · $2 = 标签（打印用）· 其余 = 环境变量赋值
cell() {
  local f="$1"; shift
  local label="$1"; shift
  ( env "$@" node tools/md-sim/sim.js one flood -n "$N" $A >"$TMP/$f" 2>&1
    echo "$label" >"$TMP/$f.label" ) &
}

# 汇总一行：抓「后手 … 先手 … X … D … 标准误 …」那行 + 建议价
row() {
  local f="$1"
  local label
  label=$(cat "$TMP/$f.label" 2>/dev/null || echo "$f")
  if [ ! -s "$TMP/$f" ]; then printf '  %-22s （没跑出来）\n' "$label"; return; fi
  # 跑挂了（旋钮组合非法会 throw）——把头一行错误打出来，别静默
  if grep -q 'Error' "$TMP/$f"; then
    printf '  %-22s ✗ %s\n' "$label" "$(grep -m1 'Error' "$TMP/$f" | cut -c1-70)"
    return
  fi
  awk -v L="$label" '
    /^  后手/ { back=$2; front=$4; x=$6; d=$8; se=$10 }
    /^  建议价：/ { split($0, a, "："); price=a[2] }
    END { printf "  %-22s %7s %7s  X %7s  D %7s  se %s   价 %s\n",
            L, back, front, x, d, se, price }
  ' "$TMP/$f"
}

echo "################ 0. 结构 ################"
node tools/md-sim/refs.js  >"$TMP/refs"  2>&1; rc_refs=$?
node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
tail -3 "$TMP/refs"; echo; tail -3 "$TMP/check"
if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
  echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"
  echo "---- refs ----"; cat "$TMP/refs"
  echo "---- check ----"; cat "$TMP/check"
  exit 1
fi

# ================ 第 1 批：hit 档（删它之前的形状）================
# cap0 是**基准格** —— 它替代 rules.js 里那张旧表的「不限」那一行，
# 也是「洪水在现行规则档下到底值多少」这个问题的答案
cell h0 'hit · 不限'   FLOOD_STOP=hit FLOOD_CAP=0
cell h2 'hit · 2 张'   FLOOD_STOP=hit FLOOD_CAP=2
cell h3 'hit · 3 张'   FLOOD_STOP=hit FLOOD_CAP=3
cell h4 'hit · 4 张'   FLOOD_STOP=hit FLOOD_CAP=4
cell h5 'hit · 5 张'   FLOOD_STOP=hit FLOOD_CAP=5
cell h6 'hit · 6 张'   FLOOD_STOP=hit FLOOD_CAP=6
wait
cell h8 'hit · 8 张'   FLOOD_STOP=hit FLOOD_CAP=8

# ================ 第 2 批：full 档（「推 N 张」的字面读法）================
cell f2 'full · 2 张'  FLOOD_STOP=full FLOOD_CAP=2
cell f3 'full · 3 张'  FLOOD_STOP=full FLOOD_CAP=3
cell f4 'full · 4 张'  FLOOD_STOP=full FLOOD_CAP=4
cell f5 'full · 5 张'  FLOOD_STOP=full FLOOD_CAP=5
cell f6 'full · 6 张'  FLOOD_STOP=full FLOOD_CAP=6
wait
cell f8 'full · 8 张'  FLOOD_STOP=full FLOOD_CAP=8

# ================ 第 3 批：抽库（FLOOD_RUSH=16）================
# 这是洪水**唯一还活着的那条死因**：AI 不懂抽库 X +4.71 → 懂了 +5.25。
# 10-15 的补记说「限幅治不了抽库，因为抽库只要翻就有效」—— 那是对 hit 说的。
# full 档每次抽库量**恒为 N**，所以这四格一减就知道上限到底削掉了多少
cell r0 'hit·不限 +抽库'  FLOOD_STOP=hit  FLOOD_CAP=0 FLOOD_RUSH=16
cell r6 'hit·6 张 +抽库'  FLOOD_STOP=hit  FLOOD_CAP=6 FLOOD_RUSH=16
cell q4 'full·4 张 +抽库' FLOOD_STOP=full FLOOD_CAP=4 FLOOD_RUSH=16
cell q6 'full·6 张 +抽库' FLOOD_STOP=full FLOOD_CAP=6 FLOOD_RUSH=16
wait

echo
echo "################ 1. hit 档：撞上就停（= 删它之前的形状）################"
echo "                         后手    先手       X         D      se     建议价"
for f in h0 h2 h3 h4 h5 h6 h8; do row $f; done

echo
echo "################ 2. full 档：推满 N 张再结算 ################"
echo "                         后手    先手       X         D      se     建议价"
for f in f2 f3 f4 f5 f6 f8; do row $f; done

echo
echo "################ 3. 抽库（FLOOD_RUSH=16，AI 懂「掐短这一局」）################"
echo "                         后手    先手       X         D      se     建议价"
for f in r0 r6 q4 q6; do row $f; done

echo
echo "################ 4. 诊断口 ################"
echo '〔项目规矩：新机制除了 X，必须有一个「它做了几次」的计数 ——'
echo ' 同色闸那次 bug 下 X 4.89 / 修好 4.88，**只看 X 永远发现不了**。'
echo ' 要盯的是「翻几张」那一列：full 档该**恒等于 CAP**（牌库见底除外）。'
echo
echo ' ⚠ 洪水的诊断只有 `cmdVs` 打，`one` 不打（两者口径一致，'
echo '   见 cmdOne 末尾那句）。所以诊断单独跑：**run-flood-diag.sh**〕'

echo
echo "################ 5. 怎么读 ################"
echo "〔**目标档 +2.7~4.5**（A 槽口径）。四条判读线，按重要性排："
echo
echo " 一、h0 这一格是**基准**：洪水在现行规则档下到底值多少。"
echo "    旧数 +4.71~+5.25 是 10-15 量的，而那之后规则没再动 ——"
echo "    所以 h0 该落在那附近。**落不到就是别的东西变了，先查那个再往下读。**"
echo
echo " 二、D 现在该是 +0.4 上下，不是旧表那个 +3.12（那是旧规则档）。"
echo "    判读线是 **|D| < 2×se**，不是跟基线比。"
echo
echo " 三、同 N 下 full − hit = 「撞上之后接着推」值多少。"
echo "    full 必然更高 —— 要看的是**它换来的结构**（恒 N 张、偶数不翻奇偶）"
echo "    值不值那几分，而不是谁的分高。"
echo
echo " 四、抽库那四格：r0−h0 是 hit 不限档的抽库溢价（旧数 +0.54）。"
echo "    q4−f4 / q6−f6 是 full 档的。**full 档该明显更小** ——"
echo "    每次抽库量恒为 N，而 hit 档撞得晚就抽得多。"
echo "    这一条小下去了，洪水唯一还活着的死因才算治住。"
echo
echo " ⚠ **这些数一格都还没进台账**。进台账要带：规则档 R3、代码状态"
echo "   （10-21 接回原型 + 新加 FLOOD_STOP）、口径 one/A 槽/n=$N。"
echo
echo " ⚠ 源码侧**一行没动** —— 洪水仍然在 DEAD_SKILLS 里。这是模拟器原型。〕"
