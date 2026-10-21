#!/usr/bin/env bash
# 2026-10-21 · 【洪水】定稿形状重量 —— **上一张 N 矩阵作废之后的那一跑**
#
# ---- 为什么要重跑 ----
#
# 用户的原话是「**一张张翻，匹配到就是自己的**」，而我先实现成了
# 「翻完 4 张、只按**最深**那次命中收**一段**」（`FLOOD_STOP=full`）。
# 那是两件不同的技能：
#
#   full  一次发动**只收一次**；
#   each  撞上**当场**收，收完堆短一截、接着翻 —— **一次发动能收好几次**。
#
# 所以 `full` 档那张 N 矩阵（X +3.28 / D +0.22 / 价 95）**全废**，
# 这一跑是它的替代。`hit` 那一列**没废**（那是老洪水的对照组）。
#
# ---- 这一跑要回答三件事 ----
#
#   ① 定稿形状下 N=2..6 各是多少 —— 价由 sim.js 自己按锚 25 + X×21 给；
#   ② each 比 full 强多少（同 N 相减）—— 那就是「能收好几次」的价值；
#   ③ `收几次` —— 这是**机制诊断口**，不是 X。each 要是跟同 N 的 full
#      齐平，说明「当场收」那条分支一次都没多收，each 退化成了 full，
#      上面两问都没意义。
#      〔照 CLAUDE.md 第四节：新机制必须配一个「它做了几次」的计数，
#        同色闸那次 bug 下 X 4.89 / 修好 4.88，只看 X 永远发现不了〕
#      ⚠ **这儿原先写的是「要 > 1.00」，那条判据是错的。**
#        这一列按**发动次数**平均，而一次发动经常一次都撞不上；
#        full 档 hits ∈ {0,1}，它这一列是「至少撞一次的概率」，
#        天然 ≤ 1.00。实测 each N=2..5 都在 1.00 以下，却全都比同 N 的
#        full 多收。**诊断口要配对照组，不是配阈值** —— 所以这一版
#        每个 N 多跑一条 full 的 `vs` 当对照。
#
# ---- awk 的取数位置是**对着 cmdOne 的实现**定的，不是猜的 ----
#
# `sim.js:648` 那一行把四个数打在**同一行**上：
#
#   「  后手 +1.23   先手 +2.34   X +3.00   D +0.22   标准误 0.12」
#      $1   $2       $3   $4      $5 $6     $7 $8     $9      $10
#
# 所以 X 是 **$6**、D 是 **$8**。
#〔上一版这里写的是「X 和 D 各占一行、取 $2」—— 那是我没查实现编的，
#  会抓到空值。CLAUDE.md 开头那条：真相在实现那一层〕
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

for n in 2 3 4 5 6; do
  ( FLOOD_STOP=each FLOOD_CAP=$n node tools/md-sim/sim.js one flood \
      -n "$N" --role lock --slot 0 >"$TMP/e$n" 2>&1 ) &
  ( FLOOD_STOP=full FLOOD_CAP=$n node tools/md-sim/sim.js one flood \
      -n "$N" --role lock --slot 0 >"$TMP/f$n" 2>&1 ) &
  # ---- 诊断口要另跑一条 `vs`〔2026-10-21 查出来的〕 ----
  #
  # **洪水那张诊断表挂在 `cmdVs` 里，`cmdOne` 不印它**（sim.js:1515 那段
  # 整个在 cmdVs 的函数体内，cmdOne 641–672 行就结束了）。
  # 第一版这儿只跑 `one`，于是 §③ 印出来是**五个空标题** ——
  # 看着像「没发动过」，其实是取数的命令根本不输出它。
  #
  # 口径不用担心：CLAUDE.md 第二节 + cmdOne 自己那句话 ——
  # `one X Y` 和 `vs X X` 双方同角色同槽、两侧都量，**逐位相同**。
  # 所以 X/D 继续从 `one` 取，这条只拿它的诊断表
  ( FLOOD_STOP=each FLOOD_CAP=$n node tools/md-sim/sim.js vs flood flood \
      -n "$N" --role lock --slot 0 >"$TMP/d$n" 2>&1 ) &
  # full 侧的诊断是**对照组**，不是附赠的 —— 见 §③ 抬头那段：
  # 「收几次」没有绝对阈值，只能同 N 对比
  ( FLOOD_STOP=full FLOOD_CAP=$n node tools/md-sim/sim.js vs flood flood \
      -n "$N" --role lock --slot 0 >"$TMP/g$n" 2>&1 ) &
done
wait

# 从一份 cmdOne 输出里取第 k 个数：1=后手 2=先手 3=X 4=D 5=标准误
num() { awk -v k="$2" '/^ *后手 .* X .* D /{print $(2*k); exit}' "$1"; }

echo "################ ③ 机制诊断口：一次发动收了几次 ################"
echo "〔**先看这一节再看下面的 X。**"
echo "  ⚠ **别拿 1.00 当分界线** —— 这一列按发动次数平均，而一次发动经常"
echo "  一次都撞不上。full 档 hits ∈ {0,1}，它这一列是「至少撞一次的概率」，"
echo "  天然 ≤ 1.00；each 的是「期望撞几次」。两个都能小于 1。"
echo "  **要看的是下面那张 each vs full 的对比表** —— each 高出的那一截"
echo "  才是「撞上当场收」多做的功，相等就是退化了。"
echo "  〔原先这儿写的就是「要 > 1.00」，而实测 N=2..5 全在 1.00 以下、"
echo "    却全都比同 N 的 full 多收 —— 诊断口要配对照组，不是配阈值〕〕"

# 把 `收几次` 从一份 vs 输出里抠出来。**位置是对着真输出数的，不是推的** ——
# 「次/局」那个单位自己占一个字段，所以列号跟表头对不上：
#
#   「    后手（我）         1.45 次/局      2.73     5.23     1.14     4.63     23.0%」
#     $1=后手（我） $2=发动次数 $3=次/局 $4=堆厚 $5=翻几张 $6=收几次 $7=收几张 $8=空堆
#
# 所以**收几次是 $6**。〔第一版写的 $5 是数表头数出来的 —— 那会抓到「翻几张」，
#  而它跟「收几次」量级相近，错了也看不出来〕
hits() { awk '/^ *后手（我）/{print $6; exit}' "$1"; }

echo
echo "    N    each 收几次   full 收几次   each 多收"
for n in 2 3 4 5 6; do
  eh=$(hits "$TMP/d$n"); fh=$(hits "$TMP/g$n")
  if [ -z "${eh:-}" ] || [ -z "${fh:-}" ]; then
    echo "    $n    ⚠ 没抓到"
    continue
  fi
  awk -v N="$n" -v E="$eh" -v F="$fh" 'BEGIN{
    printf "   %2s %11.2f %13.2f %11.2f%s\n", N, E, F, E-F,
      (E-F > 0.005 ? "   ✅ 当场收生效" : "   ⚠ 跟 full 齐平 = 退化")
  }'
done

for n in 2 3 4 5 6; do
  echo
  echo "---- N=$n（each · 原文）----"
  # 区间的收尾取**最后那句**（「X 量的是另一件技能」），不是它上一句 ——
  # 取上一句的话两行判读说明只印得出一行。
  # 源文件是 `d$n`（那条 `vs`），**不是 `e$n`** —— 见上面那段
  got=$(awk '/发动次数   发动时堆厚/,/量的是另一件技能/' "$TMP/d$n")
  if [ -z "$got" ]; then
    echo "  ⚠ 没抓到诊断表 —— 下面贴 d$n 的原文"
    cat "$TMP/d$n"
  else
    echo "$got"
  fi
done

echo
echo "################ ① 定稿（each）vs 对照（full） ################"
echo "    N    each X    each D    full X    full D     each−full"
for n in 2 3 4 5 6; do
  ex=$(num "$TMP/e$n" 3); ed=$(num "$TMP/e$n" 4)
  fx=$(num "$TMP/f$n" 3); fd=$(num "$TMP/f$n" 4)
  if [ -z "${ex:-}" ] || [ -z "${fx:-}" ]; then
    echo "    $n    ⚠ 没抓到数 —— 下面贴 e$n 的原文"
    cat "$TMP/e$n"
    continue
  fi
  awk -v N="$n" -v EX="$ex" -v ED="$ed" -v FX="$fx" -v FD="$fd" 'BEGIN{
    printf "   %2s %9.2f %9.2f %9.2f %9.2f %11.2f\n", N, EX, ED, FX, FD, EX-FX
  }'
done

echo
echo "################ ② 定价（sim.js 自己给的建议价） ################"
echo "〔档口 X = +2.7~4.5。锚是 25 + X×21 取 5 的整数倍，由 sim.js 算，"
echo "  这里不自己再算一遍 —— 两处口径分叉过一次就再也对不上〕"
for n in 2 3 4 5 6; do
  ex=$(num "$TMP/e$n" 3)
  [ -z "${ex:-}" ] && continue
  p=$(awk '/^ *建议价：/{sub(/^ +/, ""); print; exit}' "$TMP/e$n")
  awk -v N="$n" -v X="$ex" -v P="$p" 'BEGIN{
    printf "   N=%s  X=%.2f  %s%s\n", N, X, P,
      (X < 2.7 ? "   ⚠ 低于档下沿 2.7" : (X > 4.5 ? "   ⚠ 高于档上沿 4.5" : "   ✅ 在档内"))
  }'
done

echo
echo "################ 原文（N=4，用户指定的那一档） ################"
cat "$TMP/e4"
