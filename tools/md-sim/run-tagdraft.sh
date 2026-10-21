#!/usr/bin/env bash
# 2026-10-21 ·【递吃】：21 匹配**第一次做成标签**。
#
#   打出时，给手里**点数最小**的那张贴上【21 匹配】；
#   那张牌打出去时走这条线（贴的那一手自己**不走**）。
#
# ---- 为什么量它（这一族已经有五件原型了）----
#
# 那五件**全都落在打出的那张上**，于是预算 = 21 − 槽上印的那个点数，
# 跟槽标签死死绑住 —— 吃水 A 3.41 / 7 2.56 / **K 1.17**，单调衰减。
# 那正是台账「全表一把尺子第一次失效」那条定价陷阱的来源。
#
# 标签形式把「**谁走这条线**」和「**谁点着这件技能**」拆开，
# 于是 K 槽也能让手里的 A 去吃。
#
# ---- 事前就看得见的两个风险 ----
#
# 一、**兑现链**。「我贴 → 我自己之后打出那张」是一段链。
#    比伏流短一截（不用等对手），而伏流那一段的利用率只有 **12%**
#    （`FLOW_FAIL_TAG` 的诊断口量出来的，死因是兑现链不是幅度）。
#    所以 `tagged` / `cashed` 分开记，**兑现率 = cashed/tagged**。
#
# 二、**决策可能被它删掉**。「打小牌收得多」本来是吃水那个决策，
#    而这件自动挑最小的 —— 那就是压吃那个病换个地方犯
#    （压吃诊断：99.7~100% 吃光整堆、预算用掉 0~18.6%，21 匹配退化成摆设）。
#
# ---- 所以**先读诊断，再读 X** ----
#
#   `budSum/fired`  平均预算。**这是立项的那个数**：K 槽的吃水预算是
#                   21−13=8，而这件挑手里最小的牌 ——
#                   拉不动它机制就没跑通，X 多少都不用看
#   `sumSum/budSum` 预算用掉几成。贴着 0 = 堆太薄（压吃那个病）
#   `gotSum/fired`  收几张。贴着整堆走 = 退化成「无条件收整堆」
#   `cashed/tagged` 兑现率。明显低于 1 = 兑现链断了（伏流那条路）
#
# ================== 2026-10-21 · 这一版把它跑快了 ==================
#
# 三处，合起来大约 **6 倍**，而**一个数都没变**（每个进程的种子、
# 口径、局数全照旧，只是不再排队）：
#
# 一、**并发。** 八个重活互相独立，而机器有 14 核 —— 原先它们排成一队。
#    总量 46.8 万局没少，但**墙上时间从「八个之和」降到「最慢那个」**
#    （一次 `vs` = 8 万局）。各自写进自己的临时文件，最后按顺序拼出来，
#    所以**输出跟串行版逐行相同**。
#
# 二、**删掉两条空跑的命令。** 原先这儿有
#    `proto-diag.js draft ... 0 lock` 和 `... 1 deepline` 两条 ——
#    而 `PROTO_STAT` 里**根本没有 `draft` 这一项**（吃水是正式技能，
#    不是原型）。那两条跑满 4000 局，只打出两行表头。
#    吃水的诊断（发动 / 凑成率 / 预算 / 超预算 / 整堆吃完）一直来自
#    `sim.js vs` 自己那行 21 匹配诊断 —— §2 里有，而且是**同一批**的。
#
# 三、**结构检查变成闸。** 原先 `refs.js` / `check.js` 跑完就往下走，
#    于是表结构坏了也照样等八分钟才看见。现在不过就停
#    （`SKIP_GATE=1` 可以绕过）。
#
# 没做的那一项：`cmdPair` 里那条「空 vs 空」的基线被**重算了三次**
#（`measure()` 每次自己跑一遍），白跑 4 万局。给 `measure` 加缓存能省掉，
# 但 `run()` 会往 `PROTO_STAT` 这些全局计数器里累加 ——
# 缓存掉一次 `run` 就等于悄悄改掉诊断行的分母。
# **那是典型的静默失真，为 §3 的三分之一不值得。**
#
# 旋钮：N=20000 局数、ND=4000 诊断局数、J=并发数、
#       SKIP_GATE=1 跳过结构检查、POND=1 加量同角色对照（见 §2b）
set -u
N=${N:-20000}
ND=${ND:-4000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 后台跑一条命令，输出（含 stderr）攒进 $TMP/$1。
# 超过 J 个在跑就等一个 —— 8 个活 14 核时这一句不会触发，
# 而 POND=1 之后是 10 个，仍然塞得下
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( "$@" >"$TMP/$tag" 2>&1 ) &
}
# 按**写死的顺序**把结果拼出来，所以读起来跟串行版一样
show() { [ -f "$TMP/$1" ] && cat "$TMP/$1"; }

echo "################ 0. 结构（闸：不过就不跑后面）################"
# 加了一件技能 → SKILLS 表和 SK 常量**两处**都要改到（risehold 那次只改了
# 一处，症状是「X = 精确 0.00」）。refs.js 第 1 项查 SIM_ONLY 白名单
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -12 "$TMP/refs"; echo; tail -4 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo
    echo "!!!! 结构检查没过（refs=$rc_refs check=$rc_check）—— 停在这儿。"
    echo "     后面那 46.8 万局在坏表上跑出来的数是废的。"
    echo "     确实想跑：SKIP_GATE=1 bash tools/md-sim/run-tagdraft.sh"
    exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

echo
echo "################ 并发起跑（J=$J，八个活）################"
echo "  总量 46.8 万局，墙上时间约等于最慢那一个（一次 vs = 8 万局）。"

# §1 诊断。⚠ 照 CLAUDE.md 第四节：**一个「看起来合理」的数不能当成机制对了。**
# 同色闸传错参那次 bug 档 4.89、修好 4.88，单看 X 永远查不出来。
#
# 这儿要对的第一个数是 `tagged` —— 每次打出带这件技能的牌都该贴一张，
# 所以它该 ≈「这件技能发动几次」。**明显低于那个数**说明手里早贴满了
#（手牌只有 4 张，而标签不重贴）—— 那本身就是这件技能的一条天花板
job d_a node tools/md-sim/proto-diag.js tagdraft "$ND" 0 lock
job d_k node tools/md-sim/proto-diag.js tagdraft "$ND" 1 deepline

# §2 X。立项的全部赌注就在这两对的**差之差**上：
#   吃水  A 3.41 → K 1.17，掉 2.24（单调衰减，跟槽标签绑死）
#   递吃  要是也掉这么多，标签形式就没解决任何问题
#
# ⚠ `sim.js` 的 `--slot` 曾经被**静默忽略**（硬编码 slot 0），2026-10-19 修了。
# ⚠ 吃水**必须在同一批里重跑** —— 3.41 / 1.17 是旧批次的数，照台账那条规矩：
#   两个数相减之前先确认同一次跑、同一口径、同一版代码。
#   〔10-21 实测这两格跟 10-19 **逐位相同**，所以那一族旧数没废。
#     读的时候记住 `vs` 报的是两侧原始值，**X 是两侧平均**：
#     3.28/3.54 → 3.41，1.07/1.27 → 1.17〕
job x_tag_a node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" --role lock --slot 0
job x_tag_k node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" --role deepline --slot 1
job x_dra_a node tools/md-sim/sim.js vs draft draft -n "$N" --role lock --slot 0
job x_dra_k node tools/md-sim/sim.js vs draft draft -n "$N" --role deepline --slot 1

# §2b 同角色对照（默认关）。上面那两格**跨了两个角色**（江口闸官 4 槽 /
# 深海钓手 2 槽），于是「其余槽里插着谁」两边不一样 —— 那正是
# 10-20 `kitFor` 那个 4.4 分混淆的形状。读差之差能绕开它，但干净的版本是
# 鱼塘老板 `['7','3 5','K']`：**同一个角色**里的 7 槽和 K 槽。
# 10 个活在 14 核上仍然并发，所以开它**不多花墙上时间**
if [ "${POND:-0}" = "1" ]; then
  job x_tag_p0 node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" --role pond --slot 0
  job x_tag_p2 node tools/md-sim/sim.js vs tagdraft tagdraft -n "$N" --role pond --slot 2
  job x_dra_p0 node tools/md-sim/sim.js vs draft draft -n "$N" --role pond --slot 0
  job x_dra_p2 node tools/md-sim/sim.js vs draft draft -n "$N" --role pond --slot 2
fi

# §3 同族共存。照水 / 清水那个 8 倍先例 —— 同族两件的判据不只是
# 「各自够不够档位」，还有「两件会不会完全重复」。这一族尤其要查：
# 两件都开 21 匹配这条线，而一张牌同时带标签又带吃水时，
# `hasDraftLine` 只会开**一次**
job pair node tools/md-sim/sim.js pair tagdraft draft -n "$N" --role lock

# §4 基线。`hasDraftLine` 多了两个参数、**六处**调用全改了。
# 漏改一处的后果是静默的，而这一行该跟上一轮**逐位相同**
#（不带这件技能的路径一行都没动）
job base node tools/md-sim/sim.js base -n "$N"

wait

echo
echo "################ 1. 它真的接上了吗（**先看这个**）################"
echo "---- 江口闸官 A 槽（跟吃水的 3.41 同一格）----"
show d_a
echo
echo "---- 深海钓手 K 槽（跟吃水的 1.17 同一格）----"
show d_k
echo
echo "〔吃水没有 PROTO_STAT 条目（它是正式技能不是原型），"
echo "  它的发动 / 凑成率 / 预算在 §2 那四段的 21 匹配诊断行里。〕"

echo
echo "################ 2. X：两端的槽 ################"
echo "---- 递吃 · 江口闸官 A 槽 ----"
show x_tag_a
echo
echo "---- 递吃 · 深海钓手 K 槽 ----"
show x_tag_k
echo
echo "---- 吃水 · 同两格（同一批，所以减得动）----"
show x_dra_a
echo
show x_dra_k

if [ "${POND:-0}" = "1" ]; then
  echo
  echo "################ 2b. 同角色对照：鱼塘老板 7 槽 vs K 槽 ################"
  echo "---- 递吃 · 7 槽 ----"; show x_tag_p0
  echo; echo "---- 递吃 · K 槽 ----"; show x_tag_p2
  echo; echo "---- 吃水 · 7 槽 ----"; show x_dra_p0
  echo; echo "---- 吃水 · K 槽 ----"; show x_dra_p2
fi

echo
echo "################ 3. 同族共存：加上它之后吃水还活不活得下去 ################"
show pair

echo
echo "################ 4. 基线没被动过 ################"
show base

echo
echo "################ 跑完：怎么读 ################"
echo "  **先读 §1 的 budSum/fired** —— 拉不动 K 槽那个 8，机制就没跑通，"
echo "  那时 §2 的 X 是「我写的那个东西的数」，不是这个设计的数。"
echo "  档位 +2.7~4.5（槽技能）。而这一件真正要看的是"
echo "  **A 槽和 K 槽的差**：吃水掉 2.24，它掉多少。"
echo "  ⚠ §2 报的是两侧原始值，**X 是两侧平均**（3.28/3.54 → 3.41）。"
