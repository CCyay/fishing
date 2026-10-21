#!/usr/bin/env bash
# 2026-10-21 ·【映照】第三批：**教会 AI 这件技能之后重量**。
#
# ---- 为什么有这一批 ----
#
# 第二批（定稿档「可以展示」）量出 **X = 精确 +0.00**，A / K / ♣ 三个槽
# 各 20000 局，一位小数都不差。诊断口：`changed = 0.000`、
# `gainSum = 0.000`、`kept = fires`（1.768=1.768、5.248=5.248）。
#
# **那不是没接上**（`fires` 对得死死的：A 槽 23×4/52 = 1.769 ✓、
# ♣ 槽 23×12/52 = 5.308 ≈ 5.248，差的是 ♣J 不触发技能 ✓）。
# 病因在 `ai.js:310` ——
#
#   AI：      const at = R.catchStart(G, card, side, skills, false)
#             caught = G.pile.length - at + 1
#   映照：     const at = catchStart(G, card, side, skills, sink)
#             return at < 0 ? 0 : G.pile.length - at + 1
#
# **同一个公式。** 于是 AI 打出的那张永远是这个打分函数的 argmax，
# 「变成手里另一张」只能更差或者持平，一次都不会触发。
#
# 而这恰恰是这件技能的卖点：打一张**点得着槽的垃圾牌**、让它变成手里
# 最好那张的脸 —— **收成一样，但花掉的是垃圾牌，好牌还在手里**。
# 收益不在「收几张」这一维上，所以恒等于 0 是对的，真正变的是分母。
#
# 用户 10-21 定：**改 `ai.js` 的 `pickCard`**。改法两句：
#   一、能达到的收成按变完之后算（让打垃圾牌**追平**最优牌）；
#   二、收成打平时，**花掉的那张谁便宜选谁**（`spend < bestSpend`）。
#
# ---- 第 1 节是这一批的全部重量所在：**回归** ----
#
# 动 `ai.js` = 动了所有数的基准。而这一改**该是映照专属的** ——
# 没有映照时 `spend ≡ caught ≡ bestSpend`，那个 tie-break 的条件
# （`caught === bestCaught && caught < bestSpend`）**自相矛盾，永不成立**。
#
# 这是可以证的，但**证明不算数，要量**：全表 67 件（映照之外）
# 必须跟第二批**逐位相同**，`base` 六个数也是。
# 对不上就说明我那两句话漏了一条路径，**整批作废，而且连带的不只是映照**。
#
# 第二批的锚（`all -n 8000 --role lock --slot 0`）：
#   让流 +6.10 / 引火 +4.51 / 对换 +4.18 / 传火 +3.98 / 冻结 +0.87
#   / 对流 +0.17 / 涌潮 −0.32 / 拢水 −1.12
# `base`：21.8 分/局 · 后手分差 −0.07 · 守恒 43.6+2.4+6.0 = 52.0
#
# ---- 强制档那个 −1.37 **这一批之后也废了** ----
#
# AI 现在看得见「变完会更差」（`caught = pick.score` 照抄，不取 max），
# 于是它会**躲开**那些硬亏的牌。所以强制档会比 −1.37 温和得多，
# 而那个数**不能再跟新数相减** —— 它是旧 AI 下的。
# 这一批照旧跑它一格，但那是**新口径下的新数**，不是重现。
#
# 旋钮：N=局数 ND=诊断局数 NA=全表局数 J=并发 NOALL=1 跳过全表
set -u
N=${N:-20000}
ND=${ND:-4000}
NA=${NA:-8000}
J=${J:-$(nproc 2>/dev/null || echo 8)}
cd "$(dirname "$0")/../.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

pick() {
  grep -E '手里：|都插第|先手 − 后手' | head -5 \
    | sed -e 's/^ *//' -e 's/标准误/se/'
}
job() {
  local tag=$1; shift
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do wait -n 2>/dev/null || break; done
  ( env "$@" >"$TMP/$tag" 2>&1 ) &
}
show() { echo "-- $2"; [ -f "$TMP/$1" ] && cat "$TMP/$1" | pick; }

echo "################ 0. 结构 ################"
if [ "${SKIP_GATE:-0}" != "1" ]; then
  node tools/md-sim/refs.js >"$TMP/refs" 2>&1; rc_refs=$?
  node tools/md-sim/check.js >"$TMP/check" 2>&1; rc_check=$?
  tail -3 "$TMP/refs"; echo; tail -3 "$TMP/check"
  if [ $rc_refs -ne 0 ] || [ $rc_check -ne 0 ]; then
    echo; echo "!!!! 结构没过（refs=$rc_refs check=$rc_check）—— 停。"; exit 1
  fi
else
  echo "（SKIP_GATE=1，跳过）"
fi

V="node tools/md-sim/sim.js vs"
A="--role lock --slot 0"        # A 槽：点数、4 张（窄）
K="--role deepline --slot 1"    # K 槽：点数、4 张
C="--role deepline --slot 0"    # ♣ 槽：花色、13 张（宽）

job o_a  X=1 $V reflect reflect -n $N $A
job o_k  X=1 $V reflect reflect -n $N $K
job o_c  X=1 $V reflect reflect -n $N $C
job j_a  REFLECT_J=1 $V reflect reflect -n $N $A
job j_c  REFLECT_J=1 $V reflect reflect -n $N $C
job f_a  REFLECT_OPT=0 $V reflect reflect -n $N $A
job d_oa X=1 node tools/md-sim/proto-diag.js reflect $ND 0 lock
job d_oc X=1 node tools/md-sim/proto-diag.js reflect $ND 0 deepline
job d_fa REFLECT_OPT=0 node tools/md-sim/proto-diag.js reflect $ND 0 lock
if [ "${NOALL:-0}" != "1" ]; then
  job all_a X=1 node tools/md-sim/sim.js all -n $NA $A
fi
job base X=1 node tools/md-sim/sim.js base -n $N
wait

echo
echo "################ 1. 回归：动了 ai.js，别的数该一位都没变 ################"
echo "---- base ----"
[ -f "$TMP/base" ] && cat "$TMP/base"
echo
echo "〔必须是 21.8 / −0.07 / 43.6+2.4+6.0 = 52.0 ✓"
echo " base 是双方空装 —— 它变了就说明那个 tie-break 在没有映照时也说话了，"
echo " 而那意味着**全仓所有的数都废了**，不只是映照。〕"
echo
echo "---- 全表（映照之外的 67 件该跟第二批逐位相同）----"
if [ "${NOALL:-0}" != "1" ]; then
  [ -f "$TMP/all_a" ] && cat "$TMP/all_a"
else
  echo "（NOALL=1，跳过 —— ⚠ 那就没验回归，这一批的数别拿去定价）"
fi
echo
echo "〔第二批的锚：让流 +6.10 / 引火 +4.51 / 对换 +4.18 / 传火 +3.98"
echo "  / 冻结 +0.87 / 对流 +0.17 / 涌潮 −0.32 / 拢水 −1.12"
echo " ⚠ **映照那一行该从 +0.00 动起来了** —— 它要是还钉在 +0.00，"
echo "   说明 pickCard 那一段压根没进（先查 R.SK.REFLECT 有没有导出）。〕"

echo
echo "################ 2. 定稿档：可以展示 · 不能复制 J ################"
show o_a "定稿 · A 槽（点数 · 4 张）"
show o_k "定稿 · K 槽（点数 · 4 张）"
show o_c "定稿 · ♣ 槽（花色 · 13 张）"
echo
echo "〔档位：槽技能 +2.7~4.5。读 X = 两侧平均。"
echo " **♣ 那一格是定价的上界** —— 上架后玩家会往最宽的槽插它，"
echo " 而这一件没有代价（可选档把下行砍掉了），宽槽里没东西拦着它。"
echo " ⚠ 这个数仍然是**下限**：reflectPick 只按「这一手收几张」贪心，"
echo "   而 pickCard 那个 tie-break 也只用这一手的尺子量「花掉的那张」。"
echo "   真人还会算「这张留着下一手更值钱」—— 照【凝水】那条，别指望重跑变高。"
echo " 【2026-10-21 实测】A +0.51 · K +0.51 · ♣ +0.69（n=20000 · se 0.12）"
echo "   **三格全在档位之下，而 ♣ 这个上界只有档位下限的 1/4。**〕"

echo
echo "################ 3. 定稿档 + 能复制 J（量那道闸）################"
show j_a "J闸开 · A"
show j_c "J闸开 · ♣"
echo "〔跟第 2 节同槽相减 = **「不能复制 J」那道闸的价钱**。"
echo "  【2026-10-21 实测】A 1.07−0.51 = **+0.56** · ♣ 2.39−0.69 = **+1.70**。"
echo "  ♣ 那一档**闸比技能本身还值钱**（71% 的价值在闸后面）。"
echo "  ⚠ ~~要跟第 4 节的 jbest 互相印证~~ —— **那条判据是错的，当天被推翻**："
echo "    jbest 精确 0.000 而两档差这么大，而代码是对的。闸关着时贪心 AI"
echo "    摸到 J 当场就打掉（通吃 = 这把尺子的最大值），J 根本不在手里；"
echo "    闸开着是**另一条轨迹**（打垃圾牌变 J、把真 J 留在手里）。"
echo "    **开闸改的是轨迹本身，所以反事实计数跟两档 X 差不可互证。**〕"

echo
echo "################ 4. 诊断 ################"
echo "---- 定稿 · A 槽 ----"; [ -f "$TMP/d_oa" ] && cat "$TMP/d_oa"
echo; echo "---- 定稿 · ♣ 槽（13 张）----"; [ -f "$TMP/d_oc" ] && cat "$TMP/d_oc"
echo; echo "---- 强制 · A（⚠ 新口径下的新数，不是 −1.37 的重现）----"
[ -f "$TMP/d_fa" ] && cat "$TMP/d_fa"
echo
echo "〔2026-10-21 实测（定稿 A / 定稿 ♣ / 强制 A）："
echo "   changed  0.958 / 2.256 / 1.812  ✓ 明显大于 0 —— 改 pickCard 成了"
echo "   kept     0.912 / 3.448 / 0.000  ✓ 强制档恒 0（它 −1.37 的来路）"
echo "   noHand   0.000 / 0.000 / 0.000  ✓ kept+changed+noHand = fires 对上"
echo "   worse    0.000 / 0.000 / 0.173  ✓ 可选档恒 0"
echo "   fires    1.870 / 5.704 / 1.812  ✓ 从 1.768 / 5.248 涨上去了"
echo "   gainSum  2.490 / 5.718 / 2.689"
echo "   jbest    0.000 / 0.000 / 0.003"
echo
echo " ⚠⚠ **预判错了两条，而两条都是口径错，不是数错：**"
echo "   一、我写「gainSum 该接近 0」—— 实际 2.490，而同跑得分只比 base"
echo "     高 0.42。**一张「多收的牌」只兑现成 0.17 分。** 因为 gainSum 的"
echo "     对照是「同一张牌不变」，而真对照是「换一张牌打」—— 没映照时"
echo "     AI 本来就会去打那张最优的。这个口读「机制动没动」行，**读强度不行**。"
echo "   二、jbest 那条互证判据 —— 见第 3 节〕"

echo
echo "################ 5. 强制档 A（对照）################"
show f_a "强制（REFLECT_OPT=0，已被否掉的那一读）· A"
echo "〔⚠ **不要跟 −1.37 相减** —— 那是旧 AI 下的数。新 AI 看得见"
echo "  「变完会更差」（caught = pick.score 照抄不取 max），会躲开硬亏的牌，"
echo "  所以这一格该温和得多。它现在只说明一件事：**那一读照旧不如可选档**。"
echo "  【2026-10-21 实测】+0.07 / +0.25，X = **+0.16**。从负转正了，而"
echo "  0.51 − 0.16 = **+0.35 就是「可以不展示」这半句的价钱**（同跑同口径）。〕"
