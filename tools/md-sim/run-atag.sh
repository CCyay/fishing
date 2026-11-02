#!/bin/sh
# 〈atag〉「【a】；1 张手牌带上【b】」（用户 2026-10-29 提）：三个槽 × 三档 + 减递同批锚
#   默认         N = 堆上带【a】的牌数（含它自己）
#   ATAG_FIX=1   N 钉死 1（对照：动态 N 那一半值不值钱）
#   ATAG_NOB=1   不贴【b】（对照：【b】那一半值多少）
# 口径：`one`（双方同角色、各插同一个槽、两侧都量 = X / D）。诊断口走 proto-diag.js（单侧）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
for slot in "lock 0" "lock 3" "mirror 0"; do
  set -- $slot
  echo "######## $1 slot $2"
  node sim.js one atag -n $N --role $1 --slot $2 | sed -n 1,3p
  ATAG_FIX=1 node sim.js one atag -n $N --role $1 --slot $2 | sed -n 1,3p | sed 's/^/[FIX=1] /'
  ATAG_NOB=1 node sim.js one atag -n $N --role $1 --slot $2 | sed -n 1,3p | sed 's/^/[NOB] /'
  node sim.js one minustag -n $N --role $1 --slot $2 | sed -n 1,3p | sed 's/^/[锚 minustag] /'
done
