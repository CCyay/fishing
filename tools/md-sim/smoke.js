// 冒烟：SKILLS 表里每一件（含原型）都真开几局，只抓「跑到就崩」的错〔2026-11-10〕。
//
//   node smoke.js            每件 × 两个槽（江口闸官·旧 A 槽、镜湖占卜师 ♥ 槽）× 双方都带 × 4 局
//   node smoke.js <key>...   只跑这几件
//
// 为什么要它：check.js 查的是规则层不变量，**不会把每件技能都跑一遍** —— 2026-11-10 传顺换效果时
// protoOnLand 里写了个不存在的变量 `played`，check.js 全过，到正式量 20000 局才 ReferenceError。
// 那类错只要这件技能真发动一次就会炸，几局就够抓到。
// 只管「崩没崩」，不管数对不对（数对不对是 anchors.js 的事）。
const R = require('./rules.js')
const AI = require('./ai.js')

const ROLES = [['lockold', 0], ['mirror', 0]]
const GAMES = 4
const only = process.argv.slice(2)

let bad = 0
let ran = 0
const t0 = Date.now()
for (let i = 0; i < R.SKILLS.length; i++) {
  const key = R.SKILLS[i] && R.SKILLS[i].key
  if (!key) continue
  if (only.length > 0 && only.indexOf(key) < 0) continue
  for (const [roleKey, slot] of ROLES) {
    const role = R.roleIndexOf(roleKey)
    if (role < 0) continue
    let err = null
    for (let g = 0; g < GAMES && !err; g++) {
      try {
        const lo = R.kitWithOne(role, slot, i)
        R.playGame({ rng: R.makeRng(1 + g), mine: lo, foe: R.kitWithOne(role, slot, i), mineSmart: true, foeSmart: true, myRole: role, foeRole: role, fixFirst: R.FOE }, AI)
      } catch (e) {
        err = e
      }
    }
    ran++
    if (err) {
      bad++
      const at = (err.stack || '').split('\n').find(function (l) { return /rules\.js|ai\.js/.test(l) }) || ''
      console.log('✗ ' + key + '（' + (R.SKILLS[i].name || '') + '）@ ' + roleKey + ' 槽 ' + slot + '：' + String(err.message).split('\n')[0] + '\n    ' + at.trim())
    }
  }
}
console.log((bad === 0 ? '✓ ' : '✗ ') + ran + ' 格（' + (only.length > 0 ? only.length : R.SKILLS.length) + ' 件 × ' + ROLES.length + ' 槽 × ' + GAMES + ' 局）里 ' + bad + ' 格崩了 · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒')
process.exit(bad === 0 ? 0 : 1)
