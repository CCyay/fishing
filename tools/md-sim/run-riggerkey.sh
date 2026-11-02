#!/usr/bin/env bash
# 串钩手新常驻技候选：【流钥】机制挂到新底座（2 7 双装 + Q）上，五档一次量全〔2026-10-29〕
#
# 口径：
#   role  —— `sim.js role` 满配（KIT_ORDER 前 3 件），对手不带角色。新底座不撞天花板（83.5%），可直读
#   duel  —— `proto-link.js --duel riggerkey riggertwin`：两张卡同 slots / twin / 插件序，
#            只差常驻技（riggertwin 挂两色 = 代数零）⇒ 原始分差 ≈ 这件常驻技的净值
# off 档是零点 —— 应跟 riggertwin 统计上分不开（接线自检）
cd "$(dirname "$0")"
N=${N:-8000}
D=${D:-6000}
echo "== 基准：riggertwin（两色占位）"
node sim.js role riggertwin -n $N | grep -E "对照|胜率"
for K in off straight order draft suit; do
  echo
  echo "== SLOTTAG_KIND=$K"
  SLOTTAG_KIND=$K node sim.js role riggerkey -n $N | grep -E "对照|胜率"
  SLOTTAG_KIND=$K node proto-link.js $D --duel riggerkey riggertwin | grep -E "我 − 他"
done
