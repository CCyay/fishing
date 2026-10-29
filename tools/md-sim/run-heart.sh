#!/usr/bin/env bash
# 2026-10-20 · 用户提案第 1 条（红心万用）和第 4 条（归方）的测量。
#
# ---- 这一轮要回答的问题 ----
#
#   「哪个效果合适」—— 而「合适」是三个条件，不是一个数：
#     ① 净值落在档位里（净值目标 +2.7~4.5。⚠ ~~满配区间 13.17~23.37~~
#        **作废了**，2026-10-28 重跑是 **10.17~27.32** —— 那是 R3 的数，
#        分母不同：每人每局 21.8 → 23.9 分。别拿它判合格）
#     ② ⚠ **这一条作废了** —— 「跟已上架的【串钩】分得开」：
#        **串钩 2026-10-28 定了要撤掉**，这条判据没有对象了
#     ③ 机制真的跑起来了（诊断口，不是光看 X）
#
# ---- 这一套的零点跟以前不一样，而那是有意的 ----
#
# 四张载体卡的常驻技**能被旋钮关掉**（HEART_OFF=1 / DIA_ON 默认 off），
# 所以零点是**同一张卡关掉它** —— 同槽、同插件、同种子、同一次口径。
# 以前要靠「另一张槽一样的卡」当零点（通号人 − 夜钓客），那多一项噪声。
#
# ⚠ 旋钮在【红钩】上架那天（同一天）改过名：
#     HEART_ON=all → 默认（上架件无条件生效，跟 linkOn 一样）
#     HEART_ON=one → HEART_PICK=one
#     HEART_ON=off → HEART_OFF=1（**专门留着**，就为了保住这个零点）
#   本文件已改到新名。**数没变，变的只是命令** —— 台账那边同理。
#
# 顺带这一套把**串钩自己那一格**也补上了：
#   heartman 在 HEART_OFF=1 下就是一张**裸的 2/7/Q**，
#   所以 `rigger − heartman(off)` = 串钩在**上架那三个点数**上的净值。
#   那正是 run-rigger.sh §3 想要的数，而且这个减法比那边干净。
#
# ⚠ 全部 `role` 口径的对手**不带角色**，满配胜率本来就 95~98% ——
#   **胜率一过 95%，增量就不能当强度读**（上一轮在这儿反转过一次结论）。
#   所以 §9 的无天花板复核不是可选项。
set -u
N=${N:-6000}
cd "$(dirname "$0")/../.."

echo "################ 0. 结构 ################"
node tools/md-sim/refs.js 2>&1 | tail -12
echo
node tools/md-sim/check.js 2>&1 | tail -4

echo
echo "################ 1. 三道闸：手算得出来的用例 ################"
# 红钩（默认全响，红心人 2/7/Q 插满 0/1/2）：
#   ♥3  → [0,1,2]  三件全响（3 不在任何槽上，靠「它是 ♥」）
#   ♥2  → [0,1,2]  本来就命中 2 槽，再补齐另外两件
#   ♠3  → []       **闸**：不是 ♥
#   ♥J  → []       **闸**：J 只有通吃 —— 漏了它覆盖面就从 12 变 13
#   ♠7  → [1]      普通命中，不受影响
# 归方（DIA_ON=on，归方人·花色槽 2/7/♦ 插 0/1/2，♦ 槽是第 2 件）：
#   ♠2  → 花色变 ♦ → 命中 2 槽**和** ♦ 槽 = 两件
#   ♠3  → 不变（3 不在点数槽上）
#   ♠J  → 不变（J）
DIA_ON=on node -e '
const R = require("./tools/md-sim/rules.js")
function show(roleKey, picks, cards) {
  const ri = R.roleIndexOf(roleKey)
  if (ri < 0) { console.error("✗ 查不到角色 " + roleKey); process.exit(1) }
  const lo = R.kitFromRole(ri, picks)
  const G = { loadouts: [lo, lo], roles: [] }
  G.roles[R.ME] = ri
  G.roles[R.FOE] = -1
  console.log("  【" + R.DRAW_ROLES[ri].name + "】槽 "
    + R.DRAW_ROLES[ri].slots.join(" / ") + "（" + R.roleCover(ri) + " 张）")
  for (const t of cards) {
    const c = { rank: t[1], suit: t[0], value: 1, extra: [] }
    const mine = R.skillsOf(G, R.ME, c)
    const foe = R.skillsOf(G, R.FOE, { rank: t[1], suit: t[0], value: 1, extra: [] })
    console.log("    " + t[0] + t[1] + "  我方 [" + mine + "]   对手 [" + foe + "]")
  }
}
show("heartman", [0, 1, 2],
  [["♥", "3"], ["♥", "2"], ["♠", "3"], ["♥", "J"], ["♠", "7"]])
console.log("    ↑ ♥3/♥2 该是三件；♠3 和 ♥J 该是空的；♠7 只有它自己那一件")
console.log("    ↑ 对手那一列该跟我方的**普通触发**一样（他不带这件）")
console.log("")
show("diaslot", [0, 1, 2],
  [["♠", "2"], ["♠", "3"], ["♠", "J"], ["♦", "7"]])
console.log("    ↑ ♠2 该是**两件**（2 槽 + 变 ♦ 之后的 ♦ 槽）；♠3 / ♠J 不变")
'

echo
echo "################ 2. 零点：裸的 2/7/Q（HEART_OFF=1）################"
# 这一行是下面所有减法的零点。它跟【串钩手】只差一件常驻技
HEART_OFF=1 node tools/md-sim/sim.js role heartman -n "$N"

echo
echo "################ 3. 【串钩】（已上架）在 2/7/Q 上的净值 ################"
# = 本节 − 第 2 节。这一格以前没量过（+19.33 是 A/5/9 那张载体量的）
node tools/md-sim/sim.js role rigger -n "$N"

echo
echo "################ 4. 提案 1 ·【红钩】全响档（= 上架那一档）################"
# 净值 = 本节 − 第 2 节。
# 件次对照（纯计数）：串钩手 12 张各多 2 件 = 24；红心全响 = 3×2+9×3 = 33
node tools/md-sim/sim.js role heartman -n "$N"

echo
echo "################ 5. 提案 1 ·【红钩】单发档（**下限**，没上架）################"
# AI 没有「选哪一件」的决策口，这儿取下标最小的 —— 真值夹在 4 和 5 之间
HEART_PICK=one node tools/md-sim/sim.js role heartman -n "$N"

echo
echo "################ 6. 提案 1 原案：**自带红心槽**（2/7/♥，21 张）################"
echo "---- 零点：同卡关掉常驻技 ----"
HEART_OFF=1 node tools/md-sim/sim.js role heartslot -n "$N"
echo
echo "---- 开（全响）----"
node tools/md-sim/sim.js role heartslot -n "$N"
echo
echo "⚠ 这两行只能**互相减**。21 张 ≠ 12 张，不能跟第 2~5 节横着比。"
echo "  而「自带红心槽」值多少 = 这一节的零点 − 第 2 节的零点（都是裸卡）。"

echo
echo "################ 7. 提案 4 ·【归方】无 ♦ 槽（光变花色值多少）################"
echo "---- 零点 ----"
node tools/md-sim/sim.js role diaman -n "$N"
echo
echo "---- 开 ----"
DIA_ON=on node tools/md-sim/sim.js role diaman -n "$N"
echo
echo "⚠ 这一格的诊断口要看「真变了几张」那一列，**不是 X** ——"
echo "  这一件不加件次，X 接近 0 是预期之内的，那不等于机制没跑。"

echo
echo "################ 8. 提案 4 的主线：带 ♦ 槽（2/7/♦，21 张）################"
echo "---- 零点 ----"
node tools/md-sim/sim.js role diaslot -n "$N"
echo
echo "---- 开 ----"
DIA_ON=on node tools/md-sim/sim.js role diaslot -n "$N"
echo
echo "⚠ 「多触发的件次」这一列在这一节**必须非零** —— 是 0 的话"
echo "  归方在模拟器里什么也没做，上面那些数全是噪声。"

echo
echo "################ 9. 无天花板复核（胜率过 95% 时这一节才是真的）################"
echo "---- 红钩 · 全响 · 双方同卡、只我方带 ----"
HEART_SIDE=me node tools/md-sim/proto-link.js "$N" --duel heartman heartman
echo
echo "---- 红钩 · 单发 ----"
HEART_PICK=one HEART_SIDE=me node tools/md-sim/proto-link.js "$N" --duel heartman heartman
echo
echo "---- 归方 · 带 ♦ 槽 ----"
DIA_ON=on DIA_SIDE=me node tools/md-sim/proto-link.js "$N" --duel diaslot diaslot
echo
echo "---- 对照：串钩（上架那张）vs 裸的同形卡 ----"
node tools/md-sim/proto-link.js "$N" --duel rigger heartman

echo
echo "################ 10. 基线没被动过 ################"
# base 不带角色，而【归方】默认仍是关的 → 该跟上一轮**逐位相同**。
#（【红钩】上架后对载体卡无条件生效，但那只影响 role / roles 口径）
node tools/md-sim/sim.js base -n "$N"

echo
echo "################ 11. 漂移 ################"
# ⚠ 【红钩】上架之后这一项**本来就会红**（源码侧 skillsOf 多了一段）——
#
# 🔴 这儿原先写着「对完实现之后跑 `--save` 收掉它」—— **那条删了**（2026-10-28）。
#    用户站着的指示：**不要跑 `--save`**。已有 6 个函数在漂移，
#    盖掉就失去「模拟器跟源码哪里分叉了」的唯一凭据。
#    红了要逐条看函数名，确认每一条都是有意改的。
node tools/md-sim/fingerprint.js

echo
echo "################ 跑完：怎么读 ################"
echo "  净值一律是「开 − 关」，而两边是同一张卡、同一批种子。"
echo "    串钩     = §3 − §2"
echo "    红心全响 = §4 − §2      红心单发 = §5 − §2（下限）"
echo "    红心槽   = §6 零点 − §2 零点（两张裸卡的差 = 槽本身值多少）"
echo "    归方     = §7 开 − §7 零点（无 ♦ 槽） / §8 开 − §8 零点（主线）"
echo "  三个条件缺一不可：档位（+2.7~4.5）、跟串钩分得开、诊断口非零。"
