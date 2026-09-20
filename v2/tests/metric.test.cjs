/* 觀察側的三種指標。單位不同，不能互相代換，
   所以要確定退而求其次的順序正確、而且標示對。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const V2 = path.join(__dirname, '..');
global.window = global;
global.HPL_CONFIG = { contentBase: 'content/' };
global.fetch = (p) => Promise.resolve({
  ok: true, status: 200,
  text: () => Promise.resolve(fs.readFileSync(path.join(V2, p), 'utf8'))
});
for (const f of ['assets/md.js', 'assets/data.js', 'assets/compare.js']) {
  eval(fs.readFileSync(path.join(V2, f), 'utf8'));
}

const rec = (o) => Object.assign(
  { l1: '法語', group: '第二組', spkId: 'F-a', tag: '送氣／不送氣對立', key: 'aspiration' }, o);

let D;
test.before(async () => { D = await HPLData.load(); });

test('with denominators it reports a true occurrence rate', () => {
  const recs = [rec({ id: 'a', denom: 20 }), rec({ id: 'b', spkId: 'F-b', denom: 20 })];
  const res = HPLCompare.compare(D, HPLCompare.aggregate(recs, D), '法語');
  assert.equal(res.metric, 'rate');
  const asp = res.rows.find(r => r.key === 'aspiration');
  assert.equal(asp.rate, 2 / 40);
  assert.equal(asp.obsValue, asp.rate);
});

test('without denominators it falls back to share of all annotations', () => {
  const recs = [
    rec({ id: 'a' }), rec({ id: 'b', spkId: 'F-b' }),
    rec({ id: 'c', tag: '鼻韻尾 -n／-ng', key: 'ngn', spkId: 'F-b' }),
    rec({ id: 'd', tag: '鼻韻尾 -n／-ng', key: 'ngn', spkId: 'F-a' })
  ];
  const res = HPLCompare.compare(D, HPLCompare.aggregate(recs, D), '法語');
  assert.equal(res.metric, 'share');
  const asp = res.rows.find(r => r.key === 'aspiration');
  assert.equal(asp.rate, null, '沒有分母就不該報出現率');
  assert.equal(asp.share, 2 / 4);
  assert.equal(asp.obsValue, asp.share);
});

test('share is a proportion of annotations, never of opportunities', () => {
  /* 同一個標籤標 3 次、另一個標 1 次 → 佔比 3/4，不是「出現率 75%」 */
  const recs = [
    rec({ id: 'a' }), rec({ id: 'b', spkId: 'F-b' }), rec({ id: 'c', spkId: 'F-c' }),
    rec({ id: 'd', tag: 'h 舌根擦音', key: 'h' })
  ];
  const res = HPLCompare.compare(D, HPLCompare.aggregate(recs, D), '法語');
  const asp = res.rows.find(r => r.key === 'aspiration');
  assert.equal(asp.share, 3 / 4);
  assert.equal(asp.hits, 3);
  assert.equal(asp.denom, 0);
});

test('a partially filled denominator still counts as rate mode', () => {
  const recs = [rec({ id: 'a', denom: 10 }), rec({ id: 'b', spkId: 'F-b' })];
  const res = HPLCompare.compare(D, HPLCompare.aggregate(recs, D), '法語');
  assert.equal(res.metric, 'rate');
  assert.ok(res.denomShare > 0 && res.denomShare < 1);
});

test('no annotations at all reports coverage mode and no false misses', () => {
  const res = HPLCompare.compare(D, {}, '法語');
  assert.equal(res.metric, 'coverage');
  assert.equal(res.records, 0);
});

test('verdicts are unaffected by which metric is in use', () => {
  const recs = [rec({ id: 'a' }), rec({ id: 'b', spkId: 'F-b' })];
  const res = HPLCompare.compare(D, HPLCompare.aggregate(recs, D), '法語');
  assert.equal(res.rows.find(r => r.key === 'aspiration').verdict, 'hit');
  assert.equal(res.rows.find(r => r.key === 'h').verdict, 'miss');
});
