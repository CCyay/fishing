#!/bin/sh
# 〈cmark〉「获得 2 个【c】标记，触发【c】标记；【b】」（用户 2026-10-29 第二稿）
#   默认            每次 +2 层、一局内累积，整堆 −层数
#   CMARK_RESET=1   每次清零再 +2（= 固定 −2，量「叠加」那一半值多少）
#   CMARK_GAIN=1    每次 +1 层
#   锚 lowcut       削水 N=2（置 0；整堆 −2；收走 0 点牌含自己 —— 不要求「另有」0 点牌）
# 口径：`one`（两侧都量 = X / D）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
for slot in "lockold 0" "lockold 3" "mirror 0"; do
  set -- $slot
  echo "######## $1 slot $2"
  node sim.js one cmark -n $N --role $1 --slot $2 | sed -n 3p
  CMARK_RESET=1 node sim.js one cmark -n $N --role $1 --slot $2 | sed -n 3p | sed 's/^/[RESET] /'
  CMARK_GAIN=1 node sim.js one cmark -n $N --role $1 --slot $2 | sed -n 3p | sed 's/^/[GAIN=1] /'
  LOW_TIDE_STEP=2 node sim.js one lowcut -n $N --role $1 --slot $2 | sed -n 3p | sed 's/^/[锚 lowcut N=2] /'
done
for slot in "3 lock" "0 mirror"; do
  set -- $slot
  for v in "" "CMARK_RESET=1"; do
    echo "diag slot $1 $2 $v: $(env $v node proto-diag.js cmark 8000 $1 $2 | grep 'cmark:')"
  done
done
# 层数上限（CMARK_CAP）两档
for cap in 4 6; do
  for slot in "lockold 3" "mirror 0"; do
    set -- $slot
    CMARK_CAP=$cap node sim.js one cmark -n $N --role $1 --slot $2 | sed -n 3p | sed "s/^/[CAP=$cap $1 $2] /"
  done
done
