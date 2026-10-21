// 一次性工具：把《摸打钓鱼-实测数据台账.md》的第四节（技能 X/D，5690 行）
// 整体搬到《摸打钓鱼-实测数据台账-归档.md》，主台账留带行号的索引。
// 一字不删 —— 搬运，不是删除。
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const SRC = path.join(ROOT, '摸打钓鱼-实测数据台账.md')
const ARCH = path.join(ROOT, '摸打钓鱼-实测数据台账-归档.md')

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/)

// 找第四节和第五节的边界（1-indexed 行号）
let s4 = -1, s5 = -1
lines.forEach((l, i) => {
  if (l.startsWith('## 四、')) s4 = i + 1
  if (l.startsWith('## 五、')) s5 = i + 1
})
if (s4 < 0 || s5 < 0) throw new Error('找不到第四 / 第五节：s4=' + s4 + ' s5=' + s5)
console.log('第四节 ' + s4 + ' .. ' + (s5 - 1) + '（' + (s5 - s4) + ' 行）')

const head = lines.slice(0, s4 - 1)        // 1 .. s4-1
const body = lines.slice(s4 - 1, s5 - 1)   // 第四节全文（含它的 ## 标题）
const tail = lines.slice(s5 - 1)           // 第五节起到结尾

// —— 归档文件 ——
const archHead = [
  '# 摸打钓鱼 · 实测数据台账 · 归档（技能 X / D 的全部原始记录）',
  '',
  '> 这是《摸打钓鱼-实测数据台账.md》原第四节的**全文搬迁**，一字未删。',
  '> 2026-10-21 拆出来的理由：主台账 6031 行 / 410KB，每次读都要很久，',
  '> 而这一节占 94%，里面大部分是**判废原型的论证**和**历史复盘** —— 查得到就行，不必每次读。',
  '>',
  '> **规则档 / 作废公告 / 基线 / 现行速查表在主台账**。读这儿的任何一个数之前，',
  '> **先回主台账看作废公告** —— 这儿的数自带标签，但「哪些跟着废了」记在那边。',
  '',
  '---',
  ''
]
fs.writeFileSync(ARCH, archHead.concat(body).join('\n') + '\n', 'utf8')
const archOffset = archHead.length  // 归档里，body 第 k 行（0-based）的行号 = archOffset + k + 1

// —— 索引（自动从 ### 标题生成，带归档行号）——
const idx = []
body.forEach((l, k) => {
  if (l.startsWith('### ')) {
    idx.push({ line: archOffset + k + 1, title: l.slice(4).trim() })
  }
})
console.log('索引 ' + idx.length + ' 条')

const index = [
  '## 四、技能 X / D —— **全文已移到《摸打钓鱼-实测数据台账-归档.md》**',
  '',
  '> 原来这一节 5690 行（整份台账的 94%），每次读台账都要先翻过它。',
  '> 2026-10-21 整节搬到归档文件，**一字未删**。下面是索引，行号指归档文件。',
  '> 现行上架件的数看上面那张速查表就够了；要口径、要错法复盘、要判废原型的全过程，再去归档。',
  '',
  '| 归档行 | 那一节记的是什么 |',
  '|---|---|'
].concat(idx.map(e => '| ' + e.line + ' | ' + e.title.replace(/\|/g, '\\|') + ' |'))
  .concat([''])

fs.writeFileSync(SRC, head.concat(index, tail).join('\n') + '\n', 'utf8')

const now = fs.readFileSync(SRC, 'utf8').split(/\r?\n/).length
console.log('主台账 ' + lines.length + ' → ' + now + ' 行')
console.log('归档   ' + (archHead.length + body.length) + ' 行')
