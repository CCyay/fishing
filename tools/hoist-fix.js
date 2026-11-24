// 把 uvue 页面 <script setup> 的顶层声明重排成「先声明后使用」（Android 端编成 Kotlin 局部声明，不提升）。
//   node tools/hoist-fix.js <page.uvue> [--write]
// 做法：
//   1. 顶层项（function / const / let / var / type / 生命周期语句）连同它上方紧挨着的注释算一段；
//   2. 函数之间互相调用成环的，每个环挑最少的几个函数加「前置引用」：
//        let fwdX : ((参数) => 返回) | null = null      （放在 import 后面）
//        fwdX = X                                       （紧跟在 X 那一段后面）
//      环里别的函数调 X 改成 fwdX!(…)；
//   3. 其余按依赖拓扑排序，同等条件下保持原来的先后（只把被提前用到的往前挪）。
// 不带 --write 只报告要做什么。
const fs = require('fs')
const file = process.argv[2]
const WRITE = process.argv.includes('--write')
const src = fs.readFileSync(file, 'utf8')
const EOL = src.includes('\r\n') ? '\r\n' : '\n'
const text = src.split('\r\n').join('\n')
const m = text.match(/(<script[^>]*>)([\s\S]*?)(<\/script>)/)
const codeStart = m.index + m[1].length
const code = m[2]

// ---- 词法（带偏移）----
const toks = []
let i = 0, depth = 0
const n = code.length
const tplStack = []
function push(t, v, a, b) { toks.push({ t, v, a, b, depth }) }
function lineOf(pos) { let c = 0; for (let k = 0; k < pos; k++) if (code.charCodeAt(k) === 10) c++; return c }
while (i < n) {
  const c = code[i]
  if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue }
  if (c === '/' && code[i + 1] === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue }
  if (c === '\'' || c === '"') { const q = c, a = i; i++; while (i < n && code[i] !== q) { if (code[i] === '\\') i++; i++ } i++; push('s', '', a, i); continue }
  if (c === '`') {
    const a = i; i++
    let opened = false
    while (i < n && code[i] !== '`') {
      if (code[i] === '\\') { i += 2; continue }
      if (code[i] === '$' && code[i + 1] === '{') { tplStack.push(depth); push('p', '{', i, i + 2); i += 2; depth++; opened = true; break }
      i++
    }
    if (!opened) { i++; push('s', '', a, i) }
    continue
  }
  if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth - 1) {
    tplStack.pop(); depth--; push('p', '}', i, i + 1); i++
    let opened = false
    while (i < n && code[i] !== '`') { if (code[i] === '\\') { i += 2; continue } if (code[i] === '$' && code[i + 1] === '{') { tplStack.push(depth); push('p', '{', i, i + 2); i += 2; depth++; opened = true; break } i++ }
    if (!opened) i++
    continue
  }
  if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(code[j])) j++; push('id', code.slice(i, j), i, j); i = j; continue }
  if (/[0-9]/.test(c)) { let j = i; while (j < n && /[\w.]/.test(code[j])) j++; push('num', '', i, j); i = j; continue }
  if (c === '{' || c === '(' || c === '[') { push('p', c, i, i + 1); depth++; i++; continue }
  if (c === '}' || c === ')' || c === ']') { depth--; push('p', c, i, i + 1); i++; continue }
  if (/\s/.test(c)) { i++; continue }
  push('p', c, i, i + 1); i++
}
if (depth !== 0) throw new Error('括号没配平：' + depth)
for (let k = 0; k < toks.length; k++) toks[k].prevDot = k > 0 && toks[k - 1].t === 'p' && toks[k - 1].v === '.'

// ---- 顶层项 ----
const LIFE = /^(onLoad|onShow|onHide|onUnload|onReady|onMounted|onUnmounted|onBeforeUnmount|onBackPress|watch|watchEffect|onPageScroll|defineExpose|onResize)$/
const items = []
let cur = null
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k]
  const isDecl = tk.depth === 0 && tk.t === 'id' && (tk.v === 'function' || tk.v === 'const' || tk.v === 'let' || tk.v === 'var' || tk.v === 'import' || (tk.v === 'type' && toks[k + 1] && toks[k + 1].t === 'id' && toks[k + 2] && toks[k + 2].v === '='))
  const isLife = !isDecl && tk.depth === 0 && tk.t === 'id' && LIFE.test(tk.v) && !(toks[k - 1] && toks[k - 1].v === '=') && toks[k + 1] && toks[k + 1].v === '('
  if (isDecl || isLife) {
    const nm = isDecl && tk.v !== 'import' && toks[k + 1] && toks[k + 1].t === 'id' ? toks[k + 1].v : null
    cur = { kind: isLife ? 'stmt' : tk.v, name: nm, from: k, to: k }
    items.push(cur)
  }
  if (cur) cur.to = k
}
// 关键字必须是那一行的第一个记号（否则切不开）
for (const it of items) {
  const a = toks[it.from].a
  const ls = code.lastIndexOf('\n', a - 1) + 1
  if (code.slice(ls, a).trim() !== '') throw new Error('顶层项不在行首：第 ' + (lineOf(a) + 1) + ' 行 ' + it.name)
}
const firstMovable = items.findIndex(function (it) { return it.kind !== 'import' })
const declAt = new Map()
items.forEach(function (it, idx) { if (it.name && !declAt.has(it.name)) declAt.set(it.name, idx) })

// 引用：idx → 它用到的项（以及每次引用的记号位置）
const refTok = items.map(function () { return new Map() }) // d → [token idx]
items.forEach(function (it, idx) {
  if (it.kind === 'import') return
  for (let k = it.from; k <= it.to; k++) {
    const tk = toks[k]
    if (tk.t !== 'id' || tk.prevDot) continue
    if (k === it.from + 1) continue
    const d = declAt.get(tk.v)
    if (d === undefined || d === idx) continue
    if (items[d].kind === 'import') continue
    const nx = toks[k + 1], pv = toks[k - 1]
    if (nx && nx.v === ':' && pv && (pv.v === '{' || pv.v === ',')) continue
    if (!refTok[idx].has(d)) refTok[idx].set(d, [])
    refTok[idx].get(d).push(k)
  }
})
const edges = refTok.map(function (mp) { return new Set(mp.keys()) })

// ---- SCC ----
function sccOf(adj, nodes) {
  let index = 0
  const idxOf = new Map(), low = new Map(), on = new Set(), st = [], out = []
  function strong(v) {
    idxOf.set(v, index); low.set(v, index); index++; st.push(v); on.add(v)
    for (const w of adj(v)) {
      if (!nodes.has(w)) continue
      if (!idxOf.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))) } else if (on.has(w)) low.set(v, Math.min(low.get(v), idxOf.get(w)))
    }
    if (low.get(v) === idxOf.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w) } while (w !== v); out.push(comp) }
  }
  for (const v of nodes) if (!idxOf.has(v)) strong(v)
  return out
}
const all = new Set(items.map(function (_, k) { return k }))
const cut = new Set() // 「caller→callee」去掉的边：key = caller + '>' + callee
const picked = [] // 加前置引用的函数
function liveAdj(v) { return [...edges[v]].filter(function (w) { return !cut.has(v + '>' + w) }) }
for (;;) {
  const comps = sccOf(liveAdj, all).filter(function (c) { return c.length > 1 })
  if (comps.length === 0) break
  for (const comp of comps) {
    const set = new Set(comp)
    let best = -1, score = -1
    for (const v of comp) {
      if (items[v].kind !== 'function') continue
      let indeg = 0, outdeg = 0
      for (const u of comp) if (liveAdj(u).includes(v)) indeg++
      outdeg = liveAdj(v).filter(function (w) { return set.has(w) }).length
      if (indeg * outdeg > score) { score = indeg * outdeg; best = v }
    }
    if (best < 0) throw new Error('环里没有函数：' + comp.map(v => items[v].name).join(','))
    if (!picked.includes(best)) picked.push(best)
    for (const u of comp) if (liveAdj(u).includes(best)) cut.add(u + '>' + best)
  }
}

// ---- 拓扑排序（同等条件按原序）----
const order = []
const placed = new Set()
const deps = items.map(function (_, v) { return liveAdj(v).filter(function (w) { return w !== v && items[w].kind !== 'import' }) })
const movable = items.map(function (_, k) { return k }).filter(function (k) { return items[k].kind !== 'import' })
for (const k of items.keys()) if (items[k].kind === 'import') placed.add(k)
while (order.length < movable.length) {
  let pick = -1
  for (const v of movable) { if (placed.has(v)) continue; if (deps[v].every(function (w) { return placed.has(w) })) { pick = v; break } }
  if (pick < 0) throw new Error('拓扑排序卡住（还有环）')
  order.push(pick); placed.add(pick)
}

// ---- 段的边界（含上方紧挨着的注释 / 空行）----
const lines = code.split('\n')
const lineStart = []
{ let p = 0; for (const l of lines) { lineStart.push(p); p += l.length + 1 } }
function segStartLine(idx) {
  let ln = lineOf(toks[items[idx].from].a)
  const prevEnd = idx > 0 ? lineOf(toks[items[idx - 1].to].b - 1) : -1
  while (ln - 1 > prevEnd && /^\s*(\/\/.*)?$/.test(lines[ln - 1])) ln--
  // 前面紧挨着的空行留在上一段末尾，注释块整体跟着走
  while (ln < lineOf(toks[items[idx].from].a) && /^\s*$/.test(lines[ln])) ln++
  return ln
}
const segStart = items.map(function (_, k) { return segStartLine(k) })
function segText(idx) {
  const a = lineStart[segStart[idx]]
  const b = idx + 1 < items.length ? lineStart[segStart[idx + 1]] : code.length
  return { a, b }
}

// ---- 改写调用点 ----
const fwdName = new Map(picked.map(function (v) { return [v, 'fwd' + items[v].name.charAt(0).toUpperCase() + items[v].name.slice(1)] }))
const edits = [] // {a, b, s}
for (const key of cut) {
  const [u, v] = key.split('>').map(Number)
  for (const k of refTok[u].get(v) || []) edits.push({ a: toks[k].a, b: toks[k].b, s: fwdName.get(v) + '!' })
}
edits.sort(function (x, y) { return x.a - y.a })
function applyEdits(a, b) {
  let out = '', p = a
  for (const e of edits) { if (e.a < a || e.a >= b) continue; out += code.slice(p, e.a) + e.s; p = e.b }
  return out + code.slice(p, b)
}

// ---- 前置引用的类型（照函数签名抄）----
function sigOf(v) {
  const it = items[v]
  let k = it.from + 2 // '('
  if (toks[k].v !== '(') throw new Error(it.name + ' 签名解析失败')
  let d = 0, close = -1
  for (let q = k; q <= it.to; q++) { if (toks[q].v === '(') d++; if (toks[q].v === ')') { d--; if (d === 0) { close = q; break } } }
  const params = code.slice(toks[k].a, toks[close].b).replace(/\s+/g, ' ')
  let body = close + 1
  while (body <= it.to && !(toks[body].v === '{' && toks[body].depth === 0)) body++
  let ret = 'void'
  if (toks[close + 1].v === ':') ret = code.slice(toks[close + 2].a, toks[body].a).trim().replace(/\s+/g, ' ')
  if (/[?=]/.test(params.replace(/=>/g, ''))) throw new Error(it.name + ' 有可选 / 默认参数，前置引用的类型抄不了：' + params)
  return '(' + params + ' => ' + ret + ')'
}

// ---- 拼出来 ----
const headEnd = lineStart[segStart[firstMovable]]
let out = code.slice(0, headEnd)
if (picked.length > 0) {
  out += '  // 〔2026-11-24 · Android 云打包〕Kotlin 不提升 setup 里的函数声明：下面这几个函数跟别的函数互相调用成环，\n'
  out += '  //   环里的调用改走这几个前置引用（每个函数定义完紧接着赋值）。重排 / 改写是 tools/hoist-fix.js 做的，查漏用 tools/hoist-check.js\n'
  for (const v of picked) out += '  let ' + fwdName.get(v) + ' : ' + sigOf(v) + ' | null = null\n'
  out += '\n'
}
for (const v of order) {
  const s = segText(v)
  let t = applyEdits(s.a, s.b)
  if (fwdName.has(v)) { if (!t.endsWith('\n')) t += '\n'; t += '  ' + fwdName.get(v) + ' = ' + items[v].name + '\n' }
  out += t
}
const moved = order.filter(function (v, k) { return v !== movable[k] }).length
console.log(file.replace(/.*[\\/]/, '') + '：顶层项 ' + items.length + ' · 去掉的环边 ' + cut.size + ' · 前置引用 ' + picked.length + '（' + picked.map(v => items[v].name).join(' / ') + '）· 改写调用点 ' + edits.length + ' · 位置变了的项 ' + moved)
for (const v of picked) console.log('  ' + fwdName.get(v) + ' : ' + sigOf(v))
// 守恒：重排前后字符数（扣掉改写和新增）应该对得上
const added = out.length - code.length
if (WRITE) {
  const result = text.slice(0, codeStart) + out + text.slice(codeStart + code.length)
  fs.writeFileSync(file, result.split('\n').join(EOL))
  console.log('  已写回（字符数 ' + (added >= 0 ? '+' : '') + added + '）')
} else console.log('  （没写，字符数会 ' + (added >= 0 ? '+' : '') + added + '）')
