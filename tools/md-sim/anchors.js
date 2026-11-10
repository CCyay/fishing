// 锚点自检〔2026-11-10〕：开跑一批数之前，先确认「模拟器还是上次那个模拟器」。
//
// 每格跑 `sim.js one <技能> --role <角色> --slot <槽> -n 2000`（固定种子 → 代码不变就逐位相同），
// 取输出里「后手 … 先手 … X … D …」那一行，跟 anchors.json 里存的逐字比。
//
//   node anchors.js          比对；有一格不同就报红、退出码 1
//   node anchors.js --save   把当前结果存成新基准（规则 / 默认值真改了、核过之后再存 —— 跟 fingerprint.js --save 同一个用法）
//
// 为什么要它：另一个会话同时在改 rules.js 时，旧数还能不能接着用，原先只能靠手动重跑几格锚点去碰
// （2026-11-09 那天抢牌估算、伏流、续流都被改过，三次都是锚点没对上才发现）。
// 锚点挑的是各机制族的代表 + 基线没技能那一格，红了先看是哪一族。
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const N = 2000
// 名字 · 技能 key · 角色 · 槽 · 额外旋钮
const LIST = [
  ['无关键词 · 观潮', 'tide', 'lockold', 0, {}],
  ['顺子 · 伏流', 'flow', 'lockold', 0, {}],
  ['顺子 · 石顺', 'stoneline', 'lockold', 0, {}],
  ['顺子 · 传顺', 'flowall', 'lockold', 0, {}],
  ['磁极 · 磁针', 'polefail', 'lockold', 0, {}],
  ['磁极 · 磁石', 'poledraw', 'lockold', 0, {}],
  ['正电 · 电钩', 'hook', 'lockold', 0, {}],
  ['21 匹配 · 零递', 'zerodraft', 'lockold', 0, {}],
  ['燃烧 · 野火', 'wild', 'lockold', 0, {}],
  ['结冰 · 封凌', 'lockdraw', 'lockold', 0, {}],
  ['花色 · 收色', 'hue', 'lockold', 0, {}],
  ['顺序 · 插流', 'orderins', 'lockold', 0, {}],
  ['收零 · 缩水', 'zerodrop', 'lockold', 0, {}],
  ['♥ 槽 · 伏流', 'flow', 'mirror', 0, {}],
]
const FILE = path.join(__dirname, 'anchors.json')

function runOne(item) {
  const [name, key, role, slot, env] = item
  return new Promise(function (resolve) {
    const args = [path.join(__dirname, 'sim.js'), 'one', key, '--role', role, '--slot', String(slot), '-n', String(N)]
    const child = spawn(process.execPath, args, { env: Object.assign({}, process.env, env) })
    let out = ''
    child.stdout.on('data', function (d) { out += d })
    child.stderr.on('data', function (d) { out += d })
    child.on('close', function () {
      const line = out.split(/\r?\n/).find(function (l) { return /X [+-]\d/.test(l) && /D [+-]\d/.test(l) })
      resolve({ name: name, got: line ? line.trim().replace(/\s+/g, ' ') : '（没跑出 X 那一行：' + out.split(/\r?\n/).slice(-3).join(' / ') + '）' })
    })
  })
}

async function main() {
  const save = process.argv.indexOf('--save') >= 0
  // 4 个一组并行
  const results = []
  for (let i = 0; i < LIST.length; i += 4) {
    const batch = await Promise.all(LIST.slice(i, i + 4).map(runOne))
    results.push.apply(results, batch)
  }
  if (save) {
    const obj = {}
    for (const r of results) obj[r.name] = r.got
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2) + '\n')
    console.log('存好了：' + results.length + ' 格 → anchors.json')
    for (const r of results) console.log('  ' + r.name + '  ' + r.got)
    return
  }
  if (!fs.existsSync(FILE)) {
    console.log('还没有基准 —— 先跑一次 `node anchors.js --save`')
    process.exit(1)
  }
  const base = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  let bad = 0
  for (const r of results) {
    const want = base[r.name]
    if (want === undefined) { console.log('  ? ' + r.name + '（基准里没有这一格）  ' + r.got); bad++; continue }
    if (want === r.got) console.log('  ✓ ' + r.name)
    else { console.log('  ✗ ' + r.name + '\n      基准 ' + want + '\n      现在 ' + r.got); bad++ }
  }
  console.log(bad === 0 ? '\n✓ ' + results.length + ' 格锚点全部逐位相同 —— 旧数可以接着用' :
    '\n✗ ' + bad + ' 格对不上 —— 模拟器变了。先查是哪一族、是不是有意的；是有意的就记作废公告，再 `node anchors.js --save`')
  process.exit(bad === 0 ? 0 : 1)
}
main()
