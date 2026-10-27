#!/bin/sh
# 【中毒】族的 **X 口径**〔2026-10-26〕—— `run-poison.sh` 那一批的补课。
#
# ⚠ 为什么非跑这一轮不可：`run-poison.sh` 走的是 `proto-diag.js`，
#   那是**单侧**的数（对手不带、固定庄家先手），跟 `cmdPair` 的 `back` 同类。
#   而目标档位 **X = +2.7 ~ 4.5** 是 X 口径 —— **两者差一个 D，不能相减**。
#   所以那一批的十七格**一格都回答不了「这件够不够档」**。
#
#   绕路的理由当时是真的（`sim.js` 的汇总引着一个已删的 `G.stat.swellflow`，
#   整条 one/all/vs/base 路径崩着），而**同一天修好了**。这就是那条补课。
#
# 口径：`cmdOne` 走 `measureBoth` —— **双方同角色、各插同一个槽、两侧都量**，
#   所以这儿的 X / D **可以直接跟全表（`all`）相减**。槽跟 proto-diag 那批一样
#   （江口闸官 A 槽，`DEFAULT_ROLE='lock'` + `--slot 0` 是默认值），
#   但**两批之间仍然不能相减**（一个 X 一个 back）。
#
# 读数：**定价看 X，平衡看 D**；`|D| < 2×se` 统计上分不开。
#   R4 下「建议价」那一行永远印「待定」—— 现行定价走「按 X 排名套现有价位池」。
cd "$(dirname "$0")/../.." || exit 1
N=${N:-8000}
for k in snow poisonline poisonsuit poisonhue poisonsurge; do
  echo ""
  echo "============== $k =============="
  node tools/md-sim/sim.js one "$k" -n "$N" 2>&1 | sed -n '1,6p'
done
# 【毒手】要跑两档：PHAND_SEEN=1 才是桌面上的样子（对手看得见自己手牌上的毒），
# 关着那一档是**上限**。单侧口径下两者是 +4.54 / +4.78（兑现率 71.3% / 80.4%）。
for seen in 1 0; do
  echo ""
  echo "============== poisonhand (PHAND_SEEN=$seen) =============="
  PHAND_SEEN=$seen node tools/md-sim/sim.js one poisonhand -n "$N" 2>&1 | sed -n '1,6p'
done
