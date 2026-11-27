// Only the display copy is translated. Event IDs, performance times and seat inventory
// come from the same exported snapshot in every language.
export const productionsZh = {
  1: {
    title: '雷雨',
    description: '由校園劇團演繹曹禺的經典家庭悲劇《雷雨》。',
    organizer: 'DSC 戲劇學會',
  },
  2: {
    title: '城市之聲：弦樂四重奏',
    description: '弦樂與鋼琴交織的室樂音樂會，設中場休息。',
    organizer: 'DSC 音樂學會',
  },
  3: {
    title: '四季之舞',
    description: '一套由八個樂章組成的當代舞作。',
    organizer: 'DSC 舞蹈學會',
  },
  4: {
    title: '深夜喜劇',
    description: '以英語和廣東話演出的棟篤笑與即興短劇。',
    organizer: 'DSC 喜劇社',
  },
  5: {
    title: '黑盒爵士之夜',
    description: '小型爵士樂隊與客席歌手攜手演出。',
    organizer: 'DSC 爵士樂隊',
  },
  6: {
    title: '小星星',
    description: '一齣兒童劇，講述一顆失去光芒的小星星的故事。',
    organizer: 'DSC 戲劇學會',
  },
  7: {
    title: '歌劇之夜：《茶花女》精選',
    description: '選演威爾第歌劇《茶花女》的經典場景及詠嘆調。',
    organizer: 'DSC 歌劇樂團',
  },
};

const genre = {
  en: ['Drama', 'Chamber music', 'Contemporary dance', 'Comedy', 'Jazz', 'Family theatre', 'Opera'],
  zh: ['話劇', '室樂', '當代舞', '喜劇', '爵士樂', '親子劇場', '歌劇'],
  'zh-cn': ['话剧', '室内乐', '当代舞', '喜剧', '爵士乐', '亲子剧场', '歌剧'],
};

export const productionsZhCn = {
  1: {
    title: '雷雨',
    description: '校园剧团演绎曹禺的经典家庭悲剧《雷雨》。',
    organizer: 'DSC 戏剧社',
  },
  2: {
    title: '城市之声：弦乐四重奏',
    description: '一场由弦乐与钢琴共同演绎的室内乐音乐会，设中场休息。',
    organizer: 'DSC 音乐社',
  },
  3: {
    title: '四季之舞',
    description: '一部由八个乐章组成的当代舞作品。',
    organizer: 'DSC 舞蹈社',
  },
  4: {
    title: '深夜喜剧',
    description: '用英语和粤语表演的单口喜剧与即兴短剧。',
    organizer: 'DSC 喜剧社',
  },
  5: {
    title: '黑匣子爵士之夜',
    description: '小型爵士乐队携手特邀歌手同台演出。',
    organizer: 'DSC 爵士乐队',
  },
  6: {
    title: '小星星',
    description: '一部儿童剧，讲述一颗失去光芒的小星星的故事。',
    organizer: 'DSC 戏剧社',
  },
  7: {
    title: '歌剧之夜：《茶花女》精选',
    description: '选演威尔第歌剧《茶花女》的经典场景与咏叹调。',
    organizer: 'DSC 歌剧乐团',
  },
};

const eventTranslations = { en: {}, zh: productionsZh, 'zh-cn': productionsZhCn };

export function programmeText(event, language) {
  const translation = eventTranslations[language][event.id];
  return { ...event, ...translation, genre: genre[language][event.id - 1] };
}

export const copy = {
  en: {
    snapshot: date => `Read-only demo snapshot · ${date}`,
    performances: n => n === 1 ? '1 performance' : `${n} performances`,
    seats: n => n === 1 ? '1 seat' : `${n} seats`,
    row: n => `Row ${n}`,
    section: code => `Section ${code}`,
    regionDetail: r => `${r.ticketsSold} sold / ${r.sellableSeats} sellable · ${r.checkedIn} checked in`,
    seatDetail: (section, row, n, status, tier, price) =>
      [`Section ${section}`, `row ${row}`, `seat ${n}`, status, tier, price].join(' · '),
    seatHint: 'Select a seat to inspect its status and ticket price. Use the arrow keys to move between seats.',
    emptySection: 'No seats in this section.',
    priceUnknown: 'Price unavailable',
    openSeats: 'Explore demo seats',
    loadError: 'Demo performances could not be loaded. Reload this page to try again.',
    states: { AVAILABLE: 'Available', HELD: 'On hold', SOLD: 'Sold', BLOCKED: 'Blocked' },
    shows: { SALES_PAUSED: 'Sales paused', FINISHED: 'Finished', PUBLISHED: 'Published' },
    venues: {},
    tiers: {},
  },
  zh: {
    snapshot: date => `唯讀示範資料 · ${date}`,
    performances: n => `${n} 場演出`,
    seats: n => `${n} 個座位`,
    row: n => `第 ${n} 排`,
    section: code => `${code} 區`,
    regionDetail: r => `已售 ${r.ticketsSold} 張／可售 ${r.sellableSeats} 張 · 已入場 ${r.checkedIn} 人`,
    seatDetail: (section, row, n, status, tier, price) =>
      [`${section} 區`, `第 ${row} 排 ${n} 號`, status, tier, price].join(' · '),
    seatHint: '選擇座位即可查看狀態及票價。使用鍵盤方向鍵可移至相鄰座位。',
    emptySection: '此區沒有座位。',
    priceUnknown: '暫無票價資料',
    openSeats: '查看示範座位',
    loadError: '未能載入示範演出，請重新整理頁面再試。',
    states: { AVAILABLE: '可選', HELD: '暫時預留', SOLD: '已售', BLOCKED: '已封鎖' },
    shows: { SALES_PAUSED: '暫停售票', FINISHED: '已完場', PUBLISHED: '已公佈' },
    venues: { 'DSC Black Box Theatre': 'DSC 黑盒劇場', 'Grand Hall': '大禮堂', 'Studio Theatre': '實驗劇場' },
    tiers: { VIP: '貴賓票', Standard: '標準票', Economy: '經濟票' },
  },
  'zh-cn': {
    snapshot: date => `只读演示数据 · ${date}`,
    performances: n => `${n} 场演出`,
    seats: n => `${n} 个座位`,
    row: n => `第 ${n} 排`,
    section: code => `${code} 区`,
    regionDetail: r => `已售 ${r.ticketsSold} 张／可售 ${r.sellableSeats} 张 · 已入场 ${r.checkedIn} 人`,
    seatDetail: (section, row, n, status, tier, price) =>
      [`${section} 区`, `第 ${row} 排 ${n} 号`, status, tier, price].join(' · '),
    seatHint: '选择座位即可查看状态和票价。使用键盘方向键可切换到相邻座位。',
    emptySection: '此区域没有座位。',
    priceUnknown: '暂无票价信息',
    openSeats: '查看演示座位',
    loadError: '未能加载演示演出，请刷新页面重试。',
    states: { AVAILABLE: '可选', HELD: '暂时预留', SOLD: '已售', BLOCKED: '已封锁' },
    shows: { SALES_PAUSED: '暂停售票', FINISHED: '已结束', PUBLISHED: '已发布' },
    venues: { 'DSC Black Box Theatre': 'DSC 黑匣子剧场', 'Grand Hall': '大礼堂', 'Studio Theatre': '实验剧场' },
    tiers: { VIP: '贵宾票', Standard: '标准票', Economy: '经济票' },
  },
};

// Static English copy is taken from the original accessible HTML.
export const staticZh = {
  metaDescription: '查找即將舉行的城大活動、查看截止日期，並向主辦方報名。舉辦對號入座活動的主辦方可自行架設票務系統。',
  pageTitle: 'CityUHK Events Hub · 城大校園活動',
  skip: '跳至主要內容',
  brandHome: 'CityUHK Events Hub 首頁',
  universityLogo: '香港城市大學',
  navLabel: '網站導覽',
  navCampus: '活動',
  adminSignIn: '管理員登入',
  languageLabel: '頁面語言',
  heroTitle: '校園活動',
  heroIntro: '錯過了校園公告？在這裏找回感興趣的活動、查看截止日期，再到主辦方網站報名。',
  heroAction: '瀏覽活動',
  campusTitle: '活動與截止日期',
  campusPortal: '城大公告系統',
  campusView: '活動列表檢視方式',
  campusUpcoming: '所有活動',
  campusDeadlines: '即將截止',
  snapshotFallback: '唯讀示範資料',
  backToEvents: '返回活動列表',
  noPerformance: '這份示範資料暫無此節目的公開場次。',
  performanceLabel: '演出場次 · 香港時間',
  sectionLabel: '座位區域',
  seatMapTitle: '座位圖',
  legendLabel: '座位狀態',
  available: '可選',
  held: '暫時預留',
  sold: '已售',
  blocked: '已封鎖',
  stage: '舞台',
  seatMapLabel: '按行列及號碼排列的座位',
  occupancyTitle: '各區上座率',
  occupancyHint: '已售門票佔該區可售座位的百分比。',
  projectTitle: '對號入座活動的票務安排',
  projectIntro: '如果你的活動需要編配座位，可以自行架設票務系統，管理訂座及入場驗票。本站標有 [Demo] 的節目提供座位圖預覽。',
  setupLink: '架設票務系統',
  apiLink: '票務 API 參考文件',
  sourceLink: '在 GitHub 查看原始碼',
};

export const staticZhCn = {
  metaDescription: '查找即将举行的城大活动，查看截止日期并向主办方报名。举办对号入座活动的主办方可自行部署票务系统。',
  pageTitle: 'CityUHK Events Hub · 城大校园活动',
  skip: '跳至主要内容',
  brandHome: 'CityUHK Events Hub 首页',
  universityLogo: '香港城市大学',
  navLabel: '网站导航',
  navCampus: '活动',
  adminSignIn: '管理员登录',
  languageLabel: '页面语言',
  heroTitle: '校园活动',
  heroIntro: '错过了校园公告？在这里找回感兴趣的活动，查看截止日期，再到主办方网站报名。',
  heroAction: '浏览活动',
  campusTitle: '活动与截止日期',
  campusPortal: '城大公告系统',
  campusView: '活动列表视图',
  campusUpcoming: '所有活动',
  campusDeadlines: '即将截止',
  snapshotFallback: '只读演示数据',
  backToEvents: '返回活动列表',
  noPerformance: '这份演示数据中暂无该节目的公开场次。',
  performanceLabel: '演出场次 · 香港时间',
  sectionLabel: '座位区域',
  seatMapTitle: '座位图',
  legendLabel: '座位状态',
  available: '可选',
  held: '暂时预留',
  sold: '已售',
  blocked: '已封锁',
  stage: '舞台',
  seatMapLabel: '按排号和座号排列的座位',
  occupancyTitle: '各区上座率',
  occupancyHint: '已售门票占该区可售座位的百分比。',
  projectTitle: '对号入座活动的票务安排',
  projectIntro: '如果你的活动需要安排座位，可以自行部署票务系统，管理订座和入场验票。本站标有 [Demo] 的节目提供座位图预览。',
  setupLink: '部署票务系统',
  apiLink: '票务 API 参考文档',
  sourceLink: '在 GitHub 查看源代码',
};
