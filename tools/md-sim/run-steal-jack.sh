#!/bin/sh
# 【抢牌】下把「捏 J」从「养堆」里拆出来〔2026-10-27〕
#
# ---- 为什么必须拆 ----
#
# `run-steal-ai.sh` 那七格量出一个很大的反转（张=分下 −0.87 → **+2.62**，
# keep 档 −5.11 → **+6.03**），而那七格里**「你」同时在做两件事**：
#
#   一 养堆（`worthHolding` / `holdEV` / `HOLD_MIX`）
#   二 **捏 J**（`JACK_HOLD`，默认 **3** —— 堆不足 3 张就不打 J）
#
# 两件都走同一道门 `holdSide(side) = HOLD_BOTH || side === ME`
#（`ai.js:392-393` 写明「`holdSide` 同时被 `HOLD_MIN` 和 `JACK_HOLD` 读」），
# 所以 `HOLD_BOTH=0` 一开，**两件一起只给「你」开**。
#
# 而抢牌恰好让 J 变成**最强的抢牌工具**（J 通吃整堆 → 抢的门槛是严格大于，
# J 几乎总能超过对方）。于是那 +3.5 分有一个完全不同的解释候选：
#
#   甲 抢牌让**养堆变安全**（输支能抢回来）→ 功劳在养堆
#   乙 抢牌让**捏 J 变值钱**（手里留着 J 就留着一张万能抢牌）→ 功劳在捏 J
#
# 现有旁证指向乙有一份：诊断里「你」的 **J 抢占比 36.1% vs 庄家 23.1%**，
# 「你」抢走 3.10 次/局 vs 庄家 2.39。**但那是旁证，不是拆分。**
#
# ⚠ **不拆就定计分是危险的** —— 甲和乙对「张=分 能不能回来」给的答案不一样：
#   甲成立 ⇒ 线性计分下养堆自己就立得住，分档可以撤；
#   乙成立 ⇒ 立住的是「摸到 J 别急着打」，那是**运气兑现**不是决策，
#   而 `band.js` 早就记着「抬 c 主要在给 J 加价，不是在奖励忍」
#   （`sim.js:630`），换成线性也不会改变这一点。
#
# ---- 口径 ----
#
# ⚠ `JACK_HOLD` 关掉**必须显式写 `=0`**（`ai.js:422`：不写就是 3，
#   「所有不写它的跑都是守闸的 AI 跑的」）。
# ⚠ 关掉之后「你」**仍然养堆**（`worthHolding` 那条独立），所以这一格是
#   「养堆但不捏 J」—— 它跟 `run-steal-ai.sh` 的 11 格只差 `JACK_HOLD`。
# ⚠ `JACK_HOLD` 不受 `HOLD_ONCE` 管（`ai.js:425`），所以不用管那个旋钮。
#
# ⚠⚠ **这四格跟 `run-steal-ai.sh` 的 11 / keep 格可以直接相减**
#   （同命令、同局数、同种子、同计分档、只差一个旋钮）。
#   跟**无抢牌**那一批（`out-a27-*.txt`）也可以比，而那是跨规则档的
#   单旋钮 A/B —— 要比就连着 `STEAL_ON` 这个标签一起写。
set -e
OUT=tools/md-sim
N=2000

key() {
  grep -E '^规则 |每人每局积分|每次平均收|后手胜率|后手分差|HOLD_ANCHOR=|掷骰|^    你    忍了|⚠' "$1"
  sed -n '/抢牌诊断/,/^$/p' "$1"
}

# 四格 = {硬闸 EV, keep 掷骰} × {捏 J, 不捏 J}
#
# 读法：**看「不捏 J」那一列掉了多少**。
#   掉得少（分差仍 ≫ 0）→ 甲：功劳在养堆，线性计分站得住；
#   掉到 ≈0 或负   → 乙：功劳在捏 J，那就不是决策性，分档的事要重想。
for jh in 3 0; do
  for mix in off keep; do
    tag="j$jh-$mix"
    echo "######## 张=分 · 抢牌 · JACK_HOLD=$jh · HOLD_MIX=$mix （埋锚+够得着都开）########"
    SCORE_BANDS=off STEAL_ON=1 HOLD_BOTH=0 HOLD_ANCHOR=1 HOLD_REACH=1 \
      HOLD_MIX=$mix JACK_HOLD=$jh \
      node $OUT/sim.js base -n $N > $OUT/out-sj-$tag.txt 2>&1
    key $OUT/out-sj-$tag.txt
    echo ""
  done
done

# ---- 对照：无抢牌下同一个拆分 ----
#
# 用户定过「没有加入抢牌规则，跑这些数据没有用处」，所以这两格**不是**
# 用来定计分的 —— 它们只回答一个问题：「捏 J 的价值是**抢牌带来的**，
# 还是它本来就值这么多」。少了它，上面那个拆分只知道总量不知道增量。
for jh in 3 0; do
  echo "######## 〔对照 · 无抢牌〕张=分 · JACK_HOLD=$jh · HOLD_MIX=off ########"
  SCORE_BANDS=off HOLD_BOTH=0 HOLD_ANCHOR=1 HOLD_REACH=1 JACK_HOLD=$jh \
    node $OUT/sim.js base -n $N > $OUT/out-sj-ns-j$jh.txt 2>&1
  key $OUT/out-sj-ns-j$jh.txt
  echo ""
done
