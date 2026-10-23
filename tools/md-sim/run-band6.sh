#!/bin/sh
# **档值怎么定**：`SCORE_BANDS` 的 (a,b,c) 扫描〔2026-10-23 第九跑〕
#
# ---- 先说清这一跑和 `scene.js` 的分工，别重复劳动 ----
#
# `scene.js bandSweep()` 已经把 **a 和 b** 判完了，而且是**解析解**（没有标准误）。
# 理由：一步阈值里出现的赔付只有 `score(2)=a`、`score(4)=b`、`score(3 或 4)`，
# **`c` 一次都不出现**。所以 a/b 用不着跑 20000 局。
#
# **这一跑只为三件 `scene.js` 判不了的事**：
#   一、**`c` 该给多少** —— 它只在「收 6 张以上」时兑现，而那一档出现的频率
#       本身就是打法的函数，解析算不出来。
#   二、**用户事实 3「忍 2 手几乎不可能」是不是真的** ——
#       `HOLD_RUN=2` 放开连忍，看「忍了几手」涨不涨。c 拉高了会不会涨。
#   三、**6+ 档是不是在发运气钱** —— 「J 占本档」过半 = 这一档主要由 J 决定，
#       那就不是决策在挣钱，抬 c 等于抬运气权重。
#
# ---- 口径 ----
# 空槽基线、双方同条件、`HOLD_ONCE=1 HOLD_EV=1`（`HOLD_EV_SPLIT` 默认开）。
# **不开 `JACK_HOLD`** —— 那个 k 还没拍板，开着会把 J 的占比整个挪位，
# 两件没定的事绞在一起就谁也判不了。〔要看 J 守闸下的档值形状，另跑〕
set -e
# ⚠ **这一行 2026-10-23 晚些补的，别删。** 当天 `HOLD_ONCE` / `HOLD_EV` /
#   `HOLD_BOTH` 三个旋钮的默认值全翻成了「开」，而这个脚本是按**翻之前的默认**写的
#   （每段显式写 `HOLD_ONCE=1 HOLD_EV=1`，`HOLD_BOTH` 不写 = 只给「你」）。
#   不钉住的话全部七段都变成对称，分差恒≈0，**档值扫描直接读不出峰**。
#   对 `scene.js` 那一行无影响：它调的是 `AI.holdEV`，不经过这三个旋钮。
#   下面每一行的 `env X=1` 仍然覆盖这三个，所以本脚本的语义一个字没变。
#   〔2026-10-23 同日再补 `JACK_HOLD=0`：那个旋钮当天也从 0 翻成了 3
#     （用户拍板，见 ai.js 那一行）。**这个脚本尤其要钉** —— 它头上
#     那句「**不开 `JACK_HOLD`**，那个 k 还没拍板，开着会把 J 的占比整个挪位」
#     正是不钉就会发生的事〕
export HOLD_ONCE=0 HOLD_EV=0 HOLD_BOTH=0 JACK_HOLD=0
cd "$(dirname "$0")/../.."
N=${1:-20000}
S=tools/md-sim/sim.js

pick() {
  awk '
    /按档汇总/ { c = 1 }
    c == 1 { print; if (/6\+ 档/) c = 0; next }
    /后手分差/ { print "    " $0; next }
    /忍了|判忍|情况 3 · 牌组厚/ { print }
  '
}

echo "######## 零 a/b 的解析解（不用跑，20 秒出）########"
echo "〔这一段是 scene.js 的 bandSweep，印在这儿是为了跟下面的跑对照〕"
SCORE_BANDS=1,4,12 node tools/md-sim/scene.js 2>&1 | sed -n '/档值扫描/,$p'

echo ""
echo "######## 甲 1,4,12 · 现行候选（基准，该复现第八跑丙段）########"
echo "〔要的：后手分差 +0.90(se 0.08)、判忍 26.1%、6+ 档次数 4.0% / 占总分 24.5%〕"
env SCORE_BANDS=1,4,12 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

# ---- b 的两侧：scene.js 说 b 在哪儿断，这儿看它在整局上什么样 ----
echo ""
echo "######## 乙 1,3,12 · b 往下一格 ########"
env SCORE_BANDS=1,3,12 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

echo ""
echo "######## 丙 1,5,12 · b 往上一格 ########"
env SCORE_BANDS=1,5,12 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

# ---- c 扫描：**这才是这一跑的主菜** ----
echo ""
echo "######## 丁 1,4,8 · c 压到 2b ########"
env SCORE_BANDS=1,4,8 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

echo ""
echo "######## 戊 1,4,20 · c 抬到 5b ########"
env SCORE_BANDS=1,4,20 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

echo ""
echo "######## 己 1,4,40 · c 抬到 10b（**故意过头**，看它在哪儿坏掉）########"
env SCORE_BANDS=1,4,40 HOLD_ONCE=1 HOLD_EV=1 node $S base -n "$N" 2>&1 | pick

# ---- 用户事实 3 的对照组 ----
echo ""
echo "######## 庚 1,4,12 · HOLD_RUN=2（放开连忍，验「忍 2 手几乎不可能」）########"
echo "〔「忍了 N 手/局」跟甲段比。几乎不涨 = 用户那条事实成立〕"
env SCORE_BANDS=1,4,12 HOLD_ONCE=1 HOLD_EV=1 HOLD_RUN=2 node $S base -n "$N" 2>&1 | pick

echo ""
echo "######## 辛 1,4,40 · HOLD_RUN=2（c 过头 + 放开连忍 = 最坏组合）########"
echo "〔这一段涨而庚段不涨 → **c 抬过头会把忍 2 手变划算**，那就破了事实 3〕"
env SCORE_BANDS=1,4,40 HOLD_ONCE=1 HOLD_EV=1 HOLD_RUN=2 node $S base -n "$N" 2>&1 | pick

echo ""
echo "#### 怎么判（五条，前四条判 c，第五条判整体）："
echo "####   一、**6+ 档「次数占比」** —— 用户要「基本无法拿到」。"
echo "####      抬 c 不该把它抬上去（c 不改打法只改赔付，**真涨了就先查实现**）。"
echo "####   二、**6+ 档「占总分」** —— 这是抬 c 的全部代价。c=12 时 24.5%；"
echo "####      它爬到多少算「发得太多」是**设计判断不是测量**，要用户定。"
echo "####   三、**6+ 档「J 占本档」过半** = 这一档主要由 J 在决定，"
echo "####      抬 c 等于抬运气权重，不是抬决策回报。"
echo "####   四、庚 / 辛 的「忍了 N 手/局」对甲 / 己。**涨了就是破了事实 3。**"
echo "####   五、每段**后手分差 ≥ 0**（忍不是严格劣势策略，不然没人会忍）。"
echo "####"
echo "####   ⚠ a/b 别从这几段读 —— 零段那张解析表精确得多，而且没有标准误。"
echo "####      这几段里 b 的两侧（乙/丙）只是用来看「解析判据有没有在整局上反过来」。"
