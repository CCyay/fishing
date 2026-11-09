// 庄家强度的「不变的尺子」：白板玩家（不带技能、不开常驻技）对每张庄家卡打闯关〔2026-11-09 用户定〕
//
//   node foe-ruler/run.js                 整表（cards.tsv 全部 + base）—— 只在规则 / AI 改了之后跑
//   node foe-ruler/run.js --only s-burn-D,d07   只跑这几张（某张庄家的配装改了）
//   然后 node foe-ruler/tiers.js 分档
//
// 为什么是白板：原先的尺子是「鱼塘老板 + 闯关技能池随机抽」，池子里任何一件技能改了整表都要重跑（2026-11-09 引火一改就是）。
// 白板玩家不带技能 → 玩家侧技能怎么改都不用跑；庄家某张卡的配装改了只跑那一张；**规则 / AI 改了才整表重跑**（尺子本身是规则的一部分，免不了）。
// 换算到原来那把尺子的刻度、分档、复核都在 tiers.js（系数一次性标定，见 calibration/）。
//
// ⚠ cards.tsv 是从 draw-levels.uts 的庄家配置抄出来的（2026-11-06 那份生成逻辑没留下来）——
//   改了某张庄家的配装，**要手动改 cards.tsv 那一行**再 --only 跑它。镜魔三张（d21 / d22 / d23）不用跑：tiers.js 不读它们的白板数（见那边 FIXED）。
// 每次跑完写 data/STAMP：当时 rules.js / ai.js / campaign.js 的 md5。tiers.js 发现跟现在不一样会提醒 —— 不一样就说明规则 / AI 动过，该整表重跑了
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process')
const dir = __dirname, sim = path.join(dir, '..'), data = path.join(dir, 'data')
const md5 = f => crypto.createHash('md5').update(fs.readFileSync(path.join(sim, f))).digest('hex').slice(0, 12)
const onlyAt = process.argv.indexOf('--only')
const only = onlyAt >= 0 ? process.argv[onlyAt + 1].split(',') : null
const jobs = []
if (!only || only.indexOf('base') >= 0) jobs.push({ id: 'base', env: {} })
for (const l of fs.readFileSync(path.join(dir, 'cards.tsv'), 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue
  const [id, js] = l.split('\t')
  if (only && only.indexOf(id) < 0) continue
  jobs.push({ id, env: { FOE_PROBE: js, FOE_PROBE_LEVELS: '2,3,4,5,6,7,8,9,10,11,12' } })
}
if (only && jobs.length !== only.length) throw new Error('cards.tsv 里查不到：' + only.filter(id => id !== 'base' && !jobs.some(j => j.id === id)).join(','))
const N = 12
let next = 0, running = 0, done = 0
function launch() {
  while (running < N && next < jobs.length) {
    const j = jobs[next++]
    running++
    const out = fs.openSync(path.join(data, j.id + '.txt'), 'w')
    const p = spawn(process.execPath, ['campaign.js', '-n', '3000'], {
      cwd: sim, stdio: ['ignore', out, out],
      env: Object.assign({}, process.env, { PLAYER_ROLE: 'pond', PLAYER_FIXED: ',' }, j.env)
    })
    p.on('exit', code => {
      fs.closeSync(out); running--; done++
      console.log(done + '/' + jobs.length + ' ' + j.id + (code ? ' 退出码 ' + code : ''))
      if (done === jobs.length) {
        const stamp = { date: new Date().toISOString().slice(0, 10), rules: md5('rules.js'), ai: md5('ai.js'), campaign: md5('campaign.js'), only: only || 'all' }
        const f = path.join(data, 'STAMP')
        const hist = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
        fs.writeFileSync(f, hist + JSON.stringify(stamp) + '\n')
      }
      launch()
    })
  }
}
launch()
