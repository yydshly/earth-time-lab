export function narrationText(chapter){return [chapter.title+'。',...chapter.paragraphs.map(p=>p.heading+'。\n'+p.text),'这一章，请记住。'+chapter.takeaways.map(t=>t.replace(/[。！？.!?]+$/,'')).join('。')+'。'].join('\n\n');}
export const estimatedSeconds=chapter=>Math.ceil(narrationText(chapter).length/4.1);
