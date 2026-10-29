/**
 * Why civil time serves people: a causal path from daylight to coordination.
 * Primary sources checked 2026-10-28. Narration describes teaching examples;
 * mean solar clocks use longitude only, not the equation of time or sunrise.
 */
export const humanTimeSources = [
  {id:'nasa-daynight',title:'NASA · 地球转动与昼夜',url:'https://imagine.gsfc.nasa.gov/ask_astro/earth.html',note:'地球转动使各地交替朝向与背离太阳，形成日常昼夜周期。'},
  {id:'nih-bodyclock',title:'NIH · 睡眠、光暗线索与个人生物钟差异',url:'https://www.nhlbi.nih.gov/health/sleep/sleep-wake-cycle',note:'光暗等环境线索帮助身体生物钟与一天同步；有人自然偏早、有人偏晚，年龄与轮班等也会影响作息。'},
  {id:'usno-standard',title:'美国海军天文台 · 标准时间的历史与用途',url:'https://aa.usno.navy.mil/faq/us_tzones',note:'北美铁路于 1883 年引入分区标准时间，取代许多地方太阳时；通信和旅行的实际便利推动普及。该历史案例不代表全球同时采用同一方案。'},
  {id:'bipm-shared',title:'BIPM · UTC：让世界系统对齐的共同标尺',url:'https://www.bipm.org/en/time-department/utc',note:'UTC 是国际共同参考时间标尺，支撑导航、通信、基础设施与民用授时服务的同步。'},
  {id:'cas-local',title:'中国科学院地理所 · 地方时与统一标准时间',url:'https://igsnrr.cas.cn/cbkx/kpyd/dlzs/earth/202009/t20200910_5692488.html',note:'经度每差 1°，地方时约差 4 分钟；中国采用统一北京时间便于东西联系。此处只采用上述原理，不把理想 15° 分带当作现实边界。'},
  {id:'nist-social',title:'NIST · 时区与地方生活的协调',url:'https://www.nist.gov/pml/time-and-frequency-division/popular-links/walk-through-time/walk-through-time-world-time-scales',note:'历史档案页面：时区边界会按地方人口的便利与需要调整。当前法定规则仍应按具体日期与 IANA 城市时区查询。'}
];

export const humanTimeSteps = [
  {
    id:'sun',label:'太阳带来周期',visual:'sun',
    title:'先有昼夜，人们才给一天标上钟点',
    cause:'地球转动，各地轮流朝向和背离太阳。',
    effect:'同一瞬间，地球两侧处在一天的不同阶段。',
    principle:'钟表给一天标刻度；昼夜由地球与太阳的关系形成。',
    narration:'先看地球，不急着看钟表。地球不停转动，同一地点轮流朝向太阳、再转到背向太阳的一侧，于是生活有了反复出现的白昼与黑夜。同一瞬间，地球不同地方也可能处在早晨、午后或深夜。人们需要安排吃饭、劳作、出行与休息，便给一天标上可以共同说出的刻度。钟点帮助我们描述一天进行到哪里；把钟表拨快一小时，并不会让太阳立刻移动，也不会让身体立刻进入下一个生活阶段。',
    voiceCues:[
      {id:'morning',label:'清晨 → 正午',fromMinutes:0,toMinutes:360,caption:'盯住北京这个观察点，看它走进明亮的一侧。',narration:'先固定一个观察点：北京。地球上的亮点始终代表同一个地方，旁边的钟表也始终读北京时间。我们从三月二十日清晨六点开始，看这个地方转向太阳，进入明亮的一侧，再走向正午。先记住，改变的是这个地点和阳光的相对方向；白天来自这种关系。这里是昼夜教学演示，不能用来预报精确日出。'},
      {id:'afternoon',label:'正午 → 傍晚',fromMinutes:360,toMinutes:720,caption:'仍然看同一个北京；钟点向前，它逐渐离开白昼。',narration:'仍然看同一个北京。现在从正午走向傍晚，钟点继续前进，观察点也逐渐离开明亮的一侧。太阳不需要围着每个人单独转一圈，各地也不会同时到达中午。钟表给这个连续的过程标上刻度，帮助我们说清楚现在是一天的哪一段。'},
      {id:'night',label:'傍晚 → 午夜',fromMinutes:720,toMinutes:1080,caption:'北京转到背向太阳的一侧；背面标记仍代表原来的地点。',narration:'北京继续转到背向太阳的一侧，从傍晚走向午夜。若观察点到了地球背面，标注会写明地球背面，并继续显示同一个地点的钟表。黑夜没有让这个地点消失。当地夜间可以帮助我们理解休息的背景，但不能断定每个人都已经睡觉；夜班、家庭安排和个人偏好都可能不同。'},
      {id:'next-morning',label:'午夜 → 次日清晨',fromMinutes:1080,toMinutes:1440,caption:'回到清晨，日历已经翻到第二天；同一地点完成一天。',narration:'地球继续转动，从午夜走到第二天清晨。我们又回到接近出发的光照阶段，北京的日历已经多了一天。人们给这一整个循环安排吃饭、工作、出行与休息，再用钟点相互约定。把钟表拨快一小时，不会让太阳立刻移动。下一步，我们再看人的身体和社会安排怎样共同影响作息。'}
    ],
    sources:['nasa-daynight']
  },
  {
    id:'body',label:'人怎样过一天',visual:'body',
    title:'人的一天同时受到光照、身体和社会安排影响',
    cause:'身体有约 24 小时的节律，光暗是重要线索。',
    effect:'上学、工作、家庭分工和个人差异，共同塑造实际作息。',
    principle:'天亮不等于每个人都醒着，工作时段也不等于随时方便通话。',
    narration:'光照与黑暗会给身体提供时间线索，帮助生物钟跟上一天的循环。因此作息和昼夜有关，但人的生活也受到工作、学校、家庭安排以及个人差异影响。有人自然偏早起，有人偏晚睡，夜班工作者还可能白天休息。看见地球这一侧是白天，只能帮助理解生活背景，不能断定某个人已经起床或现在有空。我们展示地域生活示意，是为了解释可能的节奏；真正安排联系，还需要这个人自己的睡眠与可用时间。',
    sources:['nih-bodyclock']
  },
  {
    id:'coordination',label:'各地太阳钟的难题',visual:'coordination',
    title:'每个地方按自己的太阳计时，跨城约事就复杂了',
    cause:'经度不同，太阳经过各地子午线的时刻不同。',
    effect:'交通和通信跨越城市后，许多地方钟表使时刻表难以协调。',
    principle:'太阳时保留地方差异；共同约事还需要容易对齐的公共规则。',
    narration:'如果每个城市都按当地太阳安排自己的钟表，地方的中午很好理解，跨城约事却会变复杂。往东或往西走，钟点会随着经度改变；经度相差一度，平均太阳钟约差四分钟。成都与上海相差约十七点四度，按经度估算的太阳钟就相差约七十分钟。铁路和通信把许多城市连在一起后，人们需要更容易共同使用的时刻表。北美铁路采用标准时区，就是解决这种协调问题的一个历史例子。',
    sources:['cas-local','usno-standard']
  },
  {
    id:'civil',label:'公共时间的用途',visual:'civil',
    title:'时区把许多地方的钟表合并成共同使用的规则',
    cause:'人们需要减少逐城对时的成本，同时顾及地方生活。',
    effect:'一个区域共享民用时间，跨区再用 UTC 和偏移对应同一瞬间。',
    principle:'时区服务于协作；统一钟表不会统一各地的天色与生活。',
    narration:'时区可以理解为人们共同采用的一套公共钟表规则。同一区域使用统一时间，车票、上课、营业和约会就容易对齐；跨区域再用协调世界时，也就是 UTC，作为共同参照。现实边界还会考虑行政与生活联系。成都和上海都用北京时间，公共钟表可以同读十二点，但按经度估算的平均太阳钟约是十点五十六分与十二点零六分。统一的是公共刻度，各地的太阳位置和实际生活仍有差别。',
    sources:['cas-local','bipm-shared','nist-social']
  },
  {
    id:'person',label:'最终回到具体的人',visual:'person',
    title:'算对同一瞬间，是为了找到彼此方便的一段时间',
    cause:'双方钟表不同，实际生活和个人安排也不同。',
    effect:'先换算当地日期与钟点，再确认个人窗口和整段通话是否合适。',
    principle:'时区回答“对方那里几点”；本人回答“这段时间方不方便”。',
    narration:'最后回到我们为什么学习时区：让彼此在同一瞬间见面，也尊重各自正在过的一天。时区规则先帮我们算清楚，对方那里是哪一天、几点钟；地域生活背景再帮助我们理解，那个钟点可能意味着通勤、用餐或休息。最后还要问具体的人，他何时睡觉、何时愿意联系，并检查整个三十分钟是否都在窗口内。若没有共同空档，可以先留言或另约日期。理解时间的目的，是让合作顺利，也让对方的生活得到尊重。',
    sources:['bipm-shared','nih-bodyclock']
  }
];
