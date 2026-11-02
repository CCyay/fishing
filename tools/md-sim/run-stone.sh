#!/bin/sh
# 【石化】族六件：分差 + 诊断口〔2026-10-26〕
#
# ⚠ 为什么不走 `sim.js one`：2026-10-26 那天 `sim.js` 的汇总（:353）引着一个
# 已经从 `rules.js` 删掉的 `G.stat.swellflow`（另一条线在删【涌流】【潮流】，
# 删到一半），整条 one/all/vs/base 路径崩着。所以这一轮走 `proto-diag.js`，
# 它不经过那个汇总。**口径因此是单侧的（对手不带、固定庄家先手），不是 X。**
#
# ✅ 同一天那条线删完了，`sim.js base / one / vs` 都通了（九项全过、守恒 52 ✓）。
#    **所以这个绕路的理由已经没了** —— 下一轮要 X 口径的数就直接走 `one`，
#    而这儿跑出来的数仍然是单侧的，**不能跟 X 相减**。
#
# 诊断口也是这一天才接上的：stoneDiag / keyDiag 原先挂 G.stat（全仓没人读），
# 搬到 PROTO_STAT.stone / .matchkey 之后 proto-diag.js 自动能看见。
# **先读 tags 再读分差** —— tags=0 就是毒没贴上，那一格跑的是原版。
cd "$(dirname "$0")/../.." || exit 1
node tools/md-sim/check.js 2>&1 | tail -3
N=${N:-8000}
# 〔2026-10-26：apple / dwarf / kiss 删了（净 +0.28 / +1.73 / +0.22），
#   同一天降自伤那四件（stonethru / stonefade / stonefoe / stonecap）也全删了。
#   墓碑在 rules.js 的 SKILLS 表。剩下三件 + 第二稿两件〕
#
# MODE=band 跑软墙那一档（毒不截断，改成「这一手最多收 STONE_BAND 张」）：
#   STONE_MODE=band sh tools/md-sim/run-stone.sh
# 读数：先看 tags（=0 就是毒没贴上，这一格跑的是原版），
# 再看 **liveSum / tags**（一堵墙平均在堆上活几手 —— 决定「上石」能不能跟「收割」拆成两件）
#
# 第三稿两件〔2026-10-26〕的专属旋钮：
#   SHAND_MODE=block|carry|both  石手：对方打出带石那张时做什么（默认 block）
#   SHAND_SEEN=1                 让对手 AI **看得见**自己手牌上的石（默认关）
#   SSURGE_LAYERS=1|2            石涌：推几层
# 石手读 **handTags / handBlocks** 这两口 —— 贴上了不等于兑现了。
# ⚠ SHAND_SEEN 关着时那个兑现率（80.4%）是**上限** —— AI 不知道那张牌废了，
#   照旧打出去撞上。开着重跑一次，兑现率**必须明显下掉**；掉不下来 = 闸没接上。
for k in none snow stoneline stonesuit stonehue stonehand stonesurge; do
  echo ""
  echo "============== $k =============="
  node tools/md-sim/proto-diag.js "$k" "$N" 2>&1 | tail -12
done
