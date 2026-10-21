#!/usr/bin/env bash
# 2026-10-21 ·【拢水】第四轮：**资源来源从「堆上其他牌」换成「牌库 2 张」**〔用户改〕，
# 并 A/B **落堆底**〔用户要求〕。
#
# 设计现在是四句 + 一个待量的第五句：
#   通配、无点数、保护、将**牌组 2 张牌**叠放到它下面（N 张 N 层）
#   〔待量〕落堆底
#
# ⚠ 这一轮**换了基准**，所以前三轮的拢水数全部只能当「另一个设计的数」读，
#   不能跟这一轮相减。作废清单（都是 20000 局 · 江口闸官 A 槽 · R3）：
#     收堆上全部 + 无点数  −0.07   配伏流 +4.43 / 涉水 +3.92 / 易流 +4.28
#     收堆上全部 + 带点数  −2.34   配伏流 +2.29
#     收堆上 1 张 + 无点数 −0.64
#     收堆上 1 张 + 带点数 −1.17
#   这几格靠 `STOW_SRC=pile` 还跑得出来，但**它们量的是另一件技能**。
#
# ⚠ 为什么「无点数值 +2.27」这条结论**不能挪过来**：那 +2.27 买的是
#   「发动后堆上只剩它一张 → 全场唯一靶子」那个死因，而 `deck` 档堆根本不动,
#   那个死因自己就没了。所以这一轮 `STOW_VOID` 必须**重量**，四格全扫。
#
# ⚠ 落堆底这一条在上一版里是**空操作**（cleared/fires=85.7%，它本来就是堆底),
#   这一版才有意义。但**别从寒流的 +1.12 推** —— 那条的前提是私有效果，
#   而拢水锁住的牌是双方都拿不到的（霜降加同样两句是 −2.86）。
#
# 这一轮要盯的三样（不是一个 X）：
#   局面长度   牌库被抽走 2×fires 张，而**牌库张数 = 局长**（CLAUDE.md 陷阱①）。
#              回合数要是明显掉了，X 那个数就带着「局面缩短」的偏，得换口径读
#   双方得分的「和」  那 2 张变成盾之后，剥不完的部分谁也拿不到
#   atBottom/fires  落堆底的**接线验证口**：=1 档该贴 100%，=0 档该明显低
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -4
# 守恒这次换了形状：牌从 G.deck 挪进 G.stacked，两个都在 check.js 的桶里。
# 漏的话会报「局首牌库 N 张、总数 …」或者「叠放的宿主不在堆上了」
echo "---- 凝水（没动【保护】，必须还是 0.51） ----"
node tools/md-sim/sim.js vs calm calm -n "$N" | sed -n '3,6p'
# ⚠ **这两件必须验**：我往 playFor 的 `sink` 表达式里加了一项 stowSink，
#   而【满篓】【窄口】的落堆底（HELD_SINK）走的是**同一个表达式**。
#   写坏了它们会静默退化（照 CLAUDE.md 那条同色闸：bug 下 4.89、修好 4.88）。
#   〔那个表达式还有两项验不了：`iceSink` 的载体【寒流】已删（SK_GONE），
#     `wantReverse` 要庄家特殊技 SP.REVERSE，`vs` 插的是槽技能，碰不到它〕
echo "---- 满篓（HELD_SINK 走同一个 sink 表达式） ----"
node tools/md-sim/sim.js vs creel creel -n "$N" | sed -n '3,6p'
echo "---- 窄口（同上） ----"
node tools/md-sim/sim.js vs narrow narrow -n "$N" | sed -n '3,6p'
# 无点数那条链也被碰了（加了一段注释 + STOW_VOID 那一项），顺手验伏流
echo "---- 伏流（FLOW_VOID 默认关） ----"
node tools/md-sim/sim.js vs flow flow -n "$N" | sed -n '3,6p'

echo
echo "################ 1. 四格全扫：落堆底 × 无点数 ################"
# 一次把矩阵量全，不边推边量（CLAUDE.md：顺子族那轮五层推算层层错）
echo "---- 甲 = 用户的设计原文：落堆顶 + 无点数（默认档） ----"
node tools/md-sim/sim.js vs stow stow -n "$N"
echo
echo "---- 乙 = 落堆底 + 无点数（待量的第五句） ----"
STOW_SINK=1 node tools/md-sim/sim.js vs stow stow -n "$N"
echo
echo "---- 丙 = 落堆顶 + 带点数（看无点数在这一档值多少） ----"
STOW_VOID=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'
echo "---- 丁 = 落堆底 + 带点数（四格的第四格，验交互） ----"
STOW_SINK=1 STOW_VOID=0 node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '3,8p'

echo
echo "################ 2. 配兑现口（通配那一半只在这儿兑现） ################"
# 拢水自己没有【顺子匹配】，所以【通配】那一句单带是零兑现
for mate in flow wade swapflow; do
  echo "---- 拢水 + $mate · 落堆顶 ----"
  node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '1,8p'
  echo "---- 拢水 + $mate · 落堆底 ----"
  STOW_SINK=1 node tools/md-sim/sim.js pair stow "$mate" -n "$N" | sed -n '3,8p'
done

echo
echo "################ 3. 诊断口 ################"
# 这一档该读的是：
#   drawn == stowed        真从牌库 pop 出来几张 == 叠上去几张（不等就是丢牌了）
#   stowed/fires == 2.0    用户定的 STOW_N=2，低于 2 就是 deckDry 在拖
#   deckDry/fires          牌库不够 2 张的比率。贴着 fires 就说明这件技能
#                          几乎只在牌库见底时发动 → X 得换个读法
#   atBottom/fires         落堆底的接线验证口（见上面那段）
#   stowed − (mine+foe)    叠上去却**没人剥完**的张数 = 死在堆底那几分
echo "---- 甲：落堆顶 + 无点数（默认档） ----"
node tools/md-sim/proto-diag.js stow 6000
echo "---- 乙：落堆底 + 无点数 ----"
STOW_SINK=1 node tools/md-sim/proto-diag.js stow 6000
echo "---- 丙：落堆顶 + 带点数 ----"
STOW_VOID=0 node tools/md-sim/proto-diag.js stow 6000
echo "---- 丁：落堆底 + 带点数 ----"
STOW_SINK=1 STOW_VOID=0 node tools/md-sim/proto-diag.js stow 6000

echo
echo "################ 跑完 ################"
