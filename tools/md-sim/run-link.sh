#!/usr/bin/env bash
# 2026-10-20 ·【点数互通】原型：「自己点数槽技能可以用其他点数槽的点数牌发动」。
#
# 它是**一·丙那条判据的解药** —— 那条量出来「把同样的覆盖面切成更多份
# 是在削弱它」（背篓渔夫 2 槽 ×8 = +24.85、江口闸官 4 槽 ×4 = +19.95，
# 总覆盖面都是 16 张）。这件常驻技把切分撤销。
#
# ---- 口径：`role`（满配），**不是 `roles`** ----
#
# `roles` 量的是「槽一律空着」的常驻技，而这件技能在空槽下**恒等于 0**
#（一件技能都没插，互通谁去？）—— 照【归深】【两色】那两个先例。
# 所以只有「满配」那一列有意义：`sim.js role <卡> ` 插 KIT_ORDER 前 N 件、
# 对照「完全不带角色」，而那个基线是空配装、**不受 RANK_LINK 影响** ——
# 于是两档的基线逐位相同，减法合法（CLAUDE.md 第二节那条）。
#
# ---- 要看的不是 X，是诊断行最后那个实际倍率 ----
#
# 理论倍率 = 这张卡有几个点数槽。实际倍率必须落在它附近：
#   等于 1.00 → **一次都没互通**，那一档跑的是原版，X 的差全是噪声
#   明显偏低 → `rankOwner[r] >= 0` 那道闸写错了
# （同色闸那次：bug 档 4.89、修好 4.88，单看 X 永远查不出）
set -u
N=${N:-8000}
cd "$(dirname "$0")/../.."

# 十张卡 + 各自的点数槽数（理论倍率）。花色槽不算 —— 它吃不到互通
ROLES="basket:2 lock:4 upstream:2 mirror:1 deepline:1 pond:3 night:3 reckon:3 filler:4 surgeman:2"

echo "################ -1. triggersOf 本身对不对（三张牌，手算得出来）################"
# 江口闸官（A/2/3/4 四个单点数槽）插满四件 → rankOwner 的 A,2,3,4 四格
# 分别是 0,1,2,3。那么：
#   A  关 → [0]（只有自己那个槽）     开 → [0,1,2,3]（四件全响）
#   9  关 → []（9 不在任何槽上）      开 → []（**闸挡住**：没命中被占的点数槽）
#   J  关 → []                        开 → []（J 只有通吃，永不触发）
# 第 9 张那一条是这次最该查的 —— 闸漏了的话「任何点数牌都触发所有技能」，
# 那是另一件技能（而且槽就不存在了）
#
# 互通那段 2026-10-20 从 `triggersOf` 挪进了 `skillsOf`（它要判 side），
# 所以自查也走 `skillsOf` —— 它只读 `G.loadouts[side]`，假 G 就够了。
# `me` 档那两行顺带验「按侧开关」真的分得开：ME 响四件、FOE 响一件
for F in "" 1 me; do
  echo "---- RANK_LINK='$F' ----"
  RANK_LINK=$F node -e '
const R = require("./tools/md-sim/rules.js")
const lo = R.kitFromRole(R.roleIndexOf("lock"), [0, 1, 2, 3])
// `roles` 这一项 2026-10-20 变成**必填** —— `linkOn` 现在先问 `hasSpecial`，
// 而它读 `G.roles[side]`。缺了就是 TypeError（不是悄悄返回 false）
const G = { loadouts: [lo, lo], roles: [-1, -1] }
const c = function (rank) { return { rank: rank, suit: "♠", value: 1, extra: [] } }
const hit = function (side, rank) { return "[" + R.skillsOf(G, side, c(rank)) + "]" }
console.log("  rankOwner = [" + lo.rankOwner.join(",") + "]")
console.log("  A  我方 " + hit(R.ME, "A") + "   对手 " + hit(R.FOE, "A"))
console.log("  9  我方 " + hit(R.ME, "9") + "   ← 两边都必须是空的（闸）")
console.log("  J  我方 " + hit(R.ME, "J") + "   ← 两边都必须是空的（通吃）")
'
done

# ---- 载体卡那条路：**旋钮关着也要发动**〔2026-10-20 加〕 ----
#
# `linkOn` 现在有两个来源（`hasSpecial` 和旋钮），而第一个是常驻技的正路。
# 这四行查的就是那条路：RANK_LINK 空着、只靠 `G.roles[ME]` 带这张卡。
#   A / 5 / 9  我方 → [0,1,2]（三件全响）   对手（不带角色）→ 只有自己那个槽
#   3          两边都空（**闸**：3 不在通号人的槽上）
# 对手那一列同时验「按侧」：同一个 G、同一套配装，只有 roles 不同
echo "---- 载体卡【通号人】（RANK_LINK 关着，靠 hasSpecial）----"
node -e '
const R = require("./tools/md-sim/rules.js")
const li = R.roleIndexOf("linkman")
const lo = R.kitFromRole(li, [0, 1, 2])
const G = { loadouts: [lo, lo], roles: [], }
G.roles[R.ME] = li
G.roles[R.FOE] = -1
const c = function (rank) { return { rank: rank, suit: "♠", value: 1, extra: [] } }
const hit = function (side, rank) { return "[" + R.skillsOf(G, side, c(rank)) + "]" }
console.log("  roleIndexOf(linkman) = " + li
  + "   rankOwner = [" + lo.rankOwner.join(",") + "]")
console.log("  A  我方 " + hit(R.ME, "A") + "   对手 " + hit(R.FOE, "A")
  + "   ← 我方该是三件、对手只有一件")
console.log("  9  我方 " + hit(R.ME, "9") + "   对手 " + hit(R.FOE, "9"))
console.log("  3  我方 " + hit(R.ME, "3") + "   ← 必须是空的（闸：3 不在槽上）")
console.log("  J  我方 " + hit(R.ME, "J") + "   ← 必须是空的（通吃）")
'

echo
echo "################ 0. 旋钮关着的时候什么都没动 ################"
echo "---- check / refs ----"
node tools/md-sim/check.js 2>&1 | tail -4
node tools/md-sim/refs.js 2>&1 | tail -6
echo "---- base（RANK_LINK 不开，该跟上一轮逐位相同）----"
node tools/md-sim/sim.js base -n "$N"
echo "---- base（RANK_LINK=1，**也该逐位相同**：base 不带角色、配装全空）----"
RANK_LINK=1 node tools/md-sim/sim.js base -n "$N"

echo
echo "################ 1. 十张卡各自的满配：关 vs 开 ################"
for pair in $ROLES; do
  key=${pair%%:*}
  mult=${pair##*:}
  echo
  echo "======== $key（$mult 个点数槽 → 理论倍率 ×$mult）========"
  echo "-------- RANK_LINK=0（现行）--------"
  node tools/md-sim/sim.js role "$key" -n "$N" | sed -n '/对照/,/胜率/p'
  echo "-------- RANK_LINK=1（带这件常驻技）--------"
  RANK_LINK=1 node tools/md-sim/sim.js role "$key" -n "$N" \
    | sed -n '/对照/,$p' | grep -v '^  槽里插的是'
done

echo
echo "################ 1.5 无天花板口径：双方同角色同满配，只我方带 ################"
# 上面第 1 节撞天花板了（胜率 99.6~99.8%）。这一节双方同配装，
# 分差回到 0 附近 —— **「×4 到底比 ×2 强多少」只有这一节答得了**。
#
# 〔2026-10-20 实测：第 1 节读出的「严重饱和」**全是天花板** ——
#   江口闸官同一张卡在那边 +6.35、在这边 +10.32，而 ×4 是 ×2 的 2.11 倍，
#   几乎线性。判法记在台账：**满配口径下胜率一过 95%，增量就不能当强度读**〕
RANK_LINK=me node tools/md-sim/proto-link.js "$N"

echo
echo "################ 2. 载体卡：量这件技能**自己**的档位 ################"
# 上面两节全是「给一张**现成的**卡加上这件」，于是数里混着那张卡本来的
# 常驻技（填河工的净滩、江口闸官的窄口…）。这一节换成只带这一件的载体卡。
#
# 【通号人】的槽**故意照抄【夜钓客】**（A/5/9，12 张）—— 于是
#   role  两行相减 = 互通 − 两色（都带天花板，但口径相同）
#   duel  两张正面对打 = 同一个差，**没有天花板**
# 两条路该给出一致的符号；不一致的话先怀疑天花板那一侧。
#
# 〔2026-10-20 实测：**两条对上了** —— 19.33 − 13.17 = 6.16 vs duel 6.15。
#   上一轮那个天花板这次没咬，因为胜率只到 96.4%（不是 99.6%）。
#
#   ⚠ 而夜钓客那一行**能当中性对照是查实现查出来的**：【两色】只经
#   `sameSuit` 的五处调用生效，而这套满配（传火/引火/对换）一件都不走
#   那条路 → 它的常驻技在这儿恰好值 0。所以 6.16 是互通的**净值**，
#   不是「互通 − 两色」。这条对整张 role 表都成立，而只验了这一张〕
echo
echo "======== 通号人（A/5/9，12 张）——【夜钓客】的同槽对照 ========"
node tools/md-sim/sim.js role linkman -n "$N"
echo
echo "======== 夜钓客（同槽，常驻技是【两色】）========"
node tools/md-sim/sim.js role night -n "$N"
echo
echo "======== 通号人·双槽（A/5，8 张）—— 纯覆盖面那条线 ========"
node tools/md-sim/sim.js role linktwo -n "$N"
echo
echo "---- 无天花板：通号人 vs 夜钓客（同槽、同插件，只差常驻技）----"
node tools/md-sim/proto-link.js "$N" --duel linkman night
echo
echo "---- 顺带：通号人 vs 通号人·双槽（同一件技能，12 张 vs 8 张）----"
# ⚠ 槽数不同（3 vs 2）→ 插的件数也不同，脚本会印警告。
# 它量的是「3 槽卡 − 2 槽卡」整体，**不是覆盖面那一项的净值**
node tools/md-sim/proto-link.js "$N" --duel linkman linktwo

echo
echo "################ 3. 源码有没有漂（只动了模拟器，该全绿）################"
node tools/md-sim/fingerprint.js

echo
echo "################ 跑完 ################"
