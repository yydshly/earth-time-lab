import {lessonSemanticCues} from './lesson-semantic-cues.mjs';

/** A globe-first beginner course. Clock values come from IANA rules at each ISO instant.
 * Verified 2026-10-28. Geographic bands are a teaching model, never legal boundaries.
 * Routines below are fictional people's editable schedules, not national statistics.
 */
export const globeLessonSources = [
  {id:'nist-clock',title:'NIST · 十二小时制、正午与午夜',url:'https://www.nist.gov/pml/time-and-frequency-division/times-day-faqs',note:'正午与午夜易产生歧义；正式约定优先写完整日期和 24 小时制。'},
  {id:'bipm-utc',title:'BIPM · 协调世界时 UTC',url:'https://www.bipm.org/en/time-department/utc',note:'UTC 是国际共同时间标尺，并非某一个国家或城市的钟表。'},
  {id:'rmg-longitude',title:'格林尼治皇家天文台 · 经纬度与时间教学活动',url:'https://www.rmg.co.uk/file/4442/download?token=U8W7DBGj',note:'用经线与地球转动解释地方太阳时的差异。'},
  {id:'iana-rules',title:'IANA · 时区规则数据库',url:'https://www.iana.org/time-zones',note:'民用时区、UTC 偏移与夏令时规则会改变；换算应带具体日期和城市。'},
  {id:'iana-theory',title:'IANA · 城市时区名称与缩写歧义',url:'https://www.iana.org/time-zones/theory',note:'时区名称代表一套地方时间规则；CST、IST 等缩写可能指不同地区。'},
  {id:'iana-asia',title:'IANA · 亚洲时间规则',url:'https://data.iana.org/time-zones/tzdb/asia',note:'北京时间、印度与尼泊尔的偏移规则。'},
  {id:'usno-zones',title:'美国海军天文台 · 美国时区与 UTC 换算',url:'https://aa.usno.navy.mil/faq/us_tzones',note:'美国多个民用时区、标准/夏令时间偏移，以及跨日期换算。'},
  {id:'nist-local',title:'NIST · PT、PST、PDT 的含义',url:'https://www.nist.gov/pml/time-and-frequency-division/local-time-faqs',note:'PT 可泛指当地太平洋时间；PST 与 PDT 分别指标准时间和夏令时间。'},
  {id:'nist-dst',title:'NIST · 美国夏令时规则',url:'https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst',note:'采用夏令时的美国地区在 2026 年 3 月 8 日和 11 月 1 日调整钟表。'},
  {id:'dot-zones',title:'美国交通部 · 法定时区边界',url:'https://www.bts.gov/explore-topics-and-geography/geography/geospatial-portal/history-time-zones-and-daylight-saving',note:'现实边界可沿行政区、河流和地理坐标划定，不是整齐的经线带。'},
  {id:'w3c-time',title:'W3C · 时间与时区工作草案',url:'https://www.w3.org/TR/timezone/',note:'关于同一瞬间、地方钟面、偏移及未来日程的概念说明；该资料为工作草案。'}
];

const locations = {
  beijing:{lat:39.9,lon:116.4}, london:{lat:51.5,lon:-.12}, newyork:{lat:40.71,lon:-74},
  la:{lat:34.05,lon:-118.24}, chicago:{lat:41.88,lon:-87.63}, tokyo:{lat:35.68,lon:139.69},
  singapore:{lat:1.35,lon:103.82}, delhi:{lat:28.61,lon:77.21}, kathmandu:{lat:27.72,lon:85.32},
  madrid:{lat:40.42,lon:-3.7}, sydney:{lat:-33.87,lon:151.21}
};
const pin = (city,text,detail='') => ({...locations[city],city,text,detail});
const anchor = (lat,lon,text,detail='') => ({lat,lon,text,detail});
const JAN = '2026-01-15T07:30:00Z';

export const globeLessons = [
  {
    id:'clock-reading',number:1,mode:'clocks',title:'先学会读一个时刻',
    question:'“下午三点半”，究竟是哪一天、哪里的三点半？',
    takeaway:'完整时刻 = 日期 + 钟点 + 地点时区；钟面不同也可以是同一瞬间。',
    sources:['nist-clock','w3c-time'],
    stages:[
      {
        id:'read-date',label:'读日期与钟点',presentation:'local',layer:'none',instant:JAN,focus:{lat:30,lon:100},cities:['beijing'],clockFormat:'24h',
        callouts:[pin('beijing','1 月 15 日 · 15:30','15 时 30 分，也就是下午三点半')],
        formula:'北京 · 1 月 15 日 · 下午三点半',instruction:'先看地球上的北京，再读日期和钟点。',
        caption:'先读三个信息：在哪里、哪一天、几点钟。',
        narration:'先看地球上的北京。旁边写着二零二六年一月十五日，下午三点半。我们只读三件事：在哪里、哪一天、几点钟。日期说明是哪一天，钟点说明一天进行到了哪里，城市告诉我们读哪里的钟表。通常一天有二十四小时，一小时有六十分钟。先把这三个信息读完整，下一步再认识钟点的不同写法。'
      },
      {
        id:'two-clocks',label:'24 小时与 AM / PM',presentation:'notation',layer:'none',instant:JAN,focus:{lat:30,lon:110},cities:['beijing'],clockFormat:'both',
        caption:'15:30 和 3:30 PM，都表示下午三点半。',
        callouts:[pin('beijing','15:30 = 3:30 PM','00:00 通常写 12 AM；12:00 通常写 12 PM')],
        formula:'AM：上午；PM：下午。正式约定优先写 00:00 / 12:00。',instruction:'两种写法只是同一个钟点的两种读法。',
        narration:'二十四小时制从零点计到二十三点五十九分；十二小时制把一天分成上午和下午。屏幕上的十五点三十分，写成英文就是三点三十分，P M。电子钟通常把午夜写成十二 A M，把中午写成十二 P M。这两种写法很容易看反，所以约事情时，直接写零点或十二点，并带上日期，会更清楚。'
      },
      {
        id:'same-instant',label:'同一瞬间，不同日期',presentation:'comparison',layer:'none',instant:'2026-01-15T16:00:00Z',focus:{lat:25,lon:160},cities:['beijing','la','newyork'],clockFormat:'24h',
        caption:'北京已到 16 日，美国这些城市仍是 15 日；它们是同一瞬间。',
        callouts:[pin('beijing','1 月 16 日 · 00:00','新的一天开始了'),pin('la','1 月 15 日 · 08:00','仍然是前一天早晨'),pin('newyork','1 月 15 日 · 11:00','仍然是前一天上午')],
        formula:'同一瞬间 ≠ 相同钟点，也不一定是相同日期',instruction:'转到另一侧，看看此刻美国的日历。',
        narration:'现在把时间往前拨。北京已经到了一月十六日零点，洛杉矶却仍是一月十五日早上八点，纽约是同一天上午十一点。它们不是先后发生的三件事，而是同一瞬间的三种当地写法。跨国聊天时，只说今天、明天或晚上，很容易说成不同日期。先记住：我们要对齐的是同一瞬间。'
      }
    ],
    quiz:{question:'北京写 15:30，同一钟点的十二小时制写法是？',options:['3:30 AM','3:30 PM','15:30 PM'],answer:1,explanation:'15 − 12 = 3，因此是下午 3:30，也就是 3:30 PM。'}
  },
  {
    id:'earth-turns',number:2,mode:'rotation',title:'地球为什么有不一样的钟点',
    question:'为什么向东走，钟表通常会更快？',
    takeaway:'地球向东自转；360° ÷ 24 小时 = 每 15° 约一小时。',
    sources:['rmg-longitude','iana-theory'],
    stages:[
      {
        id:'sun-and-earth',label:'先看白天与黑夜',dayCycle:true,layer:'none',instant:'2026-03-20T22:00:00Z',focus:{lat:20,lon:116},cities:['beijing'],
        callouts:[pin('beijing','从北京的清晨开始','沿着一天观察白昼、夜晚与日期')],
        caption:'看北京进入白昼、走进夜晚，再迎来下一天。',
        formula:'地球向东自转，各地轮流迎来白天与黑夜',instruction:'点击“播放地球的一天”，观察北京钟点和日期一起前进。',
        voiceCues:[
          {id:'morning',caption:'北京：清晨 06:00 → 中午 12:00',fromMinutes:0,toMinutes:360,narration:'起点是三月二十一日，北京早上六点。看它随地球向东转动，逐渐进入明亮的一面。钟点从六点向中午十二点前进。'},
          {id:'afternoon',caption:'北京：中午 12:00 → 傍晚 18:00',fromMinutes:360,toMinutes:720,narration:'从同一天中午十二点继续。北京从白昼走向傍晚，钟点将到十八点。亮暗变化来自地球朝向太阳的方向改变，移动视角本身并不会推进时间。'},
          {id:'evening',caption:'北京：18:00 → 午夜，留意日期',fromMinutes:720,toMinutes:1080,narration:'现在从三月二十一日十八点开始。北京逐渐转入夜晚，钟点继续向零点前进。留意这一段的最后：一跨过午夜，日期就要增加一天。'},
          {id:'next-morning',caption:'北京：次日 00:00 → 清晨 06:00',fromMinutes:1080,toMinutes:1440,narration:'这一段从三月二十二日零点开始。日期已经翻页，北京经过后半夜，逐渐回到早上六点。看，经过二十四小时，钟点回到六点，日期却已经是新的一天。'}
        ]
      },
      {
        id:'fifteen-degrees',label:'每 15° 约一小时',layer:'ideal',instant:'2026-03-20T12:00:00Z',focus:{lat:15,lon:15},cities:[],
        callouts:[anchor(15,0,'0°：示意 12:00'),anchor(15,15,'东经 15°：示意 13:00'),anchor(15,30,'东经 30°：示意 14:00')],
        caption:'向东一格，太阳时约加一小时；这是理想模型。',
        formula:'360° ÷ 24 = 15°；经度差 15°，太阳时约差一小时',instruction:'沿着赤道方向数色带；这是理想分区，不是法定边界。',
        narration:'把地球一圈的三百六十度，平均分给一天的二十四小时，就得到十五度大约一小时。现在看到的是帮助理解的理想色带：向东一格，示意钟点增加一小时；向西一格，减少一小时。这里是在解释经度和太阳时的关系，不是在宣布每个国家必须采用哪种时间。实际钟表还要服从当地约定。'
      },
      {
        id:'east-and-west',label:'经度决定方向，纬度不是时差',layer:'ideal',instant:'2026-03-20T12:00:00Z',focus:{lat:20,lon:0},cities:[],
        callouts:[anchor(15,-15,'向西：示意 11:00'),anchor(15,0,'参照：示意 12:00'),anchor(15,15,'向东：示意 13:00')],
        caption:'经度帮助理解方向；实际钟点要查城市与日期。',
        formula:'理想模型：东边加，西边减；南北距离不直接给出时差',instruction:'观察南北延伸的同一条色带。',
        narration:'为什么东边通常更快？因为地球向东自转，东边的地方会更早转向太阳。请再沿同一条色带向南北看：纬度主要关联季节和白昼长度，并不能直接告诉你时差。东加西减可以建立直觉；真正约会议时，不要只量经度，而要查城市在那一天使用的实际时区。'
      }
    ],
    quiz:{question:'理想模型中，向东相差 30°，太阳时约相差多少？',options:['东边约快 2 小时','东边约慢 2 小时','向北快 2 小时'],answer:0,explanation:'30° ÷ 15° = 2 小时；向东的示意钟点更快。现实民用时间仍以当地规则为准。'}
  },
  {
    id:'utc-offsets',number:3,mode:'offsets',title:'用 UTC 给世界找共同起点',
    question:'UTC+08:00，究竟在“加”什么？',
    takeaway:'当地时间 = UTC + 当地偏移；偏移可以带 30 分钟或 45 分钟。',
    sources:['bipm-utc','iana-asia'],
    stages:[
      {
        id:'common-ruler',label:'找到共同标尺',layer:'ideal',instant:JAN,focus:{lat:25,lon:0},cities:['london'],
        callouts:[{...anchor(0,0,'UTC 07:30','全球共同参照 · 不属于某一座城市'),kind:'reference'},pin('london','伦敦 07:30','本例在一月；伦敦全年并非总与 UTC 相同')],
        formula:'UTC 是共同标尺，不是“所有人都照这个钟点生活”',instruction:'先认出 UTC，再看各地在它的基础上加减多少。',
        narration:'现在给所有钟表找一个共同参照，叫协调世界时，缩写 U T C。你可以把它理解成换算时的公共刻度，不需要让每个人都按照它安排起床。它由国际计时体系共同维持，并不是一座城市独有的钟。这个一月示例里，伦敦恰好与它一样；到了英国夏令时，伦敦钟表就不再等于 U T C。'
      },
      {
        id:'plus-and-minus',label:'加号与减号',layer:'legal',instant:JAN,focus:{lat:25,lon:95},cities:['beijing','newyork'],
        callouts:[pin('beijing','UTC+08:00 → 15:30','比 UTC 快 8 小时'),pin('newyork','UTC−05:00 → 02:30','本例比 UTC 慢 5 小时')],
        formula:'07:30 + 08:00 = 15:30；07:30 − 05:00 = 02:30',instruction:'点击两个地区，对比加号和减号的方向。',
        narration:'看北京的加八：从 U T C 七点三十分加上八小时，就是北京十五点三十分。再看一月的纽约，减五表示慢五小时，所以是凌晨两点三十分。加减的是当地钟表与公共标尺之间的差，叫偏移。英文说 ahead of，表示快于；behind，表示慢于。算到午夜之外时，日期也必须一起改变。'
      },
      {
        id:'fractional-offsets',label:'不只有整小时',layer:'legal',instant:JAN,focus:{lat:20,lon:82},cities:['delhi','kathmandu','beijing'],
        callouts:[pin('delhi','印度 UTC+05:30','此刻 13:00'),pin('kathmandu','尼泊尔 UTC+05:45','此刻 13:15'),pin('beijing','北京 UTC+08:00','此刻 15:30')],
        formula:'05:45 − 05:30 = 00:15；尼泊尔比印度快 15 分钟',instruction:'放大南亚，看相邻地区怎样使用不同偏移。',
        narration:'再放大印度和尼泊尔。印度采用加五小时三十分，尼泊尔采用加五小时四十五分，因此这里不是整整差一小时，而是只差十五分钟。时区偏移可以包含半小时或四十五分钟。这也解释了为什么不能把世界简单看成只有二十四种时间：实际规则比理想色带更加丰富。'
      }
    ],
    quiz:{question:'UTC 是 08:00，UTC+05:45 地区的当地时间是？',options:['13:45','02:15','13:05'],answer:0,explanation:'在 08:00 上加 5 小时 45 分钟，得到 13:45。'}
  },
  {
    id:'calculate-time',number:4,mode:'conversion',title:'亲手把一个时刻换到另一侧',
    question:'北京凌晨两点，洛杉矶到底是几点、哪一天？',
    takeaway:'先减去出发地偏移得到 UTC，再加目的地偏移；日期一起计算。',
    sources:['usno-zones','iana-rules'],
    stages:[
      {
        id:'start-beijing',label:'① 从北京出发',layer:'legal',instant:'2026-01-15T18:00:00Z',focus:{lat:30,lon:112},cities:['beijing'],
        callouts:[pin('beijing','1 月 16 日 · 02:00','北京时间 UTC+08:00')],
        formula:'已知：北京 1 月 16 日 02:00，偏移 +08:00',instruction:'保留完整日期，准备先退回 UTC。',
        narration:'一起算一次。已知北京是一月十六日凌晨两点，我们想知道洛杉矶那边的钟点。不要只凭“美国比中国晚”来猜，也不要先丢掉日期。先把北京的位置、完整日期和加八小时的偏移记下来。接下来只做两步：从北京退回公共标尺，再从公共标尺走到洛杉矶。'
      },
      {
        id:'back-to-utc',label:'② 减去来源偏移',layer:'ideal',instant:'2026-01-15T18:00:00Z',focus:{lat:20,lon:10},cities:['london'],
        callouts:[{...anchor(0,0,'UTC · 1 月 15 日 18:00','公共标尺 · 从北京减 8 小时，日期退回一天'),kind:'reference'},pin('london','伦敦 1 月 15 日 · 18:00','本例为冬季标准时间')],
        formula:'北京 1 月 16 日 02:00 − 8 小时 = UTC 1 月 15 日 18:00',instruction:'观察日期从 16 日退回了 15 日。',
        narration:'北京比 U T C 快八小时，所以反过来要减八小时。凌晨两点减去八小时，先退到零点，再继续往前，得到前一天的十八点。现在公共标尺上的结果是一月十五日十八点。这里最容易漏掉的不是加减法，而是日历已经退回一天。跨越午夜时，日期和钟点始终要一起走。'
      },
      {
        id:'arrive-la',label:'③ 加上目的地偏移',layer:'legal',instant:'2026-01-15T18:00:00Z',focus:{lat:30,lon:-110},cities:['la','newyork','beijing'],
        callouts:[pin('la','1 月 15 日 · 10:00','一月 PST，UTC−08:00'),pin('newyork','1 月 15 日 · 13:00','同在美国，也不一定同一钟点'),pin('beijing','1 月 16 日 · 02:00','仍是同一个瞬间')],
        formula:'UTC 1 月 15 日 18:00 + (−8 小时) = 洛杉矶 1 月 15 日 10:00',instruction:'转到美国，把两步连成一次完整换算。',
        narration:'一月的洛杉矶采用太平洋标准时间，也就是 U T C 减八小时。把公共标尺的十八点再减八小时，得到一月十五日上午十点。所以北京十六日凌晨两点，对应洛杉矶十五日上午十点。通用公式就是：目的地时间，等于来源时间减来源偏移，再加目的地偏移。换其他地区时，步骤完全一样。'
      }
    ],
    quiz:{question:'北京 1 月 16 日 02:00，洛杉矶此时为 UTC−08:00，结果是？',options:['1 月 16 日 10:00','1 月 15 日 10:00','1 月 15 日 18:00'],answer:1,explanation:'两地偏移相差 16 小时；北京减去 16 小时，得到前一天 10:00。'}
  },
  {
    id:'real-boundaries',number:5,mode:'boundaries',title:'现实的时区为什么弯弯曲曲',
    question:'一个国家就是一个时区吗？一条经线就是边界吗？',
    takeaway:'经度解释自然差异，民用时区由地方规则划定；以城市与日期查询。',
    sources:['iana-rules','iana-asia','dot-zones'],
    stages:[
      {
        id:'ideal-versus-legal',label:'从理想色带到现实分区',layer:'ideal',instant:'2026-01-15T12:00:00Z',focus:{lat:25,lon:95},cities:['beijing','delhi'],
        callouts:[anchor(15,90,'理想模型：每格约 15°','下一步看实际规则'),pin('beijing','东八区是入门说法','实际边界不沿整条经线切开')],
        formula:'经度色带 ≠ 现实法定时区边界',instruction:'下一步切换现实分区，留意边界的形状。',
        narration:'前面整齐的色带，是帮助理解的模型。现实生活需要统一的交通、行政和商业安排，所以时区边界常常沿行政区或地理边界拐弯。所谓东八区，可以帮助你记住加八小时，却不表示每条边界都必须笔直。接下来比较两个例子，就能看出“一个国家等于一个时区”为什么不可靠。'
      },
      {
        id:'one-standard',label:'跨越经度，也可共用标准时间',layer:'legal',instant:'2026-01-15T12:00:00Z',focus:{lat:32,lon:105},cities:['beijing','singapore'],
        callouts:[pin('beijing','北京 20:00 · UTC+08:00','中国全国标准时间采用北京时间'),anchor(42,87,'同用北京时间时也是 20:00','太阳在天空中的位置可以不同'),pin('singapore','新加坡也是 20:00','不同国家也可能使用同一偏移')],
        formula:'经度不同可以同钟点；国别不同也可以同偏移',instruction:'比较地理位置与钟点，不要把太阳时和标准时间混为一谈。',
        narration:'中国全国标准时间采用北京时间。若两地都按北京时间计时，尽管东西相隔很远，钟面仍然相同；但太阳在天空中的位置未必相同。再看新加坡，它和中国不是同一个国家，却同样采用加八小时。因此，看国界无法直接推出时差，看见钟点相同，也不能推断两地太阳位置一样。'
      },
      {
        id:'many-zones',label:'同一国家，可以有多个时区',layer:'legal',instant:'2026-01-15T17:00:00Z',focus:{lat:32,lon:-98},cities:['la','chicago','newyork'],
        callouts:[pin('la','洛杉矶 09:00 · UTC−08:00'),pin('chicago','芝加哥 11:00 · UTC−06:00'),pin('newyork','纽约 12:00 · UTC−05:00')],
        formula:'问“美国几点”还不够；要问“美国哪座城市”',instruction:'从美国西岸点到东岸，比较同一瞬间的钟表。',
        narration:'美国则有多个时区。这个一月示例里，洛杉矶上午九点，芝加哥上午十一点，纽约已经中午十二点。它们都在美国，却不是同一个钟点。实际边界与夏令时规则还可能调整，所以不要用一张地图代替所有日期的规则。问清城市、问清日期，再让时区数据库计算，才能得到可靠结果。'
      }
    ],
    quiz:{question:'朋友说“我在美国，下午三点见”，还缺什么关键信息？',options:['只缺天气','具体日期与所在城市/时区','美国的首都名称'],answer:1,explanation:'同一国家可能使用多个时区；不同日期还可能涉及夏令时。'}
  },
  {
    id:'season-and-pt',number:6,mode:'dst',title:'PT 为什么有时差 15 小时，有时差 16 小时',
    question:'朋友说“太平洋时间”，应该把时钟拨到哪里？',
    takeaway:'以洛杉矶为例：PT 随日期采用 PST（−08:00）或 PDT（−07:00）。',
    sources:['nist-local','nist-dst','iana-theory'],
    stages:[
      {
        id:'winter-pst',label:'一月：PST 标准时间',layer:'legal',instant:'2026-01-15T17:00:00Z',focus:{lat:30,lon:-118},cities:['la','beijing'],
        callouts:[pin('la','1 月 15 日 · 09:00 PST','PT 在这里采用 UTC−08:00'),pin('beijing','1 月 16 日 · 01:00','北京比洛杉矶快 16 小时')],
        formula:'PST = UTC−08:00；北京 +08:00 − (−08:00) = 快 16 小时',instruction:'先把 PT 想成洛杉矶当地钟表，再看具体日期。',
        narration:'朋友说太平洋时间，日常常缩写成 P T。以洛杉矶为例，先把它理解为当地钟表的一套规则，而不是全年固定减八小时。一月采用太平洋标准时间，P S T，偏移为减八。因此洛杉矶一月十五日上午九点，对应北京一月十六日凌晨一点，北京快十六小时。'
      },
      {
        id:'summer-pdt',label:'七月：PDT 夏令时间',layer:'legal',instant:'2026-07-15T16:00:00Z',focus:{lat:30,lon:-118},cities:['la','beijing'],
        callouts:[pin('la','7 月 15 日 · 09:00 PDT','PT 此时采用 UTC−07:00'),pin('beijing','7 月 16 日 · 00:00','此时只快 15 小时')],
        formula:'PDT = UTC−07:00；同样是洛杉矶 09:00，北京时刻变了',instruction:'切换一月与七月，观察两地时差少了一小时。',
        narration:'到了七月，洛杉矶采用太平洋夏令时间，P D T，偏移变成减七。同样约当地上午九点，北京就变成次日零点，只快十五小时。夏令时是调整钟表，并没有让地球转得更快，也没有改变 U T C。其他地区是否采用、何时切换，都要看各自规则，不能用一个季节替全世界作判断。'
      },
      {
        id:'clock-transition',label:'切换日：有的钟点会跳过',layer:'none',instant:'2026-03-08T10:00:00Z',focus:{lat:34.05,lon:-118.24},cities:['la'],
        callouts:[pin('la','01:59 → 03:00','2026 年 3 月 8 日，没有当地 02:30')],
        transition:{cityId:'la',date:'2026-03-08',beforeInstant:'2026-03-08T09:59:00Z',afterInstant:'2026-03-08T10:00:00Z'},
        formula:'当地钟面 01:59 → 03:00；UTC 09:59 → 10:00，只过了 1 分钟',instruction:'点选跳时前、缺失区间、跳时后，或听语音逐段对照。',
        voiceCues:[
          {id:'before-transition',caption:'洛杉矶 01:59 PST ↔ UTC 09:59',phase:'before',instant:'2026-03-08T09:59:00Z',narration:'看地球上的洛杉矶。这是二零二六年三月八日，凌晨一点五十九分，采用太平洋标准时间，P S T。公共标尺 U T C 是九点五十九分。先记住这对时钟。'},
          {id:'missing-hour',caption:'洛杉矶 02:00–02:59 不存在',phase:'gap',instant:'2026-03-08T09:59:00Z',narration:'看时间轴中间的空档。当地两点到两点五十九分没有出现，因此两点三十分找不到对应瞬间。这里改变的是当地钟面的写法；地球没有跳过一小时。秋季拨回时，某些钟点则会出现两次。'},
          {id:'after-transition',caption:'洛杉矶 03:00 PDT ↔ UTC 10:00',phase:'after',instant:'2026-03-08T10:00:00Z',narration:'再过一分钟，洛杉矶钟面跳到三点，采用太平洋夏令时间，P D T。U T C 只从九点五十九分走到十点，时间连续。收到 P S T 却怀疑对方泛指 P T，最好确认日期和城市。E T 类似地指美国东部时间，C S T 等缩写还可能有多个含义。'}
        ]
      }
    ],
    quiz:{question:'洛杉矶 2026 年 7 月 15 日 09:00 PT，对应北京时间？',options:['7 月 15 日 09:00','7 月 16 日 00:00','7 月 16 日 01:00'],answer:1,explanation:'七月洛杉矶为 PDT（UTC−07:00），北京快 15 小时，因此是次日 00:00。'}
  },
  {
    id:'daily-rhythms',number:7,mode:'routines',title:'算对时间，还要看对方是否方便',
    question:'你刚吃完晚饭，朋友会不会还没起床？',
    takeaway:'当地钟点帮助估计作息；真正可用时间要询问具体的人。',
    sources:['iana-rules'],
    routineNote:'以下为三位虚构参与者的可编辑日程，用来学习换算；不是国家平均作息或对个人状态的判断。',
    stages:[
      {
        id:'one-moment-lives',label:'同一瞬间，不同日常',layer:'legal',instant:'2026-01-15T12:00:00Z',focus:{lat:20,lon:70},cities:['beijing','newyork','madrid'],
        callouts:[pin('beijing','20:00 · 下班后示例'),pin('newyork','07:00 · 尚未到可用时段'),pin('madrid','13:00 · 可用时段内')],
        routines:[{cityId:'beijing',name:'小林',start:'09:00',end:'18:00',weekdays:[1,2,3,4,5]},{cityId:'newyork',name:'Alex',start:'09:00',end:'17:00',weekdays:[1,2,3,4,5]},{cityId:'madrid',name:'Lucía',start:'10:00',end:'19:00',weekdays:[1,2,3,4,5]}],
        formula:'先换算当地钟点，再与这个人的可用时段比较',instruction:'先读城市钟点，再看地球外环的生活示意；切换城市仍是同一个瞬间。',
        caption:'外环讲生活情境，城市钟点说明当前看到的是哪一刻。',
        narration:'先看地球旁的城市钟点：此刻北京晚上八点，纽约早上七点，马德里下午一点。围绕地球的外环把二十四小时分成睡眠、用餐、通勤和工作等生活情境。它是一张工作日教学示意图，不是整座城市的人口平均值。切换城市，地球会定位到那里，时间仍是同一个瞬间。点听这座城市，还能了解有来源的地域生活线索。'
      },
      {
        id:'availability-example',label:'作息必须属于具体的人',layer:'legal',instant:'2026-01-15T09:00:00Z',focus:{lat:30,lon:45},cities:['beijing','madrid','newyork'],
        callouts:[pin('beijing','小林 · 17:00','示例可用 09:00–18:00'),pin('madrid','Lucía · 10:00','示例可用 10:00–19:00'),pin('newyork','Alex · 04:00','示例可用 09:00–17:00')],
        routines:[{cityId:'beijing',name:'小林',start:'09:00',end:'18:00',weekdays:[1,2,3,4,5]},{cityId:'newyork',name:'Alex',start:'09:00',end:'17:00',weekdays:[1,2,3,4,5]},{cityId:'madrid',name:'Lucía',start:'10:00',end:'19:00',weekdays:[1,2,3,4,5]}],
        formula:'相同国家的人，也可能有完全不同的工作与睡眠时间',instruction:'对照内环的个人联系窗口，修改这个人的可用时间、睡眠时间和星期。',
        caption:'内环属于具体的人：处于工作时段，不等于已经答应接听。',
        narration:'再看内环，它表示这个具体人物的联系窗口。外环上的工作示意，不能证明对方现在有空。这里的人物是可编辑的示例：有人早起，有人晚睡，也有人轮班。你可以修改可联系时段、睡眠时段和星期，观察内环怎样变化。地域资料提供背景，真正约通话时，要问本人当地几点方便，并确认他愿意接听。'
      },
      {
        id:'not-all-overlap',label:'没有共同窗口，也是一种结果',layer:'legal',instant:'2026-01-15T14:00:00Z',focus:{lat:25,lon:-20},cities:['beijing','newyork','madrid'],
        callouts:[pin('beijing','22:00 · 已超出窗口'),pin('newyork','09:00 · 刚进入窗口'),pin('madrid','15:00 · 窗口内')],
        routines:[{cityId:'beijing',name:'小林',start:'09:00',end:'18:00',weekdays:[1,2,3,4,5]},{cityId:'newyork',name:'Alex',start:'09:00',end:'17:00',weekdays:[1,2,3,4,5]},{cityId:'madrid',name:'Lucía',start:'10:00',end:'19:00',weekdays:[1,2,3,4,5]}],
        formula:'没有共同工作时段 → 商量轮换、异步留言或特定例外',instruction:'把个人窗口带到约时间工具，检查双方日期及完整通话时长。',
        caption:'先看完整联系窗口；没有交集时，可留言或商量轮换。',
        narration:'现在纽约早上九点，北京已经晚上十点。拨动时间或点击作息环，看看完整的三十分钟是否都落在个人联系窗口内。睡眠时段、周末和跨午夜的日期，也要一起检查。把这个示例带到约时间工具，再确认双方是否方便。如果普通窗口没有交集，可以异步留言，或商量轮流调整。时间换算给出钟点，个人确认才能形成约定。'
      }
    ],
    quiz:{question:'知道朋友所在城市后，可以直接断定他什么时候睡觉吗？',options:['可以，时区决定所有人的作息','不可以，还要问个人日程与偏好','只要知道国家就足够'],answer:1,explanation:'时区决定当地钟表如何读数，不决定每个人的职业、睡眠或可用时间。'}
  },
  {
    id:'meet-together',number:8,mode:'meeting',title:'让两个人真正同时到场',
    question:'怎样把“我们明天九点见”说成一个不会误解的约定？',
    takeaway:'完整日期 + 当地时间 + 城市时区 + 时长，再用日历邀请确认同一瞬间。',
    sources:['iana-theory','nist-local','w3c-time'],
    stages:[
      {
        id:'name-the-place',label:'① 不只说“明天九点”',layer:'legal',instant:'2026-01-15T01:00:00Z',focus:{lat:25,lon:155},cities:['beijing','la'],
        callouts:[pin('beijing','1 月 15 日 · 09:00','这才是“北京的九点”'),pin('la','1 月 14 日 · 17:00','对方仍在前一天')],
        formula:'“明天”是谁的日期？“九点”是谁的钟表？',instruction:'先对齐双方日历上的日期，再谈是否方便。',
        narration:'最后把知识用来约一次真实的通话。不要只说“明天九点”，因为两人的明天和九点可能都不一样。这个例子里，北京一月十五日上午九点，洛杉矶还是一月十四日下午五点。先确认对方所说的城市与日期，再列出双方读到的钟点。你们无需把手机设置成同一个时区。'
      },
      {
        id:'one-instant-two-clocks',label:'② 写出双方时间',layer:'legal',instant:'2026-01-15T01:00:00Z',focus:{lat:30,lon:-120},cities:['la','beijing'],
        callouts:[pin('la','Jan 14 · 5:00 PM PST','America/Los_Angeles · UTC−08:00'),pin('beijing','Jan 15 · 09:00','Asia/Shanghai · UTC+08:00')],
        formula:'2026-01-15 09:00 北京 = 2026-01-14 17:00 洛杉矶 = 01:00 UTC',instruction:'两份钟面读数不同，但指向同一条地球时间线。',
        narration:'可以这样写：二零二六年一月十五日，北京时间上午九点；也就是一月十四日，洛杉矶下午五点，通话三十分钟，你方便吗？软件里选择 Asia Shanghai 或 America Los Angeles 这样的城市时区，让它按日期处理规则。时间戳结尾的 Z 表示 U T C；local time 则表示某地当地时间，仍要说明是哪里。'
      },
      {
        id:'confirm-and-calendar',label:'③ 确认并发日历邀请',layer:'legal',instant:'2026-01-15T01:00:00Z',focus:{lat:25,lon:155},cities:['beijing','la'],
        callouts:[pin('beijing','09:00–09:30','确认自己的日期与时长'),pin('la','17:00–17:30 · 前一天','确认对方日期与时长')],
        formula:'一次会议对齐同一瞬间；每周会议还要约定固定哪一方当地时间',instruction:'点击“用这个案例继续”，带着北京、洛杉矶和这次通话的日期去安排见面。',
        caption:'把同一个案例带到约时间工具，检查双方日期与完整时长。',
        narration:'点击用这个案例继续，北京、洛杉矶和这次通话的日期会一起带到约时间工具。先检查双方是否方便，再生成带时区的日历邀请，让各自日历显示本地时间。每周固定会议还要说清固定哪一方的当地钟点，因为夏令时可能改变另一方的时间。现在试着把这次三十分钟的约定，放到双方都能读懂的日历上。'
      }
    ],
    quiz:{question:'跨国会议“时间一致”，真正需要一致的是什么？',options:['两台手机的时区设置','钟面都显示上午九点','双方开始的同一瞬间'],answer:2,explanation:'当地日期与钟点可以不同；明确双方的时间、时区和时长，指向同一个开始瞬间即可。'}
  }
].map(lesson => {
  const stages=lesson.stages.map(stage=>{const voiceCues=stage.voiceCues||lessonSemanticCues[lesson.id]?.[stage.id];return {...stage,...(voiceCues?{voiceCues}:{}),caption:stage.caption||stage.formula,narration:voiceCues?voiceCues.map(cue=>cue.narration).join('\n\n'):stage.narration};});
  return {...lesson,stages,narration:stages.map(stage=>stage.narration).join('\n\n')};
});

export const globeLessonById = id => globeLessons.find(lesson => lesson.id === id);
