#!/usr/bin/env bash
# 2026-10-19 ·【拢水】按用户定的两个参数重测。
#
# 上一轮那个 −2.17 / −1.08 **没测到用户的设计**，两处都缺：
#   收纳挑的是「堆底那张」（笨挑法），不是「对顺子没用 + 对手最想要的」；
#   **续层整个不存在** —— 模拟器里 addWardTag 只有凝水和收纳两个调用点，
#   而源码 ap-fishing.uvue 那边全套都有（它注释里写着「庄家侧没接，
#   因为什么时候值得放弃一手得先在 md-sim 里量出来」）。
#
# 这一跑补齐两样，而且**每一格都配 A/B** —— 续层默认关（PAD_ON=1 才开）。
set -u
N=${N:-20000}
cd "$(dirname "$0")/../.."

echo "################ 0. 先确认没改坏 ################"
node -e "require('./tools/md-sim/rules.js'); console.log('rules.js 加载 OK')" || exit 1
node tools/md-sim/check.js 2>&1 | tail -3
# 续层默认关，所以凝水必须跟上一轮逐位相同（0.50）——不同就是我动到了基准
echo "---- 凝水（续层关着，必须还是 0.50） ----"
node tools/md-sim/sim.js vs calm calm -n "$N" | sed -n '3,6p'

echo
echo "################ 1. 新挑法单独的效果（续层仍关着） ################"
# 跟上一轮的 −1.08（旧档）/ −2.17（bug 档）比。
# blockedAt 那个 bug 已经修了，所以这一格也是「修完之后的拢水」
echo "---- 拢水单带 ----"
node tools/md-sim/sim.js vs stow stow -n "$N" | sed -n '1,12p'
echo "---- 拢水 + 伏流 ----"
node tools/md-sim/sim.js pair stow flow -n "$N"

echo
echo "################ 2. 开续层（PAD_ON=1），扫 PAD_CAP ################"
for cap in 2 3; do
  echo "---- PAD_CAP=$cap · 只拿废牌垫 ----"
  PAD_ON=1 PAD_CAP=$cap node tools/md-sim/sim.js pair stow flow -n "$N"
done
echo "---- PAD_CAP=2 · 裸奔时拿好牌也垫（PAD_WHEN=bare） ----"
PAD_ON=1 PAD_CAP=2 PAD_WHEN=bare node tools/md-sim/sim.js pair stow flow -n "$N"

echo
echo "################ 3. 另两件顺子件 ################"
echo "---- 拢水 + 涉水（续层开） ----"
PAD_ON=1 node tools/md-sim/sim.js pair stow wade -n "$N"
echo "---- 拢水 + 漫流（续层开） ----"
PAD_ON=1 node tools/md-sim/sim.js pair stow brim -n "$N"

echo
echo "################ 4. 诊断口：验「喂分给对手」那个嫌疑 ################"
# ward.mine / ward.foe = 那一层盾是**谁收牌**时打掉的。
# foe 远大于 mine 就坐实了「对手反复钓它、白拿垫牌」。
# pad.fires/bare/waste/targets 回答「续层到底发动了几次、垫的是不是废牌」。
# stow.noIsolated = 有几次一张「孤立点数」都挑不出来（新挑法退回最深那张）
echo "---- 续层关 ----"
node tools/md-sim/proto-diag.js stow 4000
echo "---- 续层开 ----"
PAD_ON=1 node tools/md-sim/proto-diag.js stow 4000
echo "---- 续层开 · 裸奔也垫 ----"
PAD_ON=1 PAD_WHEN=bare node tools/md-sim/proto-diag.js stow 4000

echo
echo "################ 跑完 ################"
