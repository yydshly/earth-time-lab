import test from 'node:test';
import assert from 'node:assert/strict';
import {splitGlobeLabelDetails} from '../dist/globe-label-model.mjs';
test('spoken date has one line even when the original live detail puts its phase first',()=>{
  assert.deepEqual(splitGlobeLabelDetails({date:'2026-10-28',detail:'当地上午\n2026-10-28 · PDT'}),{date:'2026-10-28',detail:'当地上午\nPDT'});
});
test('a strict fixed clock keeps the actual city date and time as a separate explanation',()=>{
  assert.deepEqual(splitGlobeLabelDetails({date:'2026-12-03',detail:'2026-12-03 · UTC−07:00\n当地实际 PST 2026-12-02 23:00（补充）'}),{date:'2026-12-03',detail:'UTC−07:00\n当地实际 PST 2026-12-02 23:00（补充）'});
});
