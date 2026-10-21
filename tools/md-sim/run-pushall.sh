#!/bin/sh
# 【常涌】（原型）：任何一方出牌后推 EVERY_N 张。
#
# 口径 `role`（**不对称** —— 我带整张卡、对手完全不带）。
# 这件必须用不对称口径：它改局面长度，而 `all` / `vs X X` 下双方都缩短，
# 那会把效果掩盖掉（台账第五条「口径掩盖了它」那一类）。
#
# 零点是 `EVERY_ON=off`（同一张卡、同槽、同插件、同种子），
# 所以每一格减掉 off 那一行就是**这件常驻技的纯值**。
#
# 矩阵把两笔账分开：
#   both / foe / me  →  判据一（符号由「下一个出牌的是谁」决定）
#   N=1 / N=2        →  判据二（恰好偶数张；1 是奇数，会翻牌库奇偶）
N=${N:-20000}
for on in off both foe me; do
  for k in 1 2; do
    [ "$on" = off ] && [ "$k" = 2 ] && continue   # off 档跟 N 无关，只跑一次
    echo "######## EVERY_ON=$on EVERY_N=$k ########"
    EVERY_ON=$on EVERY_N=$k node tools/md-sim/sim.js role pushman --n "$N" 2>&1 \
      | grep -E "对照|胜率|一局共推|撞点数|双方出牌"
    echo
  done
done
