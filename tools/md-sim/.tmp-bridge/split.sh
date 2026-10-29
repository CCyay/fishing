#!/bin/sh
# 一次性脚本：把《摸打钓鱼-技能与关卡设计.md》按行区间拆成「正文」和「归档」两份。
# 2026-10-28 建，跑完就可以删。
set -e
cd "$(dirname "$0")/../../.."
DOC="摸打钓鱼-技能与关卡设计.md"
ARC="摸打钓鱼-技能与关卡设计-归档.md"
B="tools/md-sim/.tmp-bridge"
SRC="$B/src.lf"

cp "$DOC" "$B/backup.md"
tr -d '\r' < "$DOC" > "$SRC"
echo "原文行数: $(wc -l < "$SRC")"

g() { sed -n "$1,$2p" "$SRC"; }

{
  cat "$B/head.md"
  g 52 172
  cat "$B/b0.md"
  g 213 291
  cat "$B/b1.md"
  g 1308 1656
  cat "$B/b2.md"
  g 1788 1868
  cat "$B/b3.md"
  g 2400 2567
  cat "$B/b4.md"
  g 2736 2957
  cat "$B/b5.md"
  g 3348 3397
  cat "$B/b6a.md"
  g 3460 3543
  cat "$B/b6b.md"
  g 3670 3696
  cat "$B/b6c.md"
  g 3714 4444
  cat "$B/b7.md"
  g 5227 6281
  cat "$B/b8.md"
  g 6624 6853
  cat "$B/b9.md"
  g 7108 7351
  cat "$B/b10.md"
  g 7388 7520
} > "$B/keep.lf"

{
  cat "$B/arc-head.md"
  g 173 212
  printf '\n---\n\n'
  g 292 1307
  printf '\n---\n\n'
  g 1657 1787
  printf '\n---\n\n'
  g 1869 2399
  printf '\n---\n\n'
  g 2568 2735
  printf '\n---\n\n'
  g 2958 3347
  printf '\n---\n\n'
  g 3398 3459
  printf '\n---\n\n'
  g 3544 3669
  printf '\n---\n\n'
  g 3697 3713
  printf '\n---\n\n'
  g 4445 5226
  printf '\n---\n\n'
  g 6282 6623
  printf '\n---\n\n'
  g 6854 7107
  printf '\n---\n\n'
  g 7352 7387
} > "$B/arc.lf"

sed 's/$/\r/' "$B/keep.lf" > "$DOC"
sed 's/$/\r/' "$B/arc.lf"  > "$ARC"

echo "正文行数: $(wc -l < "$DOC")"
echo "归档行数: $(wc -l < "$ARC")"
