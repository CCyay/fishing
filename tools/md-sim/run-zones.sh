#!/bin/sh
# 用户 2026-10-26 要评价的两件〔原型，没上架〕
#
# 原话：「技能评价：
#   堆牌，1张手牌带上【21匹配】；
#   查看对方手牌，选择1张加入上牌区；」
# 追问后确认第二件是**对方上牌区**（逼他下一手出这张）。
#
# ---- 这一批的好处：两件**都带同批锚**，而且锚是已上架的件 ----
#
# 〈heapdraft〉=【堆牌2】+ 1 张手牌带上【21 匹配】
#   〔原文写的是「【堆牌】1 层」—— 2026-10-28 用户删了层级概念
#     （「堆牌 一次就是1张」），旧的「1 层」= 现在的「堆牌2」，行为没变〕
#   后半句跟【零递】（`zerodraft`，已上架 100）**一字不差**，
#   差的只有前半句（零递是「置 0」）。所以
#     heapdraft − zerodraft = 「置 0 换成堆牌」值几分
#   再配上 `one heap`（机制本体 +2.21）就能拆开「堆牌本身」和「堆牌 × 21 匹配」。
#
# 〔〈boardgive〉那一半（查看对方手牌，选 1 张加入**对方的**上牌区）
#   **2026-10-27 上架成【顶钩】、当天删了**（R5 下 X −1.14），
#   所以下面「乙」那一组连同它的锚④ 一起撤了 —— 现在模拟器里没有
#   `boardgive` 这个 key，留着跑只会让 `skAt` 记一笔警告然后静默插空槽。
#
#   同批锚那条判据站住了：正是跟【压舱】同口径相减才看清
#   「洗回牌库」换成「按在他下一手上」是**掉 2.5 分**，不是加分。〕
#
# 口径：`vs X X` / `one X` 走 `measureBoth` —— 双方同角色、各插同一个槽、
#   两侧都量，报 **X**（两侧平均）+ **D**（两侧之差的一半）。
#   **这一批可以直接跟全表（`all`）相减**；跟 `proto-diag` 那批单侧 `back` 不能。
#   默认槽 = 江口闸官 A 槽（`--role lock --slot 0`），不带常驻技。
#
# ⚠ **读数顺序是硬规矩**（诊断口先于分）：
#   〈heapdraft〉 `staged/fires`（该 ≈ 2）→ `flushes/fires`（该 ≈ 1）
#                → `hits/flushed`（损耗面）→ **`freshSum/gotSum`**（这一批新加的那一列：
#                  21 匹配吃到的那一段里有几张是自己刚铺下去的）→ 最后才看分
cd "$(dirname "$0")/../.." || exit 1
N=${N:-20000}

A="--role lock --slot 0"   # 江口闸官 A 槽（零递 2.88 / 压舱 1.97 那一格）
K="--role pond --slot 2"   # 鱼塘老板 K 槽（零递 3.02 那一格）

run() {                       # run <标题> <命令…>
  echo ""
  echo "============== $1 =============="
  shift
  # ⚠ **不截断。** `printHeapDiag()` 挂在 `cmdVs` 的**末尾**，
  #   `sed -n '1,N p'` 那一套正好会把它切掉 —— 而这一批最该先读的就是它
  #   （run-heap.sh 那次就是收窄到 14 行把诊断标题卡掉，看上去像机制没接上）
  "$@" 2>&1
}

# ---------- 锚：这一版代码上的三件现成的（**同一批**，所以下面减得动）----------
run "锚① 零递 zerodraft · A 槽（现表 +2.88，该复现）" \
  node tools/md-sim/sim.js vs zerodraft zerodraft -n "$N" $A
run "锚② 零递 zerodraft · K 槽（现表 +3.02，该复现）" \
  node tools/md-sim/sim.js vs zerodraft zerodraft -n "$N" $K
run "锚③ 堆牌机制本体 heap · A 槽（现表 +2.21，该复现）" \
  node tools/md-sim/sim.js one heap -n "$N" $A
# 〔锚④（压舱 press）跟「乙」那一组一起撤了 —— 它在这儿只是〈boardgive〉
#   的同批锚。⚠ 顺带记一笔：那一行写的 +1.97 是 **R4** 的数，
#   R5 下压舱是 **+1.36**（全技能速查）。上面三个锚的 2.88 / 3.02 / 2.21
#   **同样是 R4 的**，这个脚本整份都还没在 R5 下重跑过〕

# ---------- 甲、〈heapdraft〉----------
run "甲① heapdraft · A 槽" \
  node tools/md-sim/sim.js vs heapdraft heapdraft -n "$N" $A
run "甲② heapdraft · K 槽" \
  node tools/md-sim/sim.js vs heapdraft heapdraft -n "$N" $K
# 幅度那一维：**堆牌4**（旧叫法「2 层」）。只在 A 槽跑一格，看它单不单调
run "甲③ heapdraft · A 槽 · HEAP_N=4（= 堆牌4，一次铺 4 张）" \
  env HEAP_N=4 node tools/md-sim/sim.js vs heapdraft heapdraft -n "$N" $A

echo ""
echo "---- 收 N 分布 ----"
echo "⚠ 下面这两行的立意是 **R4 的**（档位 2/3 → 1 分、4/5 → 4 分、6+ → 12 分）："
echo "「heapdraft 那条线值不值钱，全看它有没有**跨出 1 分档**」。"
echo "**R5 是张 = 分，没有档位了** —— 收 N 分布仍然有用（它直接就是分布），"
echo "但「跨档」那个判据在 R5 下不存在，别照着读。"
run "甲④ heapdraft · A 槽 · 收 N 分布" \
  env CATCH_CURVE=1 node tools/md-sim/sim.js one heapdraft -n "$N" $A
run "锚⑤ zerodraft · A 槽 · 收 N 分布（同批对照）" \
  env CATCH_CURVE=1 node tools/md-sim/sim.js one zerodraft -n "$N" $A
