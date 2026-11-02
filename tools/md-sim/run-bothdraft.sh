#!/bin/sh
# 〈bothdraft〉「堆牌 N，对方堆牌 N；1 张手牌带上【21 匹配】」（用户 2026-10-29 提，原话「双方推牌 N」）
# N = 1 / 2 两档 × A / K / ♥ 三槽；同批锚：零递（只贴标签）、〈heapdraft〉（堆牌 2 + 贴标签）
# A、K 两槽是用户定的「分值随不随点数变」那道筛
# 口径：`one -n 20000`（两侧都量 = X / D；「Δ胜率（两侧平均）」那行跟 all 同口径）
cd "$(dirname "$0")" || exit 1
N=${N:-20000}
mkdir -p out-bothdraft
for slot in "A lock 0" "K pond 2" "H mirror 0"; do
  set -- $slot
  for v in "1 bothdraft" "2 bothdraft" "- zerodraft" "- heapdraft"; do
    set -- $slot $v
    ( BOTHDRAFT_N=$( [ "$4" = "-" ] && echo 1 || echo $4 ) node sim.js one $5 -n $N --role $2 --slot $3 \
      | grep -E "^【|X |两侧|局长" > out-bothdraft/$1-$5-$4.txt ) &
  done
done
wait
for f in out-bothdraft/*.txt; do echo "== $f"; cat "$f"; done
