#!/usr/bin/env bash
# 2026-10-20 ·【涨水】第二轮：把上一轮没验的三样补上。
#
# 上一轮的结论：`SWELL_N=13` 配【齐顶】协同 **+1.00**、两件 **4.29**
#（齐顶单带 3.43）—— 这一季第一个「加上它反而更强」的组合。
#
# 没验的三样，而且每一样都可能推翻它：
#   ① 组合的 **D**（造障碍类最容易偏先后手，而 pair 不报 D）
#   ② **对手也有钥匙**时还成不成立（pair 的对手是空装，
#      而「只有我有钥匙」正是它的卖点）
#   ③ N=13 的**代价表**（N=7 那张显示：我 −0.61、对手 +0.32、和 −0.29，
#      也就是说它在喂分）
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 检查 ################"
node tools/md-sim/refs.js 2>&1 | head -3
node tools/md-sim/check.js 2>&1 | tail -3

echo
echo "######## ① 涨水单带 · N=13 · 完整输出（D + 代价表） ########"
SWELL_N=13 node tools/md-sim/sim.js vs swell swell -n "$N"

echo
echo "######## ② 对手也有钥匙：我造障碍 vs 他带齐顶 ########"
# 这是这一件的**生死格**。「对称地造障碍 + 只有我有钥匙」里，
# 「只有我有」那一半在对手也带齐顶时整个没了 ——
# 而障碍是对称的，所以那时它应该直接变成负资产。
# 照寒流 / 霜降那条先例：**霜降就是因为「障碍对称、钥匙也对称」被删的**
echo "---- 我带涨水 vs 对手带齐顶 ----"
SWELL_N=13 node tools/md-sim/sim.js vs swell peak -n "$N" | sed -n '1,14p'
echo "---- 反过来：我带齐顶 vs 对手带涨水 ----"
SWELL_N=13 node tools/md-sim/sim.js vs peak swell -n "$N" | sed -n '1,14p'

echo
echo "######## ③ N 在 13 附近扫（13 已经 100% 出界，再大还有用吗） ########"
# 点数「往上不设限」，所以 N 可以 >13。但 13 已经让 A（最小的 1）出界，
# 再大只是把点数推得更高 —— **除非它改变了顺子 / 磁钩够不够得着**
for n in 11 13 16 20; do
  echo "---- SWELL_N=$n · 配齐顶 ----"
  SWELL_N=$n node tools/md-sim/sim.js pair swell peak -n "$N" | sed -n '3,8p'
done

echo
echo "######## ④ 另两条「不看点数」的收割线 · N=13 ########"
# 收色 / 顺色按花色，完全不受出界影响 —— 所以它们拿到的是**纯加厚收益**。
# 跟齐顶比，能分出「协同里有多少来自加厚、多少来自『只有我够得着』」
echo "---- 涨水 × 收色 ----"
SWELL_N=13 node tools/md-sim/sim.js pair swell hue -n "$N" | sed -n '3,8p'
echo "---- 涨水 × 顺色 ----"
SWELL_N=13 node tools/md-sim/sim.js pair swell suited -n "$N" | sed -n '3,8p'
echo "---- 涨水 × 伏流（顺子 14-15-16 连得上） ----"
SWELL_N=13 node tools/md-sim/sim.js pair swell flow -n "$N" | sed -n '3,8p'

echo
echo "################ 跑完 ################"
