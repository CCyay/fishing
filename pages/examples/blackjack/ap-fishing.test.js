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

  it('对局：没选角色就不开局，而且只给「回关卡选角色」一条路', async () => {
    // 这一条守的是**输了之后那条路**。结算框上那颗「从第 1 关重来」
    // 从前直接就地重开，可 resetDrawRun 已经把 role 清掉了 ——
    // 于是重开那一轮没角色、没槽，商店里一件技能都买不动，整轮是个空壳。
    //
    // 现在那颗钮改成回关卡页（选角色的入口在那儿），而这儿再兜一道：
    // 不管从哪条路进到对局页，没角色就不发牌。
    // 新档（beforeAll 清过存档）正好是这个状态
    page = await program.reLaunch(TABLE_PATH)
    await page.waitFor('view')
    await page.waitFor(500)
    expect(await textOf('#ap-result')).toContain('还没选角色')
    // 没发牌：手牌一张都没有
    expect(await page.$('#ap-hand-0')).toBe(null)
    // 唯一那颗钮是回关卡，不是就地重开
    expect(await textOf('#ap-restart')).toContain('回关卡')
    expect(await page.$('#ap-shop')).toBe(null)
  })

  it('商店：开局没有技能，货架已上货', async () => {
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    // 新档还没选角色（角色在「开启挑战」那一下选，见关卡页的 go），
    // 所以一个槽都没有 —— 「我的槽」那一栏是空的
    expect(await textOf('.empty')).toContain('还没选角色')
    // 技能现在是在商店买的（不再靠过关掉），跟卡牌、点数卡混在同一栏。
    // 上什么货是摇的，所以只断言「那一栏摆满了 SHOP_CARD_COUNT 格」
    expect(await page.$('#md-card-0')).not.toBe(null)
    expect(await page.$('#md-card-3')).not.toBe(null)
    expect(await page.$('#md-card-4')).toBe(null)
    // 槽那个计数器一直摆在抬头上。
    // 从前是「技能名额 0/4」—— 名额那条上限删了（槽数本身就是上限，
    // 而槽数由角色卡定），所以新档没选角色时是 0/0
    expect(await textOf('#md-skill-own')).toContain('槽 0/0')
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
    // 浅滩四关覆盖面是 0，所以标题里不挂「盖 N 张」那一段
    expect(await textOf('.foe-title')).not.toContain('盖')
  })

  it('商店：庄家预告给角色名和特殊技全文', async () => {
    // **固定的那层信息**（角色名 + 特殊技）是可以背下来的 ——
    // 「庄家要有性格」那条设计就只能通过这一块兑现。
    // 摇的那层（占哪几个点数）照旧只报个数，见上面那条
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    // 第 1 关是「试手」，它没有特殊技 —— 所以名字在、特殊技那行不在
    expect(await textOf('#md-foe-role')).toContain('试手')
    expect(await page.$('#md-foe-special')).toBe(null)
  })

  it('商店：砺钩 / 洗点 / 加权三件道具没了', async () => {
    // 三件都跟角色卡结构冲突：槽上印死标签 → 没有格子可扩、没有位置可重摇；
    // 特殊技不能升级 → 没有东西可升。留着会让人花钱买一件没用的东西。
    //
    // 道具行的 id 是 md-fix-<道具 key>（见货架那个 v-for），
    // 所以这三个选择器**永远**取不到才对 —— 不是「这一批没摇到」，
    // 是表里压根没有了
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    expect(await page.$('#md-fix-sharpen')).toBe(null)
    expect(await page.$('#md-fix-wash')).toBe(null)
    expect(await page.$('#md-fix-weight')).toBe(null)
  })

  it('关卡页：开启挑战先选角色，不直接进对局', async () => {
    // 角色给的是那件常驻特殊技和那几个印死标签的槽，
    // 所以它是这一轮所有决策的前提（买什么技能、往哪个点数改牌组）——
    // 开打之后再选就全错位了
    page = await program.reLaunch(LEVELS_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    const now = await page.$('#md-now')
    expect(now).not.toBe(null)
    await now.tap()
    await page.waitFor(500)
    // 还在关卡页（没跳对局），而且角色列表弹出来了
    page = await program.currentPage()
    expect(page.path).toBe(LEVELS_PATH.slice(1))
    expect(await textOf('#md-role-title')).toContain('这一轮用谁')
    expect(await page.$('#md-role-0')).not.toBe(null)
  })

  it('关卡页：选完角色，槽是空的', async () => {
    // 闯关跟终局的分野就在这儿：终局直接给你挑技能（顶配沙盒），
    // 闯关的槽是空的 —— 技能要在商店一件件买来嵌
    page = await program.reLaunch(LEVELS_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    await (await page.$('#md-now')).tap()
    await page.waitFor(500)
    await (await page.$('#md-role-0')).tap()
    // 选完当场开打，所以这儿会跳到对局页
    await page.waitFor(800)
    page = await program.currentPage()
    expect(page.path).toBe(TABLE_PATH.slice(1))
    // 回商店看槽：角色有槽了，但一件技能都没嵌
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    expect(await textOf('#md-skill-own')).toContain('槽 0/')
    expect(await page.$('#md-slot-0')).not.toBe(null)
    expect(await textOf('#md-slot-0')).toContain('空着')
    // 角色那行（名字 + 特殊技）摆在「我的槽」抬头右边
    expect((await textOf('#md-role-line')).length).toBeGreaterThan(0)
  })

  it('关卡页：选完角色之后，关卡卡片上报得出「我是谁」', async () => {
    // 角色是这一整轮的前提（买什么技能、往哪个点数改牌组全看它），
    // 可这一行以前压根不存在 —— 关卡页只有关号、难度、奖励，
    // 于是打一局回来就看不见自己选了谁
    page = await program.reLaunch(LEVELS_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    const line = await textOf('#md-my-role')
    // 角色名 + 特殊技名 + 槽数 + 覆盖面，四样都在一行里
    expect(line).toContain('槽 0/')
    expect(line).toContain('盖')
    // 技能弹层的抬头也换成角色名了（这一栏问的是「我带着什么」）
    await (await page.$('#md-open-skills')).tap()
    await page.waitFor(300)
    expect((await textOf('.skill-box-title')).length).toBeGreaterThan(0)
  })

  it('技能弹层：查询框筛得动，抬头跟着报匹配数', async () => {
    // 全表 29 件而弹层一屏放得下三四件 —— 翻到底要滑七八次，
    // 所以这一栏真正要解决的是**查找**。原先那块位置是一段讲规则的说明
    //（技能在哪买、怎么嵌槽），而那段话你买第一件时就学会了
    page = await program.reLaunch(LEVELS_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    await (await page.$('#md-open-skills')).tap()
    await page.waitFor(300)
    // 没敲字的时候报总数，而且清空钮不在
    expect(await textOf('.skill-box-sub')).toContain('共 ')
    expect(await page.$('#md-skill-search-clear')).toBe(null)
    // 敲一个**只出现在效果说明里**的词 —— 记得住效果记不住名字才是常态
    const box = await page.$('#md-skill-search')
    expect(box).not.toBe(null)
    await box.input('堆底')
    await page.waitFor(300)
    const sub = await textOf('.skill-box-sub')
    expect(sub).toContain('匹配')
    expect(sub).not.toContain('共 ')
    // 「堆底」在【沉底】的效果说明里，所以一定有命中 ——
    // 命中几件不断言（表以后会加技能），只断言「不是零」
    expect(await page.$('#md-skill-none')).toBe(null)
    expect(await page.$('#md-skill-search-clear')).not.toBe(null)
    // 敲一个一定没有的词：报「没有匹配」。
    // 按 id 取不按类取 —— 那个类上面那行角色也在用
    await box.input('这个词一定查不到')
    await page.waitFor(300)
    expect(await textOf('#md-skill-none')).toContain('没有匹配')
    expect(await page.$('#md-skill-0')).toBe(null)
    // 清空之后回到全表
    await (await page.$('#md-skill-search-clear')).tap()
    await page.waitFor(300)
    expect(await textOf('.skill-box-sub')).toContain('共 ')
  })

  it('技能弹层：关掉再开，查询词不留着', async () => {
    // 留着的话下次开出来是一张筛过的表，而那看着就是「技能怎么少了」
    page = await program.reLaunch(LEVELS_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    await (await page.$('#md-open-skills')).tap()
    await page.waitFor(300)
    await (await page.$('#md-skill-search')).input('堆底')
    await page.waitFor(300)
    expect(await textOf('.skill-box-sub')).toContain('匹配')
    await (await page.$('.skill-box-close')).tap()
    await page.waitFor(300)
    await (await page.$('#md-open-skills')).tap()
    await page.waitFor(300)
    expect(await textOf('.skill-box-sub')).toContain('共 ')
  })

  it('商店：预告读的是存档里摇定那一套，刷新两次也不变', async () => {
    // 庄家配装是摇的，可**摇完就存住** —— 每次读都重摇的话这块预告
    // 就是假情报，退出再进还能一直刷到弱的那一套。
    // 新档在第 1 关（不带技能），所以这儿断言的是「两次读完全一样」
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    const first = await textOf('.foe-title')
    page = await program.reLaunch(SHOP_PATH)
    await page.waitFor('view')
    await page.waitFor(300)
    expect(await textOf('.foe-title')).toBe(first)
  })

  it('对局：庄家先走完一回合后轮到你，你已自动摸到第 4 张', async () => {
    page = await program.reLaunch(TABLE_PATH)
    await page.waitFor('view')
    await page.waitFor(FOE_TURN_MS)
    expect(await textOf('#ap-turn')).toContain('你的回合')
    expect(await page.$('#ap-hand-3')).not.toBe(null)
    expect(await page.$('#ap-hand-4')).toBe(null)
    // 槽是空的，所以点数技能那几个 chip 一个都没有
    expect(await page.$('#ap-skill-0')).toBe(null)
  })

  it('对局：闯关也有角色标签，双方都有', async () => {
    // 从前闯关这条路把 myRole 留在 -1，所以**五件已实现的玩家特殊技
    // 一个都不生效**，而玩家也看不见自己是谁。
    //
    // 庄家那侧查的是它自己那张表（DRAW_FOE_ROLES，按关号定死）——
    // 第 1 关是「试手」，它没有特殊技，所以标签上只有名字
    expect(await page.$('#ap-my-role')).not.toBe(null)
    expect(await textOf('#ap-foe-role')).toContain('试手')
    // 点一下自己那个标签：说明框报特殊技全文（标签上只写得下名字）
    await (await page.$('#ap-my-role')).tap()
    await page.waitFor(300)
    expect((await textOf('.chip-desc-body')).length).toBeGreaterThan(0)
  })

  it('对局：场上效果栏常驻，开局是空的', async () => {
    // 挂在牌上的效果（照水、封色、分水、压邻…）常驻摆在牌堆下面 ——
    // 从前 held 只在逻辑里读、一次都没渲染过，而抹点数那三件
    // 改的是每张落堆牌算几点，不显示就算不出自己这张值几点。
    //
    // 开局一条都没挂，所以这儿断言「那一栏在、但写着『无』」——
    // **栏本身不能跟着消失**：高度写死的，不然底下整块牌桌会上下跳
    expect(await page.$('.field-bar')).not.toBe(null)
    expect(await textOf('.field-label')).toContain('场上效果')
    expect(await textOf('.field-none')).toBe('无')
    expect(await page.$('#ap-field-0')).toBe(null)
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
