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
    // 开打的入口就是那张关卡卡片本身（原先上头那颗「挑战第 N 关」
    // 的大按钮删了，同一件事不摆两个按钮）
    expect(await page.$('#md-now')).not.toBe(null)
    expect(await textOf('.now-id')).toContain('第 1 关')
  })

  it('商店：开局没有技能，货架已上货', async () => {
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    expect(await textOf('.empty')).toContain('还没有技能')
    // 技能现在是在商店买的（不再靠过关掉），跟卡牌、点数卡混在同一栏。
    // 上什么货是摇的，所以只断言「那一栏摆满了 SHOP_CARD_COUNT 格」
    expect(await page.$('#md-card-0')).not.toBe(null)
    expect(await page.$('#md-card-3')).not.toBe(null)
    expect(await page.$('#md-card-4')).toBe(null)
    // 名额那个计数器（0/4）一直摆在抬头上
    expect(await textOf('#md-skill-own')).toContain('0/4')
    // 道具按稀有度摇，所以每一行都标了档位。上的是哪一档不能断言 ——
    // 第 1 关史诗概率只有百分之几
    const tier = await textOf('.fix-tier')
    expect(['普通', '稀有', '史诗'].some((t) => tier.indexOf(t) >= 0)).toBe(true)
    // 每一行都带一句说明（「加权」「平价」这种名字光看猜不出来）
    expect((await textOf('.goods-desc')).length).toBeGreaterThan(0)
    // 换一批默认是翻倍那条曲线，第一次 20（买过【平价】才固定 30）
    expect(await textOf('#md-reroll')).toContain('20')
    // 新档没钱，所以抬头上不挂利息（没息就不显示，免得是一行「+0」的噪音）
    expect(await textOf('#md-skill-gold')).toBe('金币 0')
  })

  it('商店：点货先看详情，不直接买', async () => {
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    // 默认没开
    expect(await page.$('#md-buy-ok')).toBe(null)
    const goods = await page.$('#md-card-0')
    expect(goods).not.toBe(null)
    await goods.tap()
    await page.waitFor(300)
    // 详情框出来了：名字、价钱、说明、两颗钮
    expect(await page.$('#md-buy-name')).not.toBe(null)
    expect(await page.$('#md-buy-price')).not.toBe(null)
    expect((await textOf('#md-buy-desc')).length).toBeGreaterThan(0)
    // 新档 0 金币，所以买不了 —— 原因要写在钮上面
    expect(await textOf('.buy-block')).toContain('金币不够')
    // 点「再看看」收起来，钱一分没动
    const back = await page.$('#md-buy-no')
    await back.tap()
    await page.waitFor(300)
    expect(await page.$('#md-buy-ok')).toBe(null)
    expect(await textOf('#md-skill-gold')).toBe('金币 0')
  })

  it('商店：预告下一关的庄家，但不报点数', async () => {
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    // 新档下一关是第 1 关（浅滩·试竿），那一关庄家不带技能
    expect(await textOf('.foe-title')).toContain('第 1 关')
    expect(await textOf('.foe-none')).toContain('不带技能')
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

  it('对局：点牌库看得到「外面还剩」', async () => {
    // 默认收着
    expect(await page.$('.left-title')).toBe(null)
    const cell = await page.$('#ap-deck-cell')
    expect(cell).not.toBe(null)
    await cell.tap()
    await page.waitFor(300)
    expect(await textOf('.left-title')).toContain('外面还剩')
    // 13 个点数各一行
    expect(await page.$('.left-rank')).not.toBe(null)
    // 报的是「牌库 + 庄家手里」—— 单报牌库会让人减出庄家那四张，
    // 那样窥视和照水就废了
    expect(await textOf('.left-sub')).toContain('庄家手里')
  })
})
