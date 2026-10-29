/** Independent speech clips carry explicit visual targets, rather than inferred word timings. */
const city=(id,caption,narration,cityId,field,text='')=>({id,caption,narration,target:{cityId,field,text}});
const reference=(id,caption,narration,field='time')=>({id,caption,narration,target:{reference:'utc',field}});
const formula=(id,caption,narration)=>({id,caption,narration,target:{reference:'formula',field:'teaching'}});

export const lessonSemanticCues={
  'clock-reading':{
    'read-date':[
      city('place','先认地点：北京','先看地球上亮起的北京。城市告诉我们读哪里的钟表。一个完整的时刻，要读三件事：在哪里、哪一天、几点钟。','beijing','teaching','地点：北京'),
      city('date','再读日期：2026 年 1 月 15 日','现在看北京亮起的日期：二零二六年一月十五日。日期说明是哪一天。','beijing','date'),
      city('clock','最后读钟点：15:30，下午三点半','再看北京亮起的钟点：十五点三十分，也就是下午三点半。钟点说明一天进行到了哪里。通常一天有二十四小时，一小时有六十分钟。先把地点、日期和钟点读完整，下一步再认识不同写法。','beijing','time')
    ],
    'two-clocks':[
      city('twenty-four','24 小时制：15:30','先看北京亮起的十五点三十分。二十四小时制从零点计到二十三点五十九分。','beijing','time'),
      city('am-pm','同一钟点：15:30 = 3:30 PM','现在看两种写法。十二小时制把一天分成上午和下午。十五点三十分，写成英文就是三点三十分，P M；它们是同一个钟点。','beijing','teaching','15:30 = 3:30 PM'),
      city('noon-midnight','午夜和正午：留意 12 AM / 12 PM','电子钟通常把午夜写成十二 A M，把中午写成十二 P M。这两种写法很容易看反，所以约事情时，直接写零点或十二点，并带上日期，会更清楚。','beijing','teaching','午夜 00:00 = 12 AM；正午 12:00 = 12 PM')
    ],
    'same-instant':[
      city('beijing-date','北京的日历：1 月 16 日','现在把时间往前拨。先看北京亮起的日期，已经到了一月十六日。','beijing','date'),
      city('beijing-clock','北京的钟点：00:00','再看北京的零点，新的一天开始了。','beijing','time'),
      city('la-date','洛杉矶仍是 1 月 15 日','转到地球另一侧，看洛杉矶亮起的日期。这里仍是一月十五日，比北京的日期早一天。','la','date'),
      city('la-clock','洛杉矶的钟点：08:00','再看洛杉矶的钟点，是早上八点。','la','time'),
      city('newyork-clock','纽约：1 月 15 日 11:00','同一瞬间，纽约是一月十五日上午十一点。现在看纽约这只钟。','newyork','time'),
      formula('one-instant','日期和钟点不同，仍是同一个瞬间','这不是先后发生的三件事，而是同一瞬间的三种当地写法。跨国聊天时，只说今天、明天或晚上，很容易说成不同日期。先记住，我们要对齐的是同一瞬间。')
    ]
  },
  'utc-offsets':{
    'common-ruler':[
      reference('common-clock','共同标尺：UTC 07:30','现在看地球旁亮起的共同标尺，协调世界时，缩写 U T C。这个示例是七点三十分。你可以把它理解成换算时的公共刻度。'),
      reference('not-a-city','UTC 是共同参照，不是某座城市','这个标尺由国际计时体系共同维持，不是一座城市独有的钟，也不需要让每个人都按它安排起床。','teaching'),
      city('london-clock','本例伦敦：07:30','再看地球上的伦敦。这个一月示例里，伦敦恰好与 U T C 一样，都是七点三十分。到了英国夏令时，伦敦钟表就不再等于 U T C。','london','time')
    ],
    'plus-and-minus':[
      reference('start-utc','先看 UTC：07:30','先看亮起的公共标尺：U T C 七点三十分。'),
      city('beijing-offset','北京：UTC+08:00 → 15:30','看北京亮起的加八。从 U T C 七点三十分加上八小时，就是北京十五点三十分。','beijing','teaching','UTC+08:00 → 15:30'),
      city('newyork-offset','纽约：UTC−05:00 → 02:30','再看一月的纽约。减五表示比公共标尺慢五小时，所以是凌晨两点三十分。','newyork','teaching','UTC−05:00 → 02:30'),
      formula('offset-meaning','当地钟点 = UTC + 当天的偏移','加减的是当地钟表与公共标尺之间的差，叫偏移。英文说 ahead of，表示快于；behind，表示慢于。算到午夜之外时，日期也必须一起改变。')
    ],
    'fractional-offsets':[
      city('india','印度：UTC+05:30 → 13:00','放大印度。它采用加五小时三十分，公共标尺七点三十分，对应当地十三点。先看印度亮起的规则。','delhi','teaching','UTC+05:30 → 13:00'),
      city('nepal','尼泊尔：UTC+05:45 → 13:15','再看尼泊尔，它采用加五小时四十五分，此刻是十三点十五分。','kathmandu','teaching','UTC+05:45 → 13:15'),
      formula('quarter-hour','相邻两地：只差 15 分钟','所以这两地不是整整差一小时，而是只差十五分钟。时区偏移可以包含半小时或四十五分钟。这也解释了为什么不能把世界简单看成只有二十四种时间：实际规则比理想色带更加丰富。')
    ]
  }
};

export function lessonCueTarget(stage,cue,{follow=true,modifiedTime=false}={}){
  const target=cue?.target;if(!follow||modifiedTime||!target)return null;
  if(target.cityId&&!stage.cities?.includes(target.cityId))return null;
  if(!['date','time','teaching'].includes(target.field))return null;
  if(target.cityId)return {...target};
  return ['utc','formula'].includes(target.reference)?{...target}:null;
}
