// Original Chinese spoken explanations, verified against primary sources
// on 2026-10-28. No inference about the identity or location of "Tibo".
export const commonTimeSources = [
  {id:'ct-us-zones',title:'NIST · 美国常用时区与 PT 的含义',url:'https://www.nist.gov/pml/time-and-frequency-division/local-time-faqs',note:'PT 可作为全年使用的当地时间表达；PST/PDT 分别为 UTC−08:00/UTC−07:00；同时列出 ET、CT、MT 与地区例外。'},
  {id:'ct-us-dst',title:'NIST · 美国 2026 年夏令时规则',url:'https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst',note:'采用该规则的美国地区于 2026 年 3 月 8 日前拨、11 月 1 日回拨。两组洛杉矶—北京实例已由 IANA 时间引擎核验。'},
  {id:'ct-iana',title:'IANA · 时区缩写的歧义',url:'https://www.iana.org/time-zones/theory',note:'CST 在中国与北美有不同含义，IST 可能指印度、爱尔兰或以色列；用城市和偏移减少歧义。'},
  {id:'ct-uk',title:'英国政府 · GMT 与 BST',url:'https://www.gov.uk/when-do-the-clocks-change',note:'英国标准时间与夏令时的转换；英国 2026 年 10 月 25 日回拨。'},
  {id:'ct-europe',title:'IANA · 欧洲时区规则',url:'https://data.iana.org/time-zones/tzdb/europe',note:'巴黎、柏林等城市采用中欧标准时间 CET 与中欧夏令时 CEST。'},
  {id:'ct-timestamps',title:'RFC 3339 · 互联网时间戳',url:'https://www.rfc-editor.org/rfc/rfc3339.html',note:'完整日期、时间和数字偏移的表示；Z 表示 UTC 偏移 00:00。'},
  {id:'ct-noon',title:'NIST · Noon、Midnight 与日期歧义',url:'https://www.nist.gov/pml/time-and-frequency-division/times-day-faqs',note:'中午和午夜的表达易产生误会；午夜需明确是所指日期的开头还是结尾。'}
];

export const commonTimeChapters = [
  {
    id:'common-pacific',type:'foundation',title:'听到太平洋时间，应该怎样换算？',subtitle:'以洛杉矶为锚，分清 PT、PST 与 PDT',region:'全球',cityId:null,focus:{lat:34,lon:-118},
    summary:'在美国科技与活动语境中理解 Pacific Time，并用具体日期换算为北京时间。',
    paragraphs:[
      {heading:'先给这个词一个位置',text:'你提到经常听见 Tibo 说“太平洋时间”。如果语境是美国科技产品、发布会或线上活动，通常可以把它理解为洛杉矶、旧金山、西雅图这类美国西海岸城市所用的当地时间，英文叫 Pacific Time，缩写是 PT。这是一种区域时间表达，不是整个太平洋周边都用的时间，也不能仅凭这个词判断说话人住在哪里。'},
      {heading:'一个名字，两种季节性偏移',text:'PT 会按所选日期采用标准时间或夏令时。太平洋标准时间写作 PST，是协调世界时减八小时，比北京时间慢十六小时。太平洋夏令时写作 PDT，是协调世界时减七小时，比北京慢十五小时。北京保持加八小时，所以需要变化的是对方那一侧的偏移。听到 PT 时，先把它理解成遵循当地规则的钟表，再根据日期选对偏移。'},
      {heading:'把上午九点放到日历上',text:'例如活动写着二零二六年十月二十八日上午九点 PT。当天洛杉矶仍采用夏令时，因此给当地上午九点加十五小时，得到北京时间十月二十九日零点，也就是北京星期四刚开始的那个瞬间。它不是北京十月二十八日上午九点，也不是十月二十八日晚上九点。美国的活动日期与中国的参加日期需要同时记下。'},
      {heading:'同一个钟点，换个日期就不同',text:'按二零二六年美国现行规则，采用这套安排的地区在十一月一日结束夏令时。到了十一月二日上午九点 PT，洛杉矶已经采用标准时间，北京需要加十六小时，于是对应十一月三日凌晨一点。两场都写上午九点太平洋时间，中国观众的参加时刻却相差一小时。具体日期决定该加十五还是十六。'},
      {heading:'用城市完成最后确认',text:'最省心的操作，是在软件选择洛杉矶，再输入活动日期和钟点，让程序判断当天的偏移。正式邀约可以问：“这里的 PT 是洛杉矶当地时间吗？”如果别人夏天仍写 PST，应确认他真指固定减八小时，还是泛指 PT。涉及加拿大或其他地区时，按对方具体城市查询，不能直接套用美国规则。最后把双方完整日期、时间和时长写进日历。'}
    ],
    takeaways:['在美国活动语境中，PT 可以先用洛杉矶当地时间理解。','PST 比北京慢十六小时，PDT 比北京慢十五小时；具体取决于日期。','太平洋时间不是整片太平洋的统一时间，重要活动要确认城市与完整日期。'],
    sourceIds:['ct-us-zones','ct-us-dst','ct-iana']
  },
  {
    id:'common-expressions',type:'foundation',title:'国际沟通常用的时间表达，一次听明白',subtitle:'从 ET、UTC 到“你那边九点”和下班前',region:'全球',cityId:null,focus:{lat:34,lon:-118},
    summary:'识别常见区域缩写、固定偏移、相对表达与截止时间，知道什么时候需要追问。',
    paragraphs:[
      {heading:'先认识美国常见的四条时间线',text:'除了 PT，你会听到 ET，也就是美国东部时间，可先看纽约；CT 是中部时间，可看芝加哥；MT 是山地时间，可看丹佛。在这些采用相应换钟安排的城市里，从纽约向洛杉矶依次慢一小时，总共慢三小时。标准时间的偏移依次为协调世界时减五、减六、减七、减八小时；夏令时各向前一小时。亚利桑那州多数地区等存在例外，区域名称仍须结合城市理解。'},
      {heading:'世界共同参照与欧洲表达',text:'UTC 是协调世界时，不随夏令时拨钟。互联网时间戳末尾的字母 Z，表示这个时间采用零偏移的 UTC 参照；北京时间需要加八小时，并检查日期。伦敦标准时间常写 GMT，为零偏移，夏令时写 BST，为加一小时。巴黎、柏林等城市常见 CET，即中欧标准时间加一小时，以及 CEST，即中欧夏令时加两小时。英国和中欧不是全年都与 UTC 同钟。'},
      {heading:'有些缩写需要先问一句',text:'看到 CST，不要立刻按北京时间处理。它可能表示中国标准时间，也可能表示北美中部标准时间，两者差很多。IST 也可能涉及印度、爱尔兰或以色列的不同时间表达。缩写只是线索，不一定是唯一答案。对方如果只写“周五九点 CST”，还缺具体日期、上午下午和城市。直接追问这些信息，比自行猜测更稳妥。'},
      {heading:'读懂对方说的是谁的钟表',text:'“My time” 是说话人那边的时间，“Your time” 是接收者那边的时间，“Local time” 是所指地点的当地时间，旅行时尤其要确认位置。Noon 是中午，Midnight 是午夜；“周五午夜”可能被理解为周五开始或结束，应改写完整日期的零点，明确是哪一天刚开始。上午下午也要写清，二十四小时制能减少误读。'},
      {heading:'把模糊截止时间变成约定',text:'工作消息里的 EOD 通常表示一天结束前，但有人指下班前，有人指当天结束，时区也可能没有说清。不要自动把它变成北京时间十八点或二十三点五十九分。你可以确认：“是你当地十一月二日下午五点前吗？你用哪座城市的时间？”然后写出完整年月日、钟点、城市与偏移。如果是会议，再附时长和对方当地时间，最后用日历确认同一个瞬间。'}
    ],
    takeaways:['ET、CT、MT、PT 是区域表达，要按城市和日期确定偏移。','CST、IST、当地时间和 EOD 都可能需要补充语境。','重要约定写完整日期、钟点、城市、偏移与时长，午夜要明确是哪一天开始。'],
    sourceIds:['ct-us-zones','ct-iana','ct-uk','ct-europe','ct-timestamps','ct-noon']
  }
];
