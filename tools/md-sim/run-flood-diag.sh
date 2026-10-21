#!/usr/bin/env bash
# 2026-10-21 · 洪水矩阵的**诊断口**（配 run-flood.sh 一起读）
#
# 洪水的诊断只有 `cmdVs` 打，`one` 不打 —— 而两者口径一致
#（cmdOne 末尾自己写着「口径跟 all 一致，可以直接跟全表比」，
#  实测 `one freeze` 和 `vs freeze freeze` 逐位相同）。所以分开跑。
#
# ---- 这一跑要回答三个问题，第三个是主跑抛出来的反常 ----
#
#   一、**full 档真翻了 CAP 张吗**（「翻几张」那一列该恒等于 CAP）。
#      不等于 = 循环的闸写错了，而那种错**只看 X 发现不了**
#     （同色闸那次 bug 下 4.89 / 修好 4.88）。
#   二、hit 档各 CAP 下**平均真翻几张** —— 它解释 X 为什么那样涨。
#   三、**full·6 的抽库溢价 +0.99 比 hit·不限的 +0.57 还大**，
#      而我跑之前预期是「full 该明显更小」。诊断要验的假设是：
#      **抽库溢价只跟「每次真抽几张」有关，跟 hit/full 这个形状无关** ——
#      full 保证抽满 CAP 张，hit 撞上就停、平均抽得少。
#      对的话「翻几张」那一列就能把三格的溢价排出同一个序。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

cell() {
  local f="$1"; shift
  local label="$1"; shift
  ( env "$@" node tools/md-sim/sim.js vs flood flood -n "$N" \
      --role lock --slot 0 >"$TMP/$f" 2>&1
    echo "$label" >"$TMP/$f.label" ) &
}

show() {
  local f="$1"
  echo
  echo "======== $(cat "$TMP/$f.label" 2>/dev/null || echo "$f") ========"
  if grep -q 'Error' "$TMP/$f" 2>/dev/null; then
    grep -m1 'Error' "$TMP/$f"; return
  fi
  sed -n '/诊断：它每次发动时的局面/,/自己抢自己/p' "$TMP/$f"
}

cell h0 'hit · 不限'   FLOOD_STOP=hit  FLOOD_CAP=0
cell h5 'hit · 5 张'   FLOOD_STOP=hit  FLOOD_CAP=5
cell h6 'hit · 6 张'   FLOOD_STOP=hit  FLOOD_CAP=6
cell h8 'hit · 8 张'   FLOOD_STOP=hit  FLOOD_CAP=8
wait
cell f4 'full · 4 张'  FLOOD_STOP=full FLOOD_CAP=4
cell f6 'full · 6 张'  FLOOD_STOP=full FLOOD_CAP=6
cell r0 'hit·不限 +抽库'  FLOOD_STOP=hit  FLOOD_CAP=0 FLOOD_RUSH=16
cell q6 'full·6 张 +抽库' FLOOD_STOP=full FLOOD_CAP=6 FLOOD_RUSH=16
wait

for f in h0 h5 h6 h8 f4 f6 r0 q6; do show $f; done

echo
echo "################ 怎么读 ################"
echo '〔一、「翻几张」那一列：full 档**该恒等于 CAP**。'
echo '    小于 CAP 只有一个合法解释 —— 牌库见底（局末那几手）。'
echo '    差得多就是闸写错了，**X 看着再合理也不能用**。'
echo
echo ' 二、「发动时堆厚」含它自己，1.00 = 空堆开局那一手。'
echo '    旧的定位结论是：先手的优势不是「能翻更多」，是**独占了一个'
echo '    机会成本为 0 的时机**（空堆上打任何牌都钓不到）。'
echo '    所以「其中空堆」那一列两侧的差，才是 D 的来源。'
echo
echo ' 三、「自己的饵」那一列是**净增益为 0** 的部分（自己抢自己）。'
echo '    full 档推得多、堆更厚，这一列该跟着涨 —— 涨得越多，'
echo '    它那个高 X 里的**水分**就越大。'
echo
echo ' 四、抽库三格（r0 / f6 / q6）比「翻几张」：如果溢价的序跟'
echo '    「每次真抽几张」的序一致，那就证实了「抽库溢价跟形状无关、'
echo '    只跟抽库量有关」—— 那条比洪水本身值钱，因为它适用于'
echo '    **任何动牌库的效果**。〕'
