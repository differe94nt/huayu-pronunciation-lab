/* config.js 的班級解析：網址的 ?class= 決定這次算哪一班。
   重點是「打錯字不能偷偷開一個新班級」——否則學生的資料
   會存進一個老師永遠不會去看的地方。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');

function load(search, classes) {
  let src = SRC;
  if (classes) {
    src = src.replace(/classes: \[[^\]]*\]/, 'classes: ' + JSON.stringify(classes));
  }
  const fn = new Function('window', 'location', src + '\nreturn window.HPL_CONFIG;');
  return fn({}, { search });
}

const TWO = ['2026-fall', '2026-fall-B'];

test('no query string uses the default class', () => {
  assert.equal(load('', TWO).classId, '2026-fall');
  assert.equal(load('', TWO).classWarning, undefined);
});

test('an allowed class in the URL switches the class', () => {
  assert.equal(load('?class=2026-fall-B', TWO).classId, '2026-fall-B');
  assert.equal(load('?class=2026-fall-B', TWO).classWarning, undefined);
});

test('the class parameter is found after other parameters and before a fragment', () => {
  assert.equal(load('?foo=1&class=2026-fall-B', TWO).classId, '2026-fall-B');
  assert.equal(load('?class=2026-fall-B#tab', TWO).classId, '2026-fall-B');
});

test('an unlisted class never becomes a silent new bucket', () => {
  const c = load('?class=2027-spring', TWO);
  assert.equal(c.classId, '2026-fall');
  assert.match(c.classWarning, /不在/);
});

test('an injected value is rejected rather than used as a class id', () => {
  const c = load('?class=%3Cscript%3Ealert(1)%3C%2Fscript%3E', TWO);
  assert.equal(c.classId, '2026-fall');
  assert.ok(c.classWarning);
});

test('an empty class parameter falls back without warning', () => {
  const c = load('?class=', TWO);
  assert.equal(c.classId, '2026-fall');
  assert.equal(c.classWarning, undefined);
});

test('a default not present in the list is corrected to the first entry', () => {
  const c = load('', ['2027-spring', '2027-summer']);
  assert.equal(c.classId, '2027-spring');
  assert.deepEqual(c.classes, ['2027-spring', '2027-summer']);
});

test('the shipped config lists its own default class', () => {
  const c = load('');
  assert.ok(Array.isArray(c.classes) && c.classes.length > 0);
  assert.ok(c.classes.includes(c.classId),
    'config.js 的 classId 必須列在 classes 裡，否則後端會擋掉寫入');
});
