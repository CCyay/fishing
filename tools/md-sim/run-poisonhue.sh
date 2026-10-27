#!/bin/sh
# 【毒影】改接真·【花色匹配】之后的重量〔2026-10-26〕
#
# ⚠ 为什么重量：旧的 +4.27（proto-diag 单侧）/ +4.36（X）量的**不是这件技能**。
#   原型发的钥匙是 `G.suitKey` —— 一条**连续**花色线（收整段、无门槛、点数照留），
#   而游戏里的【花色匹配】（`draw-terms.uts:682`）是**间隔匹配**、**至少 2 张**、
#   **打出后整堆无点数**，三句全不一样。源码侧那条连续线 2026-10-25 已经撤了
#  （`ap-fishing.uvue:3152` `const suited = false`）—— 原型靠的那条线游戏里没有。
#   所以这一轮换成 `G.matchKey` → `suitMatchFor`（现成入口），重新量一张矩阵。
#
# 口径：`cmdOne` 走 `measureBoth` —— **双方同角色、各插同一个槽、两侧都量**，
#   报的是 **X**（两侧平均）和 **D**（两侧之差的一半）。
#   槽 = 江口闸官 A 槽（`DEFAULT_ROLE='lock'` + `--slot 0`，都是默认值），不带常驻技。
#   **这一批可以直接跟全表（`all`）相减；跟 `run-poison.sh` 那批单侧 `back` 不能。**
#
# ⚠ **读数顺序是硬规矩**：先 `used`（钥匙那张真打出去几次）
#   → 再 `hits/used`（成功率；低 = 堆上同花色凑不够 2 张，撞『条件撞局面常量』）
#   → 再 `selfBlocks/blocks`（自伤）→ **最后才看分**。
#   兑现率塌了的话分是多少都不重要，该回去改形状，不是改价。
#
# ⚠ R4 专属：`keptScore` 才是墙的伤害口，`kept`（张数）在阶梯计分下不再等价 ——
#   6 张截成 2 张掉 11 分，5 张截成 4 张掉 0 分。两个一起读。
cd "$(dirname "$0")/../.." || exit 1
N=${N:-20000}

run() {                       # run <标题> <环境前缀…> -- <额外参数…>
  echo ""
  echo "============== $1 =============="
  shift
  env "$@" node tools/md-sim/sim.js one poisonhue -n "$N" 2>&1 | sed -n '1,8p'
}

# ① 主案 —— 真·【花色匹配】。这是「这件技能现在值几分」
run "① 主案（HUE_KEY=match，默认）" HUE_KEY=match
# ② 只钥匙不贴毒 —— 「毒」那一半
run "② 只钥匙不贴毒（KEY_NOPOISON=1）" HUE_KEY=match KEY_NOPOISON=1
# ③ 只贴毒不发钥匙 —— 「钥匙」那一半。
#    ⚠ ②+③ ≠ ①：这一族靠交互活着（毒涌那一轮实测交互项 +2.81，比两个主效应都大）
run "③ 只毒不发钥匙（HUE_KEY=none）" HUE_KEY=none
# ④ 旧的假钥匙 —— 复现旧数，坐实「换关键词换掉了多少」。
#    这一格对不上旧数 = 改动漏到了对照档上，整批作废
run "④ 旧连续花色线（HUE_KEY=suit）" HUE_KEY=suit
# ⑤ 门槛放到 1 张 —— 『条件撞局面常量』那条死因的直接对照（堆常年 2.82~5 张）
run "⑤ 门槛 1 张（SM_MIN=1）" HUE_KEY=match SM_MIN=1
# ⑥ 不变无点数 —— 词条末句「打出后整堆无点数」的价钱
run "⑥ 不变无点数（SM_VOID=0）" HUE_KEY=match SM_VOID=0

# ⑦ 花色槽（次要）。⚠ **混着覆盖面** —— ♥ 槽 13 张 vs A 槽 4 张，
#    所以这一格量的是「槽型 × 覆盖面」两样，**只当方向读，别拿去减**。
#    镜湖占卜师的常驻技不带（`one` 默认不带 special）。
echo ""
echo "============== ⑦ 花色槽（mirror ♥，混着覆盖面） =============="
node tools/md-sim/sim.js one poisonhue --role mirror --slot 0 -n "$N" 2>&1 | sed -n '1,8p'

# 定价锚：必须**跟主案同一批**。上一轮跨批取锚差了 0.13
#（摘钩表里 +4.24、同版重跑 +4.37），那个差够把一件技能挪一个价位
for k in flow unhook; do
  echo ""
  echo "============== 锚 $k（同批） =============="
  node tools/md-sim/sim.js one "$k" -n "$N" 2>&1 | sed -n '1,6p'
done
