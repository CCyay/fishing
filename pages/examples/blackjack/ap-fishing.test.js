const MENU_PATH = '/pages/examples/blackjack/menu'
const LEVELS_PATH = '/pages/examples/blackjack/draw-levels'
const SHOP_PATH = '/pages/examples/blackjack/draw-skills'
const TABLE_PATH = '/pages/examples/blackjack/ap-fishing'

// 庄家停 0.6 秒一口气摸牌出牌，钓到牌再放 0.7 秒特效：3 秒足够轮到你
const FOE_TURN_MS = 3000

// 摸打钓鱼：首页 → 关卡页 → 对局；照排竿一轮连胜 12 关，开局没有技能。
// 摸牌是随机的，断言只看张数和相对变化，不看牌面。
describe('/pages/examples/blackjack/ap-fishing', () => {
  let page

  const textOf = async (selector) => {
    const element = await page.$(selector)
    expect(element).not.toBe(null)
    return await element.text()
  }

  beforeAll(async () => {
    try {
      await program.callUniMethod('clearStorageSync')
    } catch (e) {
      // 个别平台不支持无参调用，忽略后按现有存档继续
    }
  })

  it('首页进摸打钓鱼的关卡页，新档从第 1 关开始', async () => {
    page = await program.reLaunch(MENU_PATH)
    await page.waitFor('view')
    const entry = await page.$('#bj-pick-action')
    expect(entry).not.toBe(null)
    await entry.tap()
    await page.waitFor(500)
    page = await program.currentPage()
    expect(page.path).toBe(LEVELS_PATH.slice(1))
    expect(await textOf('#md-run')).toContain('第 1 关')
    expect(await textOf('#md-go')).toBe('挑战第 1 关')
  })

  it('商店：开局没有技能，不能买', async () => {
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    expect(await textOf('.empty')).toContain('还没有技能')
  })

  it('对局：庄家先走完一回合后轮到你，你已自动摸到第 4 张', async () => {
    page = await program.reLaunch(TABLE_PATH)
    await page.waitFor('view')
    await page.waitFor(FOE_TURN_MS)
    expect(await textOf('#ap-turn')).toContain('你的回合')
    expect(await page.$('#ap-hand-3')).not.toBe(null)
    expect(await page.$('#ap-hand-4')).toBe(null)
    // 开局没技能，技能栏是空的
    expect(await page.$('#ap-skill-0')).toBe(null)
  })
})
