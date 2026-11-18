// 2026-11-04：系列庄家（结冰 / 石墙 / 顺子 / 燃烧 / 禁咒）各档试样 × 浅滩 / 河湾 / 深海各一关（3 / 7 / 10）
const P = {
  ice: { name: '深渊魔王', rules: ['rev'], pool: ['lockcolor', 'lockdraw', 'icebomb'], S: [['lockcolor', 1, true], ['lockdraw', 1, false], ['icebomb', 1, false]] },
  stone: { name: '砌石魔像', rules: ['toll'], pool: ['stonefull', 'stonehue', 'stoneline'], S: [['stonefull', 1, true], ['stonehue', 1, false], ['stoneline', 1, false]] },
  flow: { name: '苍龙王', rules: ['rev'], pool: ['flow', 'flowall', 'flowpass'], S: [['flow', 1, true], ['flowall', 1, false], ['flowpass', 1, false]] },
  burn: { name: '炎术师', rules: ['char'], pool: ['kindle', 'wild', 'fuel'], S: [['kindle', 1, false], ['wild', 2, false], ['fuel', 1, false]] },
}
const out = []
for (const k in P) {
  const p = P[k]
  const v = { '': [], H: [[p.pool, 1, true]], D: [[p.pool, 1, false]], HD: [[p.pool, 1, true], [p.pool, 1, false]], DD: [[p.pool, 1, false], [p.pool, 1, false]], S: p.S }
  for (const s in v) out.push({ tag: k + '-' + (s || 'base'), probe: { name: p.name + s, rules: p.rules, slots: v[s] } })
}
const ban = { '': [], H: [['pinrank', 1, true]], D: [['fadepoint', 1, false]], S: [['pinrank', 1, true], ['fadepoint', 1, false]] }
for (const s in ban) out.push({ tag: 'ban-' + (s || 'base'), probe: { name: '禁咒审判官' + s, rules: ['ban'], slots: ban[s] } })
for (const j of out) console.log(j.tag + '\t' + JSON.stringify(j.probe))
