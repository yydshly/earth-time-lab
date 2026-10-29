/** Keep a clock's date independently addressable without repeating it in detail. */
export function splitGlobeLabelDetails(entry={}){
  const lines=String(entry.detail??'').split('\n'),matchLine=line=>/^(\d{4}-\d{2}-\d{2})(.*)$/.exec(line.trim());
  const firstDate=lines.map(matchLine).find(Boolean),date=entry.date?String(entry.date):firstDate?.[1]||'';
  const detail=lines.map(line=>{const match=matchLine(line);return match?.[1]===date?match[2].trim().replace(/^[·|]\s*/u,''):line;}).filter(line=>line.trim()).join('\n');
  return {date,detail};
}
