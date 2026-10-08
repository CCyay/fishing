# 摸打钓鱼 · 对局模拟器

离线跑对局、量技能强度的脚本。无依赖，`node` 直接跑。

```
node sim.js base                     跑基准（双方都没技能），对照设计文档的六个数字
node sim.js one hook                 量一件技能的分差
node sim.js one hook --level 1 --slot rank --spots 5,7,9
node sim.js all -n 40000             所有技能跑一遍，出一张表
node sim.js pair suitify suited      量两件装一起的分差（组合技的底数）
node fingerprint.js                  对一遍源码有没有动过（见下面「漂移」）
```

## 为什么有这个东西

设计文档《摸打钓鱼-技能与关卡设计.md》里那些数（「每人每局钓到约 9 次」、
「磁钩满装 +7.0」）是当初用一次性脚本跑的，**脚本没留下来**。
后来加的技能（换水起的那九件）因此一件都没校准过，价钱是照同类件抄的。

v3 的三件事都卡在这上面：七个技能校准、组合技、产金币。所以它是第 0 批。

## 它不是游戏代码的一部分

`rules.js` 和 `ai.js` 是 `pages/examples/blackjack/ap-fishing.uvue` 的**手写副本**。

为什么不复用源码：项目的 `package.json` 里 `dependencies` 是空的，没有
esbuild / tsc 能把 `.uts` 的类型注解剥掉给 node 用；而对局规则长在 `.uvue`
的 `<script>` 里，缠着 `ref` 和 `setTimeout`，抽不出来直接跑。
把规则重构成一个纯 `.uts` 模块是另一条路，但那要动那个 2285 行的页面 ——
风险远大于一个只读的副本。

副本的代价是**会过期**。所以配了 `fingerprint.js`：源码里那几个关键函数
一改，它就报出来（见文末）。

## 验收：先跑 base

规则实现忠不忠实，不靠读代码确认，靠**对数字**。`base` 跑的是「双方都没技能、
都会记牌」，对照的是设计文档第一节那张表：

| 项 | 设计文档（模拟 4 万局） |
|---|---|
| 每人每局出牌 | 26 次 |
| 每人每局钓到 | 约 9 次（出牌的 34%） |
| 每次平均收 | 2.75 张 |
| 每人每局积分 | 约 24 分 |
| J 通吃占所有钓牌 | 22% |
| 先后手 | 后手赢 57–59% |

这六个数都对得上，说明判定、回合流转、庄家策略三块都搬对了。
**对不上就先别信任何技能数据** —— 回去查 rules.js。

（「每人每局出牌 26 次」是最硬的一条：52 张牌两个人分，无技能时必须正好 26。
差了就是发牌或补牌搬错了。）

## 量技能：口径

```
node sim.js one hook
```

做法是**同一批种子跑两遍**：一遍双方空手（基线），一遍一方带技能。
两遍开局牌序一样，所以差出来的就是技能本身。报出来的分差**已经扣掉**
后手那点固有优势（基线分差，base 命令末尾也会印）。

一起报标准误 —— 一个 `+0.3 ± 0.4` 的技能和一个 `+4.1 ± 0.3` 的不是一回事。
想把标准误压到 0.1 以下，`-n` 开到 4 万。

### 跟 v2 那张表对不上是正常的

设计文档 v2 的「满装分差」是**老槽规则**算的：点数技满级管 6 个点数、
花色技满级管一整个颜色。现在点数槽是线性的（每升一级多 1 格，满级管 3 个，
见 `rankSizeOf`）。所以同一件技能现在的「满级」比那时候窄一半，
数值低下来是对的。

## 对应关系

改源码的时候照这张表找该改模拟器的哪儿。

| 模拟器 | 源码（`ap-fishing.uvue` 除外另注） |
|---|---|
| `rules.catchStart` | `catchStart`（含 sink 镜像、J、顺色、磁钩、钩顶 near） |
| `rules.playFor` | `playFor` + `finishCatch`（动画那段去掉，直接结算） |
| `rules.afterPlay` | `afterPlay`（技能顺序一字不差照搬） |
| `rules.valuesOf` / `cardVals` / `anyEquals` | 同名 |
| `rules.lowTideFor` / `floodFor` / `stirFor` / `peekFor` | 同名 |
| `rules.suitifyFor` | `suitifyFor`（染水〔优先〕，在判定之前） |
| `rules.doPickDeck` / `sinkTops` / `topCards` / `shuffleBack` | 同名 |
| `rules.refill` / `expireGuards` / `checkOver` / `passTurn` | 同名 |
| `rules.triggersOf` / `rankSizeOf` / `suitSizeOf` | `draw-skills.uts` 同名 |
| `ai.pickCard` | `foePickCard` |
| `ai.baitRisk` / `outsideCount` | 同名 |
| `ai.swapPick` / `pickDeck` / `freezePick` | `foeSwapPick` / `foePickDeck` / `foeFreezePick` |
| `ai.tideSink` | `afterPlay` 里庄家观潮那段 |

`rules.SK` 的下标必须和 `draw-skills.uts` 的 `SK_*` 一一对应 ——
那是存档里的技能编号，错位了跑的就是另一件技能。

## 没有建模的东西（看数据之前先知道）

1. **窥视、照水的情报价值**：它们只给信息。模拟里的策略**不用**对手手牌的信息
   （`ai.pickCard` 只读牌库残量，照 `foePickCard`），所以这两件跑出来接近 0。
   设计文档对窥视写的也是「只有信息，没法模拟」—— 口径一致，不是 bug。
   真要量它，得先写一个会利用情报的策略，那是另一个课题。
2. **玩家侧也是 AI**：游戏里你是人。模拟里两侧同策略 —— v2 那些基础数据
   标的就是「双方都会记牌」。
3. **商店、金币、牌组改造、关卡表**：一概不参与。模拟器只管一局之内的事。
   想跑改造过的牌组，给 `playGame` 传自定义 `deck`（`rules.makeCard` 造牌，
   `extra` 就是点数卡贴的那几个点数）。
4. **点数卡**：规则实现了（`cardVals`、见底时每个点数各自压），但默认牌组
   是干净的 52 张。
5. **庄家关底规矩（第十节）**：还没做，模拟器里也还没有挂规矩的口子。
   加法见下。
6. **「每人每局出牌 26 次」只在无技能时成立**：连竿让一方一回合打两张，
   所以带连竿那边出牌数会高过 26 —— 两人合计仍是 52。`base` 跑的是无技能，
   所以那条验收不受影响。

## 漂移

```
node fingerprint.js --save    # 第一次，或者改完模拟器之后
node fingerprint.js           # 跑数据之前对一下
```

它把源码里 50 个关键函数的正文（剥掉注释和空白）、5 个常量、技能表的 key 顺序
存成哈希。源码一动就报出来，按组列出改了哪几个 —— 然后人去核对 `rules.js`。

它**不判断**改动有没有影响结果，只回答「动过没有」。注释改了不报警。

## 要加东西的话

- **加一件技能**：`rules.SK` 加常量（下标照 `draw-skills.uts`）、`SKILLS` 表加一行、
  在 `afterPlay` 或 `catchStart` 里接上效果。`all` 会自动把它跑进表里。
- **组合技（第九节）**：在 `rules.afterPlay` 开头拿 `skills`（那就是 `triggersOf`
  返回的二元组）查一张组合表，命中就加那条效果。
  底数用 `sim.js pair A B` 先量 —— 它报的「协同」是**没有**组合技时两件技能
  互相影响的量，组合技做完再跑一遍，差额就是组合技自己的贡献。
- **庄家关底规矩（第十节）**：规矩是整局生效、不挂在牌上的，所以给 `newGame`
  的 opts 加一个 `rules: ['hardshell']`，在对应的判定点读它
  （硬壳在 `catchStart` 的命中判定、逆钩在 J 那一支、涨潮在 `refill`）。
