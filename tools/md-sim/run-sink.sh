#!/usr/bin/env bash
# 2026-10-19 · 重做「【21 匹配】沉底那一支」的测量。
#
# 上一轮那四对 A/B **全部逐位相同**，而我差点把它读成「改动无害」——
# 实际是那一支**一次都没触发**，两个独立的错叠在一起：
#
#   ① 命令写的是 `-r upstream`，而参数叫 `--role`，所以它被忽略了
#      （输出抬头印的是「江口闸官」—— 证据一直在那儿）；
#      而且 `--role` **只借槽形状**，常驻技要 `--special` 才带，
#      偏偏【逆流】（可选落堆底）正是常驻技。
#   ② `pair draft coldhue` 根本测不到这件事：pair 把两件装进**两个槽**
#      （槽1=A、槽2=2），寒流只让**它自己那张**沉底，跟吃水那张牌无关。
#      要测这一支，沉底必须作用在**吃水那张牌**上。
#
# 所以现在先看计数口（它做了几次），再看分。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 1. 计数口：沉底那一支到底发动了几次 ################"
# `draftSink.fires` = 0 就说明还是没测到，后面的分一个都别读
echo "---- 逆流船夫 · 带常驻技【逆流】· 吃水插第 1 槽（5 6 7，12 张） ----"
node tools/md-sim/proto-diag.js draft 4000 0 upstream special
echo "---- 对照：同角色但**不带**常驻技（沉底无来源 → fires 必须是 0） ----"
node tools/md-sim/proto-diag.js draft 4000 0 upstream
echo "---- 对照：旧档（DRAFT_ANCHOR=top，沉底时压根不判 → fires 必须是 0） ----"
DRAFT_ANCHOR=top node tools/md-sim/proto-diag.js draft 4000 0 upstream special

echo
echo "################ 2. 分：逆流船夫带吃水，两档 ################"
# `one` 的口径是「我带、对手不带角色」，只跟 one 比；
# 这儿两档用的是同一条命令，所以**两档之间**可以直接相减
echo "---- 新档（self） ----"
node tools/md-sim/sim.js one draft --role upstream --special -n "$N" | sed -n '1,12p'
echo "---- 旧档（top） ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js one draft --role upstream --special -n "$N" | sed -n '1,12p'

echo
echo "################ 3. 逆流这件常驻技本身值多少（两档） ################"
# 锚点改动给【逆流】开了一个新用途（「挑这一段从哪头吃」），
# 所以它的常驻 X 也该跟着变
echo "---- 新档 ----"
node tools/md-sim/sim.js role upstream -n "$N" | sed -n '1,14p'
echo "---- 旧档 ----"
DRAFT_ANCHOR=top node tools/md-sim/sim.js role upstream -n "$N" | sed -n '1,14p'

echo
echo "################ 跑完 ################"
