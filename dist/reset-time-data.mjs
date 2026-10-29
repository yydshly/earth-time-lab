/**
 * Teaching examples for reading quota-reset announcements.
 * Sources checked 2026-10-28. No statement below verifies Tibo's product,
 * quota policy, billing provider, account timezone, or next reset time.
 */
export const resetScopeNote='以下原话、额度和日期均为教学示例，不是已经核实的 Tibo 或任何产品规则。说话者的当地时间、产品规则时区、页面显示时区和你的时区可能不同；先找产品说明中的明确规则与时间标记。';

export const resetTimeSources=[
  {id:'nist-pt',title:'NIST · PT、PST 与 PDT',url:'https://www.nist.gov/pml/time-and-frequency-division/local-time-faqs',note:'PT 表示当地适用的标准时间或夏令时间；PST 为 UTC−08:00，PDT 为 UTC−07:00。这里以洛杉矶规则演示。'},
  {id:'iana-zones',title:'IANA · 世界时区规则',url:'https://www.iana.org/time-zones',note:'各地民用时钟与夏令时规则会随政策改变。定期事件应保留地点时区和发生日期，而非全年套用一个时差。'},
  {id:'rfc3339',title:'RFC 3339 · 带偏移的互联网时间戳',url:'https://www.rfc-editor.org/rfc/rfc3339',note:'Z 表示 UTC 零偏移；完整时间戳用于标记同一瞬间。只写钟点或不带时区的日期时间，不能确定全球事件时刻。'},
  {id:'fixed-window',title:'Microsoft · 固定窗口与滑动窗口限流',url:'https://learn.microsoft.com/aspnet/core/performance/rate-limit?view=aspnetcore-10.0',note:'固定窗口与滑动窗口采用不同计数方式。此处从首次请求开始的五小时窗口是明确声明的教学规则，并非该文或任何产品的默认配置。'},
  {id:'rolling-window',title:'Redis · 滚动窗口逐条记录与过期',url:'https://redis.io/tutorials/howtos/ratelimiting/',note:'滑动窗口日志按每次请求的时间戳统计，并移除窗口以前的记录。本例采用精确的过去五小时模型；真实产品还可能使用其他算法。'},
  {id:'billing-cycle',title:'Stripe · 订阅周期与账单锚点',url:'https://docs.stripe.com/billing/subscriptions/billing-cycle',note:'账单周期由订阅间隔和锚点共同确定，月度周期需处理月份长短。账单更新不自动证明某产品的使用额度同时重置。'}
];

export const resetLessons=[
  {
    id:'daily',label:'每天固定时刻',title:'“每天午夜 PT 重置”，午夜属于哪一个地方？',
    rule:'示例原话：Resets daily at 00:00 PT。先选 PT 的当地日期；00:00 表示这一天的开始。若原话改写为 00:00 UTC，就要改用 UTC 规则。',
    why:'这里固定的是产品指定地区的日历钟点。全球共享同一个重置瞬间，但各地显示不同日期和钟点；PT 换季后，对应的北京时间可能移动一小时。',
    narration:'看到每天午夜重置，先不要把它理解成北京时间零点。先找这条规则使用哪个时区，再看重置属于那个地方的哪一天。本例明确写太平洋时间零点，并按洛杉矶规则理解；它在标准时间和夏令时间之间切换，所以换成北京时间时，钟点会随日期改变。若写的是协调世界时零点，则采用另一套固定参照。全球发生的是同一个重置事件，各地日期和钟面可以不同。原话没有日期或时区时，还要先问清楚。',
    sources:['nist-pt','iana-zones','rfc3339'],
    example:{quote:'Resets daily at 00:00 PT',zone:'America/Los_Angeles',time:'00:00',date:'2026-10-28'}
  },
  {
    id:'window',label:'从起点经过时长',title:'“首次使用五小时后重置”，要先找到计时起点',
    rule:'示例原话：Next reset is 5 hours after the first request。教学起点为 2026-10-28T22:00:00Z，经过五小时到 2026-10-29T03:00:00Z。',
    why:'这里给的是经过的时长，而不是某地午夜。只要起点是明确瞬间，全球经过的五小时相同；没有起点，单靠“五小时”算不出结束日期与钟点。',
    narration:'另一种规则从某次使用开始计时。本例明确规定，首次请求五小时以后，窗口才结束。要先找到那次请求的完整时间戳，再向后加五小时，最后分别显示成世界各地的钟表。这个算法和每天午夜清零不同，也不能只看说话者住在哪里。若页面只写五小时窗口，却没有起点或下次恢复时间，我们还不能确定准确钟点。这里的首次请求起算只是教学约定，真实产品可能有自己的窗口起点和计算方法。',
    sources:['fixed-window','rfc3339'],
    example:{quote:'Next reset is 5 hours after the first request',start:'2026-10-28T22:00:00Z',hours:5,end:'2026-10-29T03:00:00Z'}
  },
  {
    id:'rolling',label:'过去一段时间',title:'“统计过去五小时”，用量可能逐笔退出窗口',
    rule:'示例原话：Usage from the last 5 hours counts。每笔使用在自身发生五小时后退出本例窗口；这不是统一的全部清零时刻。',
    why:'滚动统计的窗口一直向前移动。旧用量逐笔不再计入，同时新用量还会进入，因此某笔用量释放与全部额度恢复是不同的问题。',
    narration:'过去五小时累计用量，是又一种含义。它不断回看刚刚过去的五小时，而不是等到某个午夜把所有记录一起清空。本例在协调世界时二十三点和次日一点各使用一笔；它们分别到次日四点和六点退出窗口。第一笔退出时，只释放第一笔占用的份额，不能说全部额度都已恢复；继续使用还会加入新的记录。实际产品也可能采用分段计数或其他限流算法，所以先认清原话，别把所有窗口都当成同一种重置。',
    sources:['rolling-window','rfc3339'],
    example:{quote:'Usage from the last 5 hours counts',hours:5,events:[{at:'2026-10-28T23:00:00Z',units:30},{at:'2026-10-29T01:00:00Z',units:20}]}
  },
  {
    id:'billing',label:'订阅与账单周期',title:'“下次周期更新”，优先读产品给出的明确时间戳',
    rule:'示例原话：Next reset: 2026-11-02T08:00:00Z。这里已经给出 UTC 瞬间；无需从“月费”自行猜成每月一号或三十天以后。',
    why:'订阅可以按购买日、试用结束日或指定锚点安排账单周期，月份长短也不同。产品的额度更新、续费扣款和套餐变更还可能各有规则。',
    narration:'订阅额度还可能跟账单周期有关。每月订阅不自动等于每月一号更新，也不一定是每次购买后整整三十天。周期可能由购买日、试用结束日或指定日期决定，短月还会带来日历处理差异。优先读取产品显示的下次额度更新时间，或规则中明确给出的完整时间戳，再换成你的日期和钟点。本例末尾的字母 Z 表示协调世界时。账单续费和额度恢复也可能是两件事，需要确认该产品是否明确把它们绑定。',
    sources:['billing-cycle','rfc3339'],
    example:{quote:'Next reset: 2026-11-02T08:00:00Z',instant:'2026-11-02T08:00:00Z'}
  }
];

export const worldResetCities=[
  {id:'la',name:'洛杉矶',country:'美国',region:'北美洲',lat:34.05,lon:-118.24,zone:'America/Los_Angeles'},
  {id:'newyork',name:'纽约',country:'美国',region:'北美洲',lat:40.71,lon:-74,zone:'America/New_York'},
  {id:'saopaulo',name:'圣保罗',country:'巴西',region:'南美洲',lat:-23.55,lon:-46.63,zone:'America/Sao_Paulo'},
  {id:'london',name:'伦敦',country:'英国',region:'欧洲',lat:51.5,lon:-.12,zone:'Europe/London'},
  {id:'nairobi',name:'内罗毕',country:'肯尼亚',region:'非洲',lat:-1.29,lon:36.82,zone:'Africa/Nairobi'},
  {id:'delhi',name:'新德里',country:'印度',region:'亚洲',lat:28.61,lon:77.21,zone:'Asia/Kolkata'},
  {id:'beijing',name:'北京',country:'中国',region:'亚洲',lat:39.9,lon:116.4,zone:'Asia/Shanghai'},
  {id:'tokyo',name:'东京',country:'日本',region:'亚洲',lat:35.68,lon:139.69,zone:'Asia/Tokyo'},
  {id:'sydney',name:'悉尼',country:'澳大利亚',region:'大洋洲',lat:-33.87,lon:151.21,zone:'Australia/Sydney'}
];
