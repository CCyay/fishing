const HOME_PATH = '/pages/examples/blackjack/home'
const LEVELS_PATH = '/pages/examples/blackjack/levels'
const DECK_PATH = '/pages/examples/blackjack/deck-editor'
const SHOP_PATH = '/pages/examples/blackjack/shop'
const TABLE_PATH = '/pages/examples/blackjack/blackjack'

// 42 点出牌对战：首页入口、关卡、盖章、商店、一局对战的流转。
// 摸牌是随机的，因此断言只覆盖与牌面无关的状态。
describe('/pages/examples/blackjack', () => {
  let page

  const open = async (path) => {
    page = await program.reLaunch(path)
    await page.waitFor('view')
    await page.waitFor(300)
  }

  const textOf = async (selector) => {
    const element = await page.$(selector)
    expect(element).not.toBe(null)
    return await element.text()
  }

  const tap = async (selector) => {
    const element = await page.$(selector)
    expect(element).not.toBe(null)
    await element.tap()
    await page.waitFor(300)
  }

  beforeAll(async () => {
    // 存档存在 storage 里，先清干净，保证每次从初始存档开始
    try {
      await program.callUniMethod('clearStorageSync')
    } catch (e) {
      // 个别平台不支持无参调用，忽略后按现有存档继续
    }
  })

  it('首页展示存档并提供四个入口', async () => {
    await open(HOME_PATH)

    // 一关没打过，四种兑换券都是 0
    expect(await textOf('#bj-home-tickets')).toBe('0/0/0/0')
    expect(await textOf('#bj-home-record')).toBe('0/0/0')
    // 一关没过，一张贴纸没贴
    expect(await textOf('#bj-home-deck')).toContain('0/10')
    expect(await textOf('#bj-home-deck')).toContain('0 张')

    expect(await page.$('#bj-enter-game')).not.toBe(null)
    expect(await page.$('#bj-choose-save')).not.toBe(null)
    expect(await page.$('#bj-edit-deck')).not.toBe(null)
    expect(await page.$('#bj-shop')).not.toBe(null)
  })

  it('关卡页共 10 关，只有第一关可挑战', async () => {
    await open(LEVELS_PATH)

    expect(await textOf('#bj-levels-cleared')).toBe('0/10')
    expect(await page.$('#bj-level-1')).not.toBe(null)
    expect(await page.$('#bj-level-10')).not.toBe(null)

    expect(await textOf('#bj-level-1')).toContain('可挑战')
    expect(await textOf('#bj-level-2')).toContain('未解锁')
  })

  it('兑换所：贴纸未解锁前换不了', async () => {
    await open(SHOP_PATH)

    // 一张券都还没有
    expect(await textOf('#bj-ticket-0')).toBe('0')

    // 一关都没打过，货架上的贴纸都还没解锁（0 号幸运是白送的，不上架）
    expect(await textOf('#bj-buy-sticker-1')).toBe('未解锁')
    await tap('#bj-buy-sticker-1')
    expect(await textOf('#bj-ticket-0')).toBe('0')
  })

  it('编辑牌组：开局自带的幸运贴纸能贴上也能撕下', async () => {
    await open(DECK_PATH)

    expect(await textOf('#bj-deck-stuck')).toBe('0')
    // 默认选中 0 号幸运，贴到 A 上
    await tap('#bj-rank-0')
    expect(await textOf('#bj-deck-stuck')).toBe('1')
    // 再点一次撕下来，贴纸退回手里
    await tap('#bj-rank-0')
    expect(await textOf('#bj-deck-stuck')).toBe('0')
  })

  it('牌桌：庄家先出牌，你出牌后进入下一回合', async () => {
    await open(TABLE_PATH)

    // 第一回合庄家先手，等它出完
    await page.waitFor(1500)
    expect(await textOf('#bj-phase')).toBe('轮到你出牌')
    expect(await textOf('#bj-turn')).toBe('1')
    expect(await textOf('#bj-dealer-board')).not.toContain('未出牌')
    expect(await textOf('#bj-player-board')).toContain('未出牌')

    // 打出第一张手牌
    await tap('#bj-hand-0')
    await page.waitFor(1500)

    // 牌留在桌上，不再是「未出牌」。
    // 点数不断言涨跌：A 会为了不爆从 11 改算 1，总分反而可能变小
    expect(await textOf('#bj-player-board')).not.toContain('未出牌')
    expect(parseInt(await textOf('#bj-player-total'))).not.toBeNaN()

    // 没有立刻分出胜负的话，回合数应该推进到 2
    if ((await textOf('#bj-phase')) !== '对局结束') {
      expect(await textOf('#bj-turn')).toBe('2')
    }
  })

  it('一直出牌不停牌，最后会爆牌判负', async () => {
    await open(TABLE_PATH)

    // 一路出牌不停牌，点数迟早超过 42。最多 30 步兜底
    for (let i = 0; i < 30; i++) {
      await page.waitFor(900)
      if ((await textOf('#bj-phase')) === '对局结束') {
        break
      }
      const hand = await page.$('#bj-hand-0')
      if (hand === null) {
        break
      }
      await hand.tap()
    }

    expect(await textOf('#bj-phase')).toBe('对局结束')
    const result = await textOf('#bj-result')
    expect(result.length).toBeGreaterThan(0)
    expect(await page.$('#bj-back')).not.toBe(null)
  })

  it('停牌按钮能用，停了之后庄家会接着打完', async () => {
    await open(TABLE_PATH)
    await page.waitFor(1500)

    // 第一次轮到自己就直接停牌
    expect(await page.$('#bj-stand')).not.toBe(null)
    await tap('#bj-stand')

    // 你停牌后庄家会一直出到它也停牌，然后结算
    for (let i = 0; i < 20; i++) {
      await page.waitFor(900)
      if ((await textOf('#bj-phase')) === '对局结束') {
        break
      }
    }
    expect(await textOf('#bj-phase')).toBe('对局结束')
  })
})
