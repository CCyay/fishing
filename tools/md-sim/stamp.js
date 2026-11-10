// 代码指纹〔2026-11-10〕：每次跑完在输出**最后**印一行「这批数是哪一版代码、开了哪些旋钮跑的」。
//
// 为什么要它：量一批数要在台账里记 md5 + 旋钮，原先全靠手抄 —— 副本一多（一个会话里开了二三十份）就记混；
// 另一个会话同时在改 rules.js 时，同一条命令前后两次跑的可能不是同一版代码。
// 印在**最后**而不是最前：sim.js 的输出有人按行号读（`sed -n 3p` 取 X 那一行之类），往前插一行会把它们全挪位。
//
// 旋钮只列「这次跑设了的」：从 rules.js / ai.js / sim.js 里扫出所有 `process.env.XXX`，跟当前环境取交集。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function md5Of(file) {
  return crypto.createHash('md5').update(fs.readFileSync(path.join(__dirname, file))).digest('hex').slice(0, 8)
}

function knobsSet() {
  const names = new Set()
  for (const f of ['rules.js', 'ai.js', 'sim.js', 'campaign.js']) {
    const p = path.join(__dirname, f)
    if (!fs.existsSync(p)) continue
    const src = fs.readFileSync(p, 'utf8')
    const re = /process\.env\.([A-Z][A-Z0-9_]*)/g
    let m
    while ((m = re.exec(src)) !== null) names.add(m[1])
  }
  const out = []
  for (const k of Array.from(names).sort()) {
    if (process.env[k] !== undefined) out.push(k + '=' + process.env[k])
  }
  return out
}

function stampLine() {
  const knobs = knobsSet()
  return '—— 代码指纹：rules.js ' + md5Of('rules.js') + ' · ai.js ' + md5Of('ai.js')
    + ' · 旋钮：' + (knobs.length > 0 ? knobs.join(' ') : '全默认')
}

// 进程退出时印（sim.js 的命令都是同步跑完的，exit 时输出已经全出去了）
function printOnExit() {
  process.on('exit', function () { console.log('\n' + stampLine()) })
}

module.exports = { md5Of, knobsSet, stampLine, printOnExit }
