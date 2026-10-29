#!/usr/bin/env bash
# 2026-10-20 ·【串钩】/【串钩手】上架之后的验收。
#
# 改动清单（源码 4 处 + 模拟器 3 处）：
#   draw-skills.uts  SPECIAL_SKILLS 加【串钩】(ranklink) / SP_RANKLINK /
#                    addRankLink / DRAW_ROLES 加【串钩手】/ ROLE_UNLOCK 第 11 格
#   ap-fishing.uvue  skillsOf 里接上（import 两个符号）
#   md-sim/rules.js  DRAW_ROLES 加 rigger（2/7/Q）
#   md-sim/refs.js   SIM_ONLY 撤掉 ranklink，留两张载体
#   md-sim/fingerprint.js  监视名单补 skillsOf
#
# ---- 这一轮要回答的只有一个问题 ----
#
# 上架那张卡的槽是 **2 / 7 / Q**，而 +19.33 是 **A / 5 / 9** 那张载体
#（`linkman`）量出来的 —— 两者**同形状**（3 个单点数槽、12 张覆盖、
# 间距都连不上磁钩），但点数换了。§3 就是量它。
#
# 预期：跟 linkman 同量级。差得多的话说明「点数轴上取哪三档」
# 本身是个强度旋钮，那得单独记一条判据。
set -u
N=${N:-8000}
cd "$(dirname "$0")/../.."

echo "################ 0. 结构：两张表对不对得上 ################"
# refs.js 第 1 项比 key+name。源码新增 ranklink / rigger，
# 模拟器必须同名；而 ranklink 刚从 SIM_ONLY 撤掉，撤漏了这儿会放过
node tools/md-sim/refs.js 2>&1 | tail -12

echo
echo "################ 1. 规则层不变量 ################"
node tools/md-sim/check.js 2>&1 | tail -4

echo
echo "################ 2. addRankLink 那道闸（手算得出来）################"
# 串钩手三个单点数槽 2 / 7 / Q，插满三件 → rankOwner 的 2,7,Q 三格 = 0,1,2
#   2 / 7 / Q  → [0,1,2]  三件全响
#   5          → []       **闸**：5 不在它的槽上（漏了这道闸就是另一件技能）
#   J          → []       J 只通吃
# 对手那一列同时验「按侧」：同一个 G、同一套配装，只有 roles 不同
node -e '
const R = require("./tools/md-sim/rules.js")
const ri = R.roleIndexOf("rigger")
if (ri < 0) { console.error("✗ 模拟器 DRAW_ROLES 里没有 rigger"); process.exit(1) }
const lo = R.kitFromRole(ri, [0, 1, 2])
const G = { loadouts: [lo, lo], roles: [] }
G.roles[R.ME] = ri
G.roles[R.FOE] = -1
const c = function (rank) { return { rank: rank, suit: "♠", value: 1, extra: [] } }
const hit = function (side, rank) { return "[" + R.skillsOf(G, side, c(rank)) + "]" }
console.log("  roleIndexOf(rigger) = " + ri
  + "   覆盖 " + R.roleCover(ri) + " 张   rankOwner = [" + lo.rankOwner.join(",") + "]")
console.log("  2  我方 " + hit(R.ME, "2") + "   对手 " + hit(R.FOE, "2")
  + "   ← 我方该是三件、对手只有一件")
console.log("  7  我方 " + hit(R.ME, "7") + "   Q 我方 " + hit(R.ME, "Q"))
console.log("  5  我方 " + hit(R.ME, "5") + "   ← **必须是空的**（闸：5 不在槽上）")
console.log("  J  我方 " + hit(R.ME, "J") + "   ← 必须是空的（通吃）")
'

echo
echo "################ 3. 【串钩手】的档位（2/7/Q）—— 这一格以前没量过 ################"
# 看三样：X、胜率、诊断行那个**实际倍率**。
#   倍率 ×1.00 = 一次都没发动 → 这一档的数作废，先查 hasSpecial
#   理论值 ×3（三个点数槽）
node tools/md-sim/sim.js role rigger -n "$N"

echo
echo "################ 4. 对照：载体【通号人】（A/5/9，同形状不同点数）################"
# 两行的差 = 「点数轴上取哪三档」值多少。
# 差在标准误两倍以内 → 形状决定一切，+19.33 可以沿用到上架那张卡
node tools/md-sim/sim.js role linkman -n "$N"

echo
echo "---- 无天花板：串钩手 vs 通号人（同槽数、同件数，只差三个点数）----"
node tools/md-sim/proto-link.js "$N" --duel rigger linkman

echo
echo "################ 5. 全表：它在十一张卡里排第几 ################"
# 🔴 **~~现行满配区间 13.17~23.37~~ 作废**（2026-10-28 重跑：**10.17 ~ 27.32**，
#    上架 11 张、n=2000、SE≈0.46）。那是 R3 的数，分母都不一样
#   （每人每局 21.8 → 23.9 分）。**别拿它判「超出就是定档错了」** ——
#    照它判的话串钩手 24.78 是「超出」，而实况是它排第 2、离第 3 名 5.7 分。
#    ⚠ 读这一列还要看行尾有没有 `⚠N 件`：带双装的卡「每槽」那一列
#      是 3 件除以 2 槽，跟别的卡不是同一把尺子。
node tools/md-sim/sim.js roles -n "$N" 2>&1 | tail -20

echo
echo "################ 6. 基线没被动过（源码改了，但模拟器的默认档不该变）################"
node tools/md-sim/sim.js base -n "$N"

echo
echo "################ 7. 漂移 ################"
# ⚠ 这一次**预期会红** —— 源码的 skillsOf 改了，而且它刚进监视名单。
#
# 🔴 这儿原先写着「看完确认只有 skillsOf 这一条，再跑 `--save`」——
#    **那条删了**（2026-10-28）。用户站着的指示：**不要跑 `--save`**。
#    合并那一轮之后已经有 6 个函数在漂移，`--save` 一次就把那 6 笔证据盖掉。
node tools/md-sim/fingerprint.js

echo
echo "################ 跑完 ################"
echo "🔴 第 7 项报红是预期的，**不要跑 \`fingerprint.js --save\` 收掉它** ——"
echo "  已有 6 个函数在漂移，盖掉就失去「模拟器跟源码哪里分叉了」的唯一凭据。"
echo "  要做的是逐条看报出来的函数名，确认每一条都是这一轮有意改的。"
