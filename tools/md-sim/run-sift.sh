#!/usr/bin/env bash
# 2026-10-22 · 滤牌族两件原型：【倒饵】dumpbait、【滤饵】sift（名字临时，待用户定）
#
# 用户当天三条：
#   「**倒饵 量一下**」
#   「换水 是任选 N 张手牌洗回牌库」
#   「提案 完全可以**抽 1 洗 1**，把 N 定下来，跟换水完全不重复，可以共存」
#   「**抽 2 洗 1** 也可以加入考虑」
#
# 这一批要回答四件事：
#
#   一、倒饵的 X 落在哪一档（槽技能 +2.7~4.5），以及它跟 **+1.47** 对不对得上。
#      那 1.47 不是估的 —— 【对换】= 【摘钩】+ 倒饵（`doTakeFrom` 后半句就是
#      倒饵的全部效果，一行不差），而两件的 X 来自**同一次跑**
#      （`all -n 20000` · 2026-10-21 · R3 · A 槽 · se 约 0.11，
#        《全技能速查》表头明写这两列可以互相相减）：
#          压舱 +1.39 / 摘钩 +2.73 / 对换 +4.20  →  4.20 − 2.73 = +1.47
#      ⚠ 它是**对换语境下的边际值**（对换先把他手里最好的掏走了再塞废牌），
#        所以它是**参照不是预期值**。对不上先查第 3 节的诊断口，别先改设计。
#
#   二、`BAIT_PICK` 三档差多少 = **「挑得准」值多少**。
#      旧证里这一格差一倍多：分饵塞「牌库顶里对他最差的」值 **+0.62**，
#      对换塞「我手里最废的」按上面那笔是 **+1.47**（两笔口径不同、不能相减）。
#
#   三、滤饵两个形状：**抽 1 洗 1 vs 抽 2 洗 1**。
#      ⚠ **这两格不是一条曲线上的两点** —— 它们在「看几张」和
#        「有没有盲补」**两个维度上同时不同**，所以分开读、不许互减着往下推：
#          抽 1 洗 1  看 3+1=4 张，退 1 之后手牌 3 → refill **盲摸 1 张**
#          抽 2 洗 1  看 3+2=5 张，退 1 之后手牌 4 → refill **不补**（纯过滤）
#        前者那次盲补**会把过滤的效果抵掉一部分**。
#
#   四、**滤牌在宽槽该更强**（池子大 → 挑得准），所以 ♥ 槽必须量。
#      ⚠ 两件都**不读打出那张牌的任何属性** → 槽通用满分，
#        所以「A 槽 vs ♥ 槽」量的纯粹是**发动频率**（4/52 vs 13/52），
#        不是形状差。这两格要是**不**随覆盖面涨，那才是反常。
#
# ---- 自检：**先看这两格，再看 X** ----
#
# 一、诊断里 `fires` **不能是 0**。0 = SK 常量漏了那一行，而那个症状是
#    「X = 精确 0.00」**不是报错**（RISEHOLD 栽过）。
#    `fires` 该接近命中那个槽的次数：A 槽 4/52、♥ 槽 13/52。
#
# 二、**局长要守住**，而查它的口是第 3 节的「我方出牌 N 次/局」。
#    ⚠ `sim.js vs` **不打印回合数**（`cmdVs` 只打两侧分差 + 镜像协同），
#      而 `sim.js base` 打回合数却**不带这两件**（它们不在任何角色的槽里）——
#      所以「拿 base 的 46.00 验这两件」是句空话。真正能验的是
#      `proto-diag.js` 那一行出牌次数，而它需要一个**同批的锚**：
#      这一批拿**换水**（`swap`）当锚 —— 它同是滤牌族、同走
#      「洗回牌库 + refill 补回」那条路，按下面的账也是 −1。
#      三件的出牌次数对不上，就是下面某一笔账有一处错。
#
#    两件按一整个回合算牌库净变化都是 −1：
#      普通一手    4 → 打 1 → 3，refill 补 1              → −1
#      倒饵        4 → 打 1 → 3 → 给出 1 → 2，refill 补 2 → −2，
#                  而他手牌 5 > 下限 4 → refill **不补** → 一整个回合对平
#      抽 1 洗 1   −1 +1 −1 = −1
#      抽 2 洗 1   −2 +1 = −1（手牌 4 张是**下限**、上限不限，
#                  抽 2 洗 1 多留的那张只是让这一回合的 refill **空转**）
#    `turns` 动了就是上面某一笔账有一处错 —— 那比 X 对不上严重。
#
# ---- 读数时记住：两件的数都是**下限** ----
#
# 两件的价值全在挑牌精度上，而 AI 挑得笨（【凝水】那条判据）。
# 倒饵走 `ai.swapPick`、滤饵也走 `ai.swapPick`，两把都是「这一手够不够用」
# 的贪心，不算「那张留着下一手更值钱」。**别指望重跑会变高。**
#
# 旋钮：N=局数 ND=诊断局数 NA=全表局数 J=并发
set -u
N=${N:-20000}
ND=${ND:-4000}
NA=${NA:-8000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# `cmdVs` 同件传两次走的是「先手 vs 后手」那个特例，打的是这四行。
# 〔run-reflect.sh 那个 pick 的第二个分支 `^    后手（我） ` 在这儿匹配不上
#   —— 实际输出是「后手（我）手里：」，中间没空格。所以只留第一个分支，
#   另把先后手差和镜像协同一起捞出来：这两件都改手牌质量，
#   而后手本来劣势 → 「对谁更有用」是个真问题〕
pick() {
  grep -E '手里：|先手 − 后手|镜像协同' | head -4 \
    | sed -e 's/^ *//' -e 's/标准误/se/'
}
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { echo "-- $2"; [ -f "$TMP/$1" ] && cat "$TMP/$1" | pick; }

echo "################ 0. 结构（闸：不过就不跑后面）################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  # ⚠ 失败时**打全文，不 tail**〔2026-10-22 第一跑就栽在这儿〕——
  # `check.js` 的断点在**出错那一组**（可能是第 2 组），尾部只剩汇总行
  #「1 / 9 组断了。上面第一条就是断点」，而「上面」正好被 tail 截掉了。
  # `refs.js` 更糟：它的 tail -10 会被那条几十件的 SIM_ONLY 名单占满。
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo "==== refs.js 全文（退出码 $rc_refs）===="; cat "$TMP/refs"
    echo; echo "==== check.js 全文（退出码 $rc_check）===="; cat "$TMP/check"
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"
    echo "     ⚠ 先分清是谁弄的：check.js 的九组配装（base / lockdraw /"
    echo "     frost / lockice / wardice / burn / fire / surge / filler）"
    echo "     **一件都不带 dumpbait / sift**（grep 无匹配）—— 所以它断了"
    echo "     不一定是滤牌族这两段结算。查法：git stash 掉 rules.js 再跑一次，"
    echo "     断点还在就不是这一轮的。"
    echo "     ⚠ 第一跑（2026-10-22）就是这样：wardice 报不守恒 −1，而真凶是"
    echo "     **叠放那条路的「白放」**（rules.js 的 stacking 段）—— 挑不出目标时"
    echo "     那张牌离了手却不进任何桶。跟滤牌族无关，也不是冻结 / 传火的欠账。"
    echo "     那一类的通用查法：对着断点那一手的七个桶，找「谁 −1 了而谁没 +1」。"
    exit 1
  fi
  tail -4 "$TMP/refs"; echo; tail -4 "$TMP/check"
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"        # A 槽：点数、4 张（窄）= 定价锚槽
H="--role mirror --slot 0"      # ♥ 槽：花色、13 张（宽）

# ---- 倒饵：三把尺子 × 两个槽 ----
# mine 是默认档 = 对换后半句的逐字复刻，**唯一能跟 +1.47 对照的一格**
job b_mine_a                 $V dumpbait dumpbait -n $N $A
job b_foe_a   BAIT_PICK=foe  $V dumpbait dumpbait -n $N $A
job b_both_a  BAIT_PICK=both $V dumpbait dumpbait -n $N $A
job b_mine_h                 $V dumpbait dumpbait -n $N $H
job b_foe_h   BAIT_PICK=foe  $V dumpbait dumpbait -n $N $H

# ---- 滤饵：两个形状 × 两个槽 ----
job s_d1_a                 $V sift sift -n $N $A
job s_d2_a    SIFT_DRAW=2  $V sift sift -n $N $A
job s_d1_h                 $V sift sift -n $N $H
job s_d2_h    SIFT_DRAW=2  $V sift sift -n $N $H
# 对照档：**不是候选形状**，只回答「要是 SIFT_BACK 没钉死会怎样」
# （用户把它钉死 1，而那一刀正是解开「严格支配换水」的那一刀）
job s_b3_a    SIFT_BACK=3  $V sift sift -n $N $A

# ---- 诊断：它到底做了几次 ----
job d_b_a  node tools/md-sim/proto-diag.js dumpbait $ND 0 lock
job d_b_h  node tools/md-sim/proto-diag.js dumpbait $ND 0 mirror
job d_s_a  node tools/md-sim/proto-diag.js sift     $ND 0 lock
job d_s2_a SIFT_DRAW=2 node tools/md-sim/proto-diag.js sift $ND 0 lock
# 局长的锚：换水同是滤牌族、同走「洗回牌库 + refill 补回」，按账也是 −1
job d_swap node tools/md-sim/proto-diag.js swap $ND 0 lock

# ---- 全表同槽排名 + 基线 ----
job all_a node tools/md-sim/sim.js all -n $NA $A
job base  node tools/md-sim/sim.js base -n $N
wait

echo
echo "################ 1.【倒饵】把 1 张手牌给对方 ################"
show b_mine_a "A 槽 · BAIT_PICK=mine（默认）← 对换后半句的逐字复刻"
show b_foe_a  "A 槽 · BAIT_PICK=foe （对他最没用 = 上界）"
show b_both_a "A 槽 · BAIT_PICK=both"
echo
show b_mine_h "♥ 槽 · mine"
show b_foe_h  "♥ 槽 · foe"
echo
echo "〔读法三条："
echo "  一、**mine 那一格跟 +1.47 对照**（对换 4.20 − 摘钩 2.73，同批可减）。"
echo "     ⚠ 那是对换语境下的边际值，**不是预期值** —— 对换先把他手里最好的"
echo "       掏走了再塞废牌，他手里的成分跟「没被掏过」时不一样。"
echo "       **低于 1.47 是预期的方向**（没有前置的掏牌 → 他手里更可能有好牌，"
echo "       我那张废牌替掉的只是一次随机摸牌，而不是替掉一张已经被掏空的手）。"
echo "  二、foe − mine = **「照谁的视角挑」值多少**。旧证说这一格很大："
echo "     分饵塞「牌库顶里对他最差的」+0.62 vs 对换塞「我手里最废的」+1.47"
echo "    （两笔口径不同、**不能相减**，但两件都在说「挑得准」是主变量）。"
echo "  三、♥ − A = **发动频率**（13/52 vs 4/52），不是形状差 ——"
echo "     两件都不读打出那张牌的任何属性。**不随覆盖面涨才是反常。**〕"

echo
echo "################ 2.【滤饵】抽 N 张，然后选 1 张手牌洗回牌库 ################"
show s_d1_a "A 槽 · 抽 1 洗 1（默认档）"
show s_d2_a "A 槽 · 抽 2 洗 1"
echo
show s_d1_h "♥ 槽 · 抽 1 洗 1"
show s_d2_h "♥ 槽 · 抽 2 洗 1"
echo
show s_b3_a "A 槽 · SIFT_BACK=3（**对照档，不是候选形状**）"
echo
echo "〔读法四条："
echo "  一、**两个形状分开读，不要互减** —— 它们在「看几张」和「有没有盲补」"
echo "     两个维度上**同时**不同（照 10-21 洪水那条教训的第三层："
echo "     对照组只能证伪它量的那一个维度）。"
echo "  二、对照的锚是**换水 1.73**（任意张、盲退、价 65）。两件的轴不同："
echo "     换水 = **张数**（规模），滤饵 = **信息质量**（精度，退死 1 张）。"
echo "     滤饵低于换水**不是问题** —— 它只退 1 张，而换水退到 3 张。"
echo "     要比就比**同张数**：换水 N=1 是 **0.67**（旧档，\`SWAP_N=1\`）。"
echo "     ⚠ 那 0.67 带「旧档」标签（价 40 时代），跨版本，**只当量级参照**。"
echo "  三、SIFT_BACK=3 那一格的用途**只有一个**：确认「钉死 1 张」真的拦住了"
echo "     它爬上换水的张数轴。它要是追上甚至超过换水 1.73，那就证实了"
echo "     用户钉死 N=1 是对的（不钉死 = 严格支配换水）。"
echo "  四、**抽 2 洗 1 该高于抽 1 洗 1**（多看 1 张 + 不盲补，两样都是加法）。"
echo "     反过来的话先查第 3 节的 fromDrawn，别先改设计。〕"

echo
echo "################ 3. 诊断：它到底做了几次 ################"
echo "---- 倒饵 · A 槽 ----";  [ -f "$TMP/d_b_a" ]  && cat "$TMP/d_b_a"
echo; echo "---- 倒饵 · ♥ 槽 ----"; [ -f "$TMP/d_b_h" ]  && cat "$TMP/d_b_h"
echo; echo "---- 滤饵 · A 槽 · 抽 1 洗 1 ----"; [ -f "$TMP/d_s_a" ]  && cat "$TMP/d_s_a"
echo; echo "---- 滤饵 · A 槽 · 抽 2 洗 1 ----"; [ -f "$TMP/d_s2_a" ] && cat "$TMP/d_s2_a"
echo; echo "---- 换水 · A 槽（**局长的锚**，不是候选）----"; [ -f "$TMP/d_swap" ] && cat "$TMP/d_swap"
echo
echo "〔**先读这一节再读 X。** 一个「看起来合理」的数不能当成机制对了 ——"
echo "  同色闸那次 bug 下 4.89、修好 4.88，抖出它的只有诊断口。"
echo
echo "  **第一行那个「我方出牌 N 次/局」是这一批唯一能验局长的口。**"
echo "  四格（倒饵 / 滤饵抽1 / 滤饵抽2 / 换水）该**彼此相等** ——"
echo "  三件按一整个回合算牌库都是 −1（账在脚本头部）。"
echo "  ⚠ 这是**组内横比**，不要拿它去对 base 的 46.00："
echo "    base 不带这两件，而且那是全局回合数、这是我方出牌次数，两个口径。"
echo
echo "  dumpbait 那一行（印的是「/局」，比值要自己除）："
echo "    fires        **0 = 没接上**（症状是 X 精确 0.00，不是报错）"
echo "    given/fires  真给出几张。手里空了给不出 → 该贴着 1.0"
echo "    junk/given   ← **机制口**：给出那张对**他**钓不着且非 J 的比率。"
echo "                 贴着 1.0 → 「挑得准」不是变量，三档的差来自别处；"
echo "                 明显低 → 这个数是**下限**（AI 挑得笨）"
echo "    jack/given   误把 J 塞给他的比率。J 通吃 = **净送分**，该贴着 0。"
echo "                 它不贴 0 就是尺子写反了（mine 档 swapPick 给 J 100 分，"
echo "                 只在满手都 ≥100 时才可能被选中）"
echo
echo "  sift 那一行："
echo "    drawn/fires      真抽到几张。低于 SIFT_DRAW = 撞上牌库见底"
echo "    returned/fires   真退回几张。该贴着 SIFT_BACK"
echo "    fromDrawn/returned ← **「先看后退」唯一的诊断口**："
echo "                 恒 1.0 = 抽上来的全是废牌（**白抽**，信息没用上）；"
echo "                 恒 0   = 抽上来的全比手里好（**等于纯抽牌**）。"
echo "                 **两头都说明它没在做它号称做的事。**"
echo "                 抽 1 洗 1 和抽 2 洗 1 这一格该不同 —— 抽 2 张时"
echo "                 「两张里至少一张是废牌」的概率更高 → 该更接近 1.0〕"

echo
echo "################ 4. 全表同槽排名（A 槽）################"
[ -f "$TMP/all_a" ] && cat "$TMP/all_a"
echo
echo "〔「它在这个槽里排第几」—— 诊断口答不了这个，只有这张表能。"
echo "  滤牌族的现行件（抄自《全技能速查》，\`all -n 20000\` · R3 · A 槽 · se 0.11）："
echo "    观潮 +1.09 (价 50) / 同号 +1.16 (50) / 压舱 +1.39 (55) /"
echo "    换水 +1.73 (65) / 择饵 +2.55 (80) / 分饵 +2.93 (85)，"
echo "    另加动对手手牌那两件：摘钩 +2.73 (80) / 对换 +4.20 (115)。"
echo "  ⚠ 这一跑是 -n $NA，上面那列是 -n 20000 —— **同口径、不同局数**，"
echo "    所以可比但这一跑的 se 更大。要往台账里记定价用的数，重跑 -n 20000。"
echo "  ⚠ 这张表**不是定价授权**：定价要先问用户（标准约定），"
echo "    而这两件连名字都还没定。〕"

echo
echo "################ 5. 基线 ################"
[ -f "$TMP/base" ] && cat "$TMP/base"
echo
echo "〔该**逐位不变**：21.8 / 后手分差 −0.07 / 43.6+2.4+6.0 = 52.0 / 回合 46.00。"
echo " 这一格**只验「有没有碰坏别的东西」** —— 两件都不在任何角色的槽里，"
echo " 基线根本不发动它们，所以它对这两件的强度和局长**什么都说明不了**。"
echo " 动了就是这一轮往 \`afterPlay\` 加的两段结算漏到了不该漏的地方。"
echo " 局长看第 3 节那四格出牌次数，不看这儿。〕"
