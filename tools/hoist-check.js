// 查 uvue 页面 <script setup> 里「先用后声明」的顶层名字（Android 端编成 Kotlin 局部声明，不提升）
//   node tools/hoist-check.js <page.uvue> [--list]
// 输出：顶层声明数、前向引用数、函数之间的环（强连通分量，>1 个函数或自调用）
const fs = require('fs')
const file = process.argv[2]
const LIST = process.argv.includes('--list')
const src = fs.readFileSync(file, 'utf8')
const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
if (!m) throw new Error('no script')
const scriptStart = src.slice(0, m.index).split('\n').length + src.slice(m.index, m.index + m[0].indexOf('>') + 1).split('\n').length - 1
const code = m[1]

// 词法：跳过注释、字符串、模板串（模板串里的 ${} 当代码扫）
const toks = [] // {t:'id'|'p', v, line, depth, prevDot}
let i = 0, line = scriptStart, depth = 0
const n = code.length
const tplStack = []
function push(t, v) { toks.push({ t, v, line, depth }) }
while (i < n) {
  const c = code[i]
  if (c === '\n') { line++; i++; continue }
  if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue }
  if (c === '/' && code[i + 1] === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++ } i += 2; continue }
  if (c === '\'' || c === '"') { const q = c; i++; while (i < n && code[i] !== q) { if (code[i] === '\\') i++; if (code[i] === '\n') line++; i++ } i++; push('s', ''); continue }
  if (c === '`') {
    i++
    while (i < n && code[i] !== '`') {
      if (code[i] === '\\') { i += 2; continue }
      if (code[i] === '\n') line++
      if (code[i] === '$' && code[i + 1] === '{') { tplStack.push(depth); i += 2; depth++; push('p', '{'); break }
      i++
    }
    if (code[i] === '`') i++
    push('s', '')
    continue
  }
  if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === depth - 1) {
    tplStack.pop(); depth--; push('p', '}'); i++
    while (i < n && code[i] !== '`') { if (code[i] === '\\') { i += 2; continue } if (code[i] === '\n') line++; if (code[i] === '$' && code[i + 1] === '{') { tplStack.push(depth); i += 2; depth++; push('p', '{'); break } i++ }
    if (code[i] === '`') i++
    continue
  }
  if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(code[j])) j++; push('id', code.slice(i, j)); i = j; continue }
  if (/[0-9]/.test(c)) { let j = i; while (j < n && /[\w.]/.test(code[j])) j++; i = j; push('num', ''); continue }
  if (c === '{' || c === '(' || c === '[') { push('p', c); depth++; i++; continue }
  if (c === '}' || c === ')' || c === ']') { depth--; push('p', c); i++; continue }
  if (/\s/.test(c)) { i++; continue }
  push('p', c); i++
}
for (let k = 0; k < toks.length; k++) toks[k].prevDot = k > 0 && toks[k - 1].v === '.' && toks[k - 1].t === 'p'

// 顶层项：depth 0 的 function / const / let / var 开一项；其余 depth 0 语句（onLoad(...) 等）也成一项（无名）
const items = []
let cur = null
for (let k = 0; k < toks.length; k++) {
  const tk = toks[k]
  if (tk.depth === 0 && tk.t === 'id' && (tk.v === 'function' || tk.v === 'const' || tk.v === 'let' || tk.v === 'var' || tk.v === 'import' || tk.v === 'type' && toks[k + 1] && toks[k + 1].t === 'id')) {
    const nm = toks[k + 1] && toks[k + 1].t === 'id' ? toks[k + 1].v : null
    cur = { kind: tk.v, name: tk.v === 'import' ? null : nm, line: tk.line, from: k, refs: [] }
    items.push(cur)
    continue
  }
  if (tk.depth === 0 && tk.t === 'id' && cur && cur.kind !== 'stmt' && /^(onLoad|onShow|onHide|onUnload|onReady|onMounted|onUnmounted|onBeforeUnmount|onBackPress|watch|watchEffect|onPageScroll|defineExpose)$/.test(tk.v) && !(toks[k - 1] && (toks[k - 1].v === '=' ))) {
    cur = { kind: 'stmt', name: null, line: tk.line, from: k, refs: [] }
    items.push(cur)
  }
  if (cur) cur.refs.push(k)
}
const declAt = new Map()
items.forEach(function (it, idx) { if (it.name && it.kind !== 'import' && !declAt.has(it.name)) declAt.set(it.name, idx) })
let forward = 0
const fwdList = []
const edges = items.map(function () { return new Set() })
items.forEach(function (it, idx) {
  const seen = new Set()
  for (const k of it.refs) {
    const tk = toks[k]
    if (tk.t !== 'id' || tk.prevDot) continue
    if (k === it.from + 1) continue // 自己的名字
    const d = declAt.get(tk.v)
    if (d === undefined) continue
    // 对象字面量的键 `name:`（后面紧跟冒号、前面是 { 或 ,）不算
    const nx = toks[k + 1], pv = toks[k - 1]
    if (nx && nx.v === ':' && pv && (pv.v === '{' || pv.v === ',')) continue
    edges[idx].add(d)
    if (d >= idx && !seen.has(tk.v)) {
      if (d === idx && it.kind !== 'function') continue
      seen.add(tk.v); forward++
      fwdList.push({ user: it.name || ('<' + it.kind + '@' + it.line + '>'), userLine: it.line, name: tk.v, declLine: items[d].line, self: d === idx })
    }
  }
})
// Tarjan SCC
let index = 0
const idxOf = new Array(items.length).fill(-1), low = new Array(items.length).fill(0), on = new Array(items.length).fill(false), st = []
const sccs = []
function strong(v) {
  idxOf[v] = low[v] = index++; st.push(v); on[v] = true
  for (const w of edges[v]) {
    if (idxOf[w] < 0) { strong(w); low[v] = Math.min(low[v], low[w]) } else if (on[w]) low[v] = Math.min(low[v], idxOf[w])
  }
  if (low[v] === idxOf[v]) { const comp = []; let w; do { w = st.pop(); on[w] = false; comp.push(w) } while (w !== v); sccs.push(comp) }
}
for (let v = 0; v < items.length; v++) if (idxOf[v] < 0) strong(v)
const cyc = sccs.filter(function (c) { return c.length > 1 })
const selfRec = items.filter(function (it, idx) { return it.kind === 'function' && edges[idx].has(idx) }).length
console.log(file.replace(/.*[\\/]/, '') + '：顶层项 ' + items.length + '（函数 ' + items.filter(x => x.kind === 'function').length + '）· 前向引用 ' + forward + '（其中自调用 ' + fwdList.filter(x => x.self).length + '）· 环 ' + cyc.length + ' 个，最大 ' + (cyc.length ? Math.max.apply(null, cyc.map(c => c.length)) : 0) + ' 项 · 环里的项合计 ' + cyc.reduce((a, c) => a + c.length, 0))
if (LIST) {
  for (const f of fwdList) console.log('  ' + f.user + '@' + f.userLine + ' → ' + f.name + '@' + f.declLine + (f.self ? '（自调用）' : ''))
  for (const c of cyc) console.log('  环：' + c.map(v => (items[v].name || items[v].kind) + '@' + items[v].line).join(' '))
}
module.exports = { items, edges, sccs, declAt }
