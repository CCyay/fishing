#!/usr/bin/env bash
# 2026-10-20 · campaign 那一格的两件收尾：**验 no-op** + **补干净的对照**。
#
# 起因：`run-camp-link.sh` 的 §0（默认档）跑出 41.2% / 1.2% / 0.0%，
# 而台账「现行」那一列是 40.6% / 1.1% / 0.0%。差 0.6 点。
#
# 两种可能，**必须分开**：
#   (a) 我 10-20 给 campaign.js 加的那两个开关把默认档改坏了 → 整轮作废；
#   (b) 10-20 这一天的**规则改动**（换水 选1张→任意张，X 0.67→1.74，
#       而 PLAYER_POOL 里正好有 swapcard）→ 台账那一列该标作废、重跑。
# §0 用 `git show HEAD:` 把改动前那份 campaign.js 捞出来跟现在的对跑，
# 两边用**同一份 rules.js** —— 逐位相同就排除 (a)。
set -u
N=${N:-2000}
cd "$(dirname "$0")/../.."
OLD=tools/md-sim/_camp-head.js
trap 'rm -f "$OLD" tools/md-sim/_camp-*-out.txt' EXIT

echo "################ 0. 我的改动是不是 no-op ################"
git show HEAD:tools/md-sim/campaign.js > "$OLD"
node "$OLD" -n "$N" > tools/md-sim/_camp-head-out.txt 2>&1
node tools/md-sim/campaign.js -n "$N" > tools/md-sim/_camp-new-out.txt 2>&1
# 新版多印一行「玩家 · …」（那是故意加的标签行），比对时去掉它
grep -v '^玩家 ·' tools/md-sim/_camp-new-out.txt > tools/md-sim/_camp-new-cmp-out.txt
if diff -u tools/md-sim/_camp-head-out.txt tools/md-sim/_camp-new-cmp-out.txt; then
  echo "✓ 逐位相同 —— 默认档没被动过，0.6 点那个差不是我的改动。"
else
  echo "✗ **有差** —— 两个开关把默认档改坏了，这一轮的 campaign 数全部作废。"
  exit 1
fi

echo
echo "################ 1. 真正的控变量：同一张卡，常驻技 关 vs 开 ################"
# `run-camp-link.sh` 的 §3 拿夜钓客当对照，那是**次优解** ——
# 两色自己值多少在闯关口径下是未知的。这一节换成同一张卡自己对自己：
# 槽、覆盖面、配装件数、rng 起点全同，只差 `hasSpecial` 那一下
for K in linkman night linktwo; do
  echo "---- $K · 常驻技**关**（3 槽 / 2 槽的裸基线）----"
  PLAYER_ROLE=$K node tools/md-sim/campaign.js -n "$N" --quiet \
    > "tools/md-sim/_camp-$K-off-out.txt" 2>&1
  grep -E '^玩家|通关率' "tools/md-sim/_camp-$K-off-out.txt"
done

echo
echo "################ 2. 自查：linkman 和 night 关着的时候该**逐位相同** ################"
# 两张卡的槽标签都是 A/5/9（通号人是照抄夜钓客设计的），常驻技都不生效
# → 两边跑的该是同一局。不同的话说明「槽以外」还有东西在漏，
# 那么第 1 节那两个差就不是常驻技的净值
if diff -u <(grep -v '^玩家 ·' tools/md-sim/_camp-linkman-off-out.txt) \
           <(grep -v '^玩家 ·' tools/md-sim/_camp-night-off-out.txt); then
  echo "✓ 逐位相同 —— 两张卡除了常驻技确实没别的差别。"
else
  echo "✗ **有差** —— 槽以外还有东西在变，第 1 节的减法不合法。"
fi

echo
echo "################ 3. 对账 ################"
echo "开着的那三档在 run-camp-link.sh 里（§2 通号人 49.6/2.8/0.1、"
echo "§3 夜钓客 31.8/0.9/0.0、§4 双槽 21.8/0.6/0.0）。"
echo "净值 = 那边的数 − 上面第 1 节同名那一行。"

echo
echo "################ 跑完 ################"
