#!/bin/sh
# ---- 【21 匹配】这条线：四个已实现候选 + 一个新开的格子〔2026-10-26〕----
#
# 起因：用户「设计几件分数合格的 21 匹配相关技能」。
# 而查下来**这条线的候选件早就实现成旋钮了**（2026-10-19 / 10-21 立的），
# 只是从没量过 —— 所以这一轮先量它们，不是再想新的。
#
# ---- 载体为什么是【递吃】tagdraft，而不是上架的【零递】----
#
# 四个旋钮全挂在 `hasDraftLine(skills, G, card)` 上，而
# **2026-10-25【吃水】删了** —— 那几条注释里写的 `vs draft draft` 全部失效
#（`skillIndexOf` → −1，`skAt` 只记一笔警告**不抛**，命令照跑、量的是空载体）。
#
# 换载体时第一反应是【零递】（这条线唯一的上架件，价 100）。**那是错的**：
#
#   零递 = 「**置 0**；1 张手牌带上【21 匹配】」—— 它自己那张落堆成 0 点牌。
#   而 `DRAFT_ZERO` = 「打出标签牌时把**堆顶 N 张置 0**」。
#   零递那张 0 点牌常年就躺在堆顶，于是 `DRAFT_ZERO=1` 有一截
#   **把已经是 0 的那张再置一遍 0** —— 白做。
#   → 那一档会被**系统性低估**，而且低估多少取决于「零递那张还在不在堆顶」，
#     读不出来。这正是 CLAUDE.md 第四节那条：**一个「看起来合理」的数
#     不能当成机制对了**。
#
# 【递吃】tagdraft 是干净的：
#   · 纯贴标签（「1 张手牌带上【21 匹配】」，自己不走这条线 ——
#     `SK.TAGDRAFT` 故意不在 `hasDraftLine` 里，见 SK 表那条注释），
#     所以旋钮加的子句**只作用在标签牌那一手**，减出来的差就是这句子句；
#   · **候选技能的形状本来就是「递吃 + 一句子句」** —— 所以这一跑的 X
#     不是中间量，它**就是那件新技能的 X**，直接拿去判档位；
#   · 它的斜率温和（实测 A 2.52 / '2' 2.34 / '3' 1.88），A 槽一格代表得了；
#   · `DRAFT_MINUS` 那条注释本来就写的是 tagdraft。
#
# **而第四条理由是决定性的，查实现才看见**：`DRAFT_GIFT_N` 的闸是
# `has(skills, SK.TAGDRAFT)`（`rules.js:10670`，在 `SK.TAGDRAFT` 那个 if 里面）——
# **不是 `hasDraftLine`**。所以拿零递当载体，那个旋钮
# **一次都不会发动，而 A/B 两档会逐位相同** —— 读出来就是
#「送对手推牌这句子句值 0」，一个本来可能成立的设计被静默判死。
# 这正是 CLAUDE.md 第四节那条「失败全是静默的」。
#
#〔另三个旋钮的闸是 `hasDraftLine(skills, G, card)`，而递吃贴的标签
#  走 `draftTagOn(G, card)` 那条支（`hasDraftLine` 第一行），所以
#  **标签牌打出那一手**它们照发动 —— `SK.TAGDRAFT` 不在技能名单里不影响。〕
#
# ---- 口径 ----
#
#   vs tagdraft tagdraft -n 20000 · 江口闸官第 1 槽（A，4 张）· 不带常驻技 · R4
#
# ⚠ **基准档（第 0 跑）必须跟它们同一批** —— 台账里递吃那个 2.52 是
# 10-25 跑的，而 10-26 合并了远端三条。那一行作废公告写着
#「全表别的格子在合并后的代码上一格都没重跑过」，
# 所以**拿 2.52 去减这一批 = 跨版本相减**（CLAUDE.md 开头那条）。
#
# ⚠ **D 要跟 X 一起读**，这一批里有一格事前就有红旗：
# `DRAFT_SURGE` 推上来的牌落堆顶，而 `draftReach` 从堆顶往下累加
# → 它先吃掉自己推上来的那几张 = 「库 → 堆 → 立刻收走」= **洪水的形状**
#（X +5.22 / 溢价 +4.27，而洪水是全表唯一「太强且治不了」删掉的）。
# 红旗原文在 `rules.js` 的 `catchStart` 里 `draftSurge` 那一段上面。
#
# ⚠ **R4 下这条线的瓶颈在「档」上，不在「分」上**：
# 诊断口显示 77.3% 的发动被堆厚卡住（整堆吃完 65.2% + 空堆 12.1%），
# 每次只够着 1.8~2.8 张 —— **全落在 2/3 张那个 1 分档**。
# 而 R4 的档是 1 / 4 / 12，所以**把段从 3 张推到 4 张 = 翻两番**。
# 所以这一批要盯的不只是 X，还有诊断表里「够着几张」那一列。
#
# 跑法：sh tools/md-sim/run-draft21.sh
# 输出：tools/md-sim/out-draft21-<档>.txt

cd "$(dirname "$0")/../.." || exit 1
OUT=tools/md-sim
N=20000
CARRIER=tagdraft

run() {
  tag="$1"; shift
  echo "=== $tag ==="
  env "$@" node $OUT/sim.js vs $CARRIER $CARRIER -n $N \
    > "$OUT/out-draft21-$tag.txt" 2>&1
  grep -E '手里：|先手 − 后手|后手（我）|先手（对手）' \
    "$OUT/out-draft21-$tag.txt" | head -12
  echo
}

# 第 0 跑：基准（这一批自己的，不要用台账里 10-25 那个 2.52）
run base DRAFT_SURGE=0

# 候选一【推牌 + 21 匹配】—— 治堆薄那条瓶颈，但带洪水红旗
run surge1 DRAFT_SURGE=1
run surge2 DRAFT_SURGE=2

# 候选二【堆顶 N 张置 0】—— 不碰牌库，只造免费垫片
run zero1 DRAFT_ZERO=1
run zero2 DRAFT_ZERO=2

# 候选三【堆 −N，不含自己】—— 跟上面严格对称，只差「怎么压」
run minus1 DRAFT_MINUS=1
run minus3 DRAFT_MINUS=3

# 接线自检：**DRAFT_MINUS=13 应当 ≈ DRAFT_ZERO=10**（两条路不同、落点相同 ——
# K 减 13 到底，而堆常年 2.3~3.3 张，两档都把整堆压成 0）。
# 差超出噪声就是有一头接错了。判据原文在 DRAFT_MINUS 那段注释里。
# ⚠ 这两档**不是候选件**（整堆置 0 已判死于压吃病，6.53），只做自检。
run selfcheck_minus13 DRAFT_MINUS=13
run selfcheck_zero10 DRAFT_ZERO=10

# 候选四【送对手 N 张推牌】—— 「给对手资源要先算它替代了什么」那条的实例
run gift2 DRAFT_GIFT_N=2

# 候选五【穿过无点数】
# ⚠ **这一档在 vs 口径下量不到，而且是结构性的**：基准跑的 `stopVoid`
#   实测 **0.0%** —— 两侧都只带递吃，谁都不造堆上无点数，这条线一次都没撞上。
#   留着这一跑只为**证明它是 0**（对照组），顺便验旋钮没碰坏别的。
run thru DRAFT_VOID_THRU=1

# ---- 候选五的**主场**：对手带【传色】suitcolor ----
#
# 【传色】是上架件，自带【花色匹配】那半句「**打出后堆上的牌变成无点数**」
#（`rules.js:11676`，而且是**整堆**不是一张）。所以它正是这条线的天然反制 ——
# 对手丢一张传色，我的 21 匹配下一手就 `stop='void'` 当场断在第一张上。
# 【穿过无点数】于是是一件**反-反制**件。
#
# ⚠ **这儿用不对称 `vs`，不是 `pair`，理由是实现查出来的**：
#   `cmdPair` 只调 `printColdDiag()`（`sim.js:1847`）—— **它不打
#   21 匹配那张诊断表**。而这一档要先读的恰恰是「用掉几成」和
#   「整堆吃完」（压吃病），光有一个分数读不出病。
#   `cmdVs` 两侧的诊断都打，而且 `vs A B` 支持两件不同的技能。
#   代价：这是「我带递吃 / 对手带传色」的格局，**不是「我两件都带」** ——
#   协同那个数要另跑 `pair`，而 `pair` 的数是单侧 back，不能跟这儿相减。
vsrun() {
  tag="$1"; shift
  echo "=== $tag（vs tagdraft suitcolor · 不对称）==="
  env "$@" node $OUT/sim.js vs $CARRIER suitcolor -n $N \
    > "$OUT/out-draft21-$tag.txt" 2>&1
  grep -E '手里：|先手 − 后手|后手（我）|先手（对手）|穿过' \
    "$OUT/out-draft21-$tag.txt" | head -16
  echo
}
vsrun thru_field_off DRAFT_VOID_THRU=0
vsrun thru_field DRAFT_VOID_THRU=1

# 「我两件都带」那个格局的协同（单侧 back 口径，只能这两档互减）
echo '=== thru_pair（pair 口径 · 单侧 back · 不能跟上面相减）==='
node $OUT/sim.js pair $CARRIER suitcolor -n $N \
  > "$OUT/out-draft21-thru_pair_off.txt" 2>&1
grep -E '只带|都带|协同' "$OUT/out-draft21-thru_pair_off.txt"
DRAFT_VOID_THRU=1 node $OUT/sim.js pair $CARRIER suitcolor -n $N \
  > "$OUT/out-draft21-thru_pair.txt" 2>&1
echo '  ---- 旋钮开 ----'
grep -E '只带|都带|协同' "$OUT/out-draft21-thru_pair.txt"
echo

echo '---- 读数提醒 ----'
echo '· 目标档位 2.7~4.5（A 槽点数槽口径）；基准是第 0 跑，不是台账里的 2.52'
echo '· 这十一档是同一次脚本跑的，所以彼此可减；pair 那两档只能互减'
echo '· D 在 ±0.24（2σ）内算分不开；surge 那两档的 D 要单独看（洪水红旗）'
echo '· 「够着几张」跨过 4.0 = 跨进 R4 的 4 分档，那比 X 多 0.3 要紧得多'
echo '· 「用掉几成」趋 0 + 「整堆吃完」趋 100% = 压吃病，X 落在档里也不能用'
