#!/bin/sh
# 2026-10-26 那一轮改动的**第一次执行验证**（删四件 + 磁钩改形状 + 死水加旋钮）。
#
# 为什么要单独一个脚本：那一轮 12 处模拟器改动 + 11 处源码改动**一次都没跑过**
#（本机 Bash 整天限流），全部只过了静态复查。台账 `2026-10-26` 那一行
# 的红字写着欠哪三样，这个脚本就是去结清它们的。
#
# 顺序是有讲究的 —— **前一步不过就别看后一步**：
#   ① 加载   语法错的话后面全是噪声
#   ② check  规则层不变量（守恒、并行数组、冰火相消）。四条 `SK_GONE` 死分支
#            要是真的复活了，最可能在这儿炸（它们动的是 held / valuesOf / refill）
#   ③ refs   引用完整性 + 表结构九项。
#            ⚠ 第①项**预期会为 `creel` 报一次** —— 常驻技满篓同名同 key 还活着，
#            那不是错。别的任何一条报警都是真问题
#   ④ base   基线六个数。这一轮**没动基础规则**，所以它该跟台账里 R4 的基线
#            逐位相同；不同就说明碰坏了公共路径（最可能是 `triggersOf` 那两条过滤）
set -e
OUT=tools/md-sim

echo "===== ① 加载 ====="
node -e "require('./$OUT/rules.js'); require('./$OUT/ai.js'); console.log('LOAD_OK')"
echo ""
echo "===== ② check.js ====="
node $OUT/check.js
echo ""
echo "===== ③ refs.js（creel 那一报是预期的）====="
node $OUT/refs.js
echo ""
echo "===== ④ sim.js base ====="
node $OUT/sim.js base
