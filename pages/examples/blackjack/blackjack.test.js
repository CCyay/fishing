const HOME_PATH = '/pages/examples/blackjack/home'
const LEVELS_PATH = '/pages/examples/blackjack/levels'
const DECK_PATH = '/pages/examples/blackjack/deck-editor'
const SHOP_PATH = '/pages/examples/blackjack/shop'
const TABLE_PATH = '/pages/examples/blackjack/fishing'

// 钓鱼出牌对战：首页入口、关卡、盖章、商店、一局对战的流转。
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

  // 走一手：点一张手牌打出，再处理两种可能拦下来的确认。
  // 一是这张牌能算成好几个数、按哪个落钓得不一样深，弹候选条；
  // 二是空堆上打 J，问你是不是真要白扔一张王牌 —— 测试里一律照打，
  // 这样每次调用都必定推进一个回合，循环不会空转
  const playOnce = async () => {
    const hand = await page.$('#bj-hand-0')
    if (hand !== null) {
      await hand.tap()
      await page.waitFor(200)
    }
    const pick = await page.$('#bj-value-0')
    if (pick !== null) {
      await pick.tap()
      return
    }
    const yes = await page.$('#bj-confirm-yes')
    if (yes !== null) {
      await yes.tap()
    }
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

    // 一关没打过，四种自选券都是 0；开局的本钱是 4 张普通随机券
    expect(await textOf('#bj-home-tickets')).toBe('0/0/0/0')
    expect(await textOf('#bj-home-random')).toBe('4/0/0/0')
    expect(await textOf('#bj-home-refund')).toBe('0/0/0/0')
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

  it('兑换所：没解锁的贴纸换不了，自选券也还没有', async () => {
    await open(SHOP_PATH)

    // 自选券一张都还没有，要通关才发
    expect(await textOf('#bj-ticket-0')).toBe('0')

    // 一关都没打过，靠通关解锁的那些还锁着（窥探是 1 号）
    expect(await textOf('#bj-buy-sticker-peek')).toBe('未解锁')
    await tap('#bj-buy-sticker-peek')
    expect(await textOf('#bj-ticket-0')).toBe('0')

    // 免解锁的那几张开局就能换，只是缺券
    expect(await textOf('#bj-buy-sticker-compare')).toBe('缺券')
  })

  it('兑换所：开局的普通随机券必定抽到贴纸', async () => {
    await open(SHOP_PATH)

    expect(await textOf('#bj-random-ticket-0')).toBe('4')
    // 一张券必定出一张贴纸，抽池是「已解锁的 + 藏着的」
    await tap('#bj-draw-0')
    expect(await textOf('#bj-random-ticket-0')).toBe('3')
    await tap('#bj-draw-0')
    expect(await textOf('#bj-random-ticket-0')).toBe('2')
  })

  it('编辑牌组：抽到的贴纸能贴上，J 贴不上', async () => {
    await open(DECK_PATH)

    // 上一步抽到了两张，默认选中手里的第一种
    expect(await textOf('#bj-deck-stuck')).toBe('0')
    await tap('#bj-rank-0')
    expect(await textOf('#bj-deck-stuck')).toBe('1')

    // J 焊着【通吃】，贴不上别的，总数不该变
    expect(await textOf('#bj-rank-10')).toContain('通吃')
    await tap('#bj-rank-10')
    expect(await textOf('#bj-deck-stuck')).toBe('1')
  })

  it('牌桌：庄家先手，第一张牌落在空堆上钓不到东西', async () => {
    await open(TABLE_PATH)

    // 第一回合庄家先手，等它出完
    await page.waitFor(1500)
    expect(await textOf('#bj-phase')).toBe('轮到你出牌')
    // 你还一手没出
    expect(await textOf('#bj-turn')).toBe('0')
    // 庄家那张已经落堆，堆不再是空的
    expect(await textOf('#bj-pile')).not.toContain('空堆')
    // 空堆上撞不到任何数字，所以双方都还没分
    expect(await textOf('#bj-player-points')).toBe('0')
    expect(await textOf('#bj-dealer-points')).toBe('0')

    // 庄家手牌栏看得到张数，牌面扣着
    expect(await page.$('#bj-dealer-hand-0')).not.toBe(null)
    expect(await textOf('#bj-dealer-hand-0')).toBe('?')
  })

  it('出一张手牌就推进一个自己的回合', async () => {
    await open(TABLE_PATH)
    await page.waitFor(1500)

    expect(await textOf('#bj-turn')).toBe('0')
    await playOnce()
    await page.waitFor(1800)

    // 回合数不断言涨到几：庄家接着也走了一手，但那是它自己的回合
    expect(parseInt(await textOf('#bj-turn'))).toBeGreaterThanOrEqual(1)
  })

  it(
    '打满回合就结算，进过堆的牌一张都不会丢',
    async () => {
      await open(TABLE_PATH)
      const turns = parseInt(await textOf('#bj-turns-total'))

      // 双方各打 turns 手。平局会洗牌重来（最多两次），所以留足余量。
      // 每手最长是「钓牌动画 560ms + 庄家思考 700ms」，等 1400 兜得住
      for (let i = 0; i < (turns + 2) * 3; i++) {
        await page.waitFor(1400)
        if ((await textOf('#bj-phase')) === '对局结束') {
          break
        }
        await playOnce()
      }

      expect(await textOf('#bj-phase')).toBe('对局结束')
      const result = await textOf('#bj-result')
      expect(result.length).toBeGreaterThan(0)
      expect(await page.$('#bj-back')).not.toBe(null)

      // 输了就地给一个「重来」，赢了不给 —— 赢了该去下一关。
      // 认输赢看结算文案：只有输了才会说「可以改完牌组再打这一关」
      if (result.indexOf('可以改完牌组再打') >= 0) {
        expect(await page.$('#bj-retry')).not.toBe(null)
      } else {
        expect(await page.$('#bj-retry')).toBe(null)
      }

      // 双方各打 turns 手，每手一张牌进堆。这些牌最后只有三个去处：
      // 你的积分库、庄家的积分库、谁都没钓走的废牌堆。加起来必须一张不差
      const mine = parseInt(await textOf('#bj-player-points'))
      const his = parseInt(await textOf('#bj-dealer-points'))
      const waste = parseInt((await textOf('#bj-waste-toggle')).replace(/[^0-9]/g, ''))
      expect(mine + his + waste).toBe(turns * 2)
    },
    120000
  )
})
