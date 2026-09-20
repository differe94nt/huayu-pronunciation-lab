/* 時間碼容錯。
   雲端播放器模式抓不到時間碼，學生得看著播放器自己打，
   所以輸入格式要寬鬆——但不能把看不懂的輸入吃掉。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const body = src.match(/function normTC\(v\)\{[\s\S]*?\n\}/);
assert.ok(body, 'index.html 裡找不到 normTC()');
const normTC = new Function(body[0] + '\nreturn normTC;')();

test('plain seconds become m:ss', () => {
  assert.equal(normTC('83'), '1:23');
  assert.equal(normTC('37'), '0:37');
  assert.equal(normTC('600'), '10:00');
  assert.equal(normTC('0'), '0:00');
});

test('already-correct timecodes are left alone', () => {
  assert.equal(normTC('1:23'), '1:23');
  assert.equal(normTC('0:05'), '0:05');
});

test('common separators are accepted', () => {
  assert.equal(normTC('1.23'), '1:23');
  assert.equal(normTC('1：23'), '1:23');   // 全形冒號
  assert.equal(normTC('1分23秒'), '1:23');
  assert.equal(normTC('1分23'), '1:23');
});

test('single-digit seconds are padded', () => {
  assert.equal(normTC('2:7'), '2:07');
});

test('unparseable input is preserved rather than discarded', () => {
  assert.equal(normTC('abc'), 'abc');
  assert.equal(normTC('第二段'), '第二段');
});

test('blank stays blank', () => {
  assert.equal(normTC(''), '');
  assert.equal(normTC('   '), '');
  assert.equal(normTC(null), '');
});

test('seconds over 59 are clamped rather than producing nonsense', () => {
  assert.equal(normTC('1:75'), '1:59');
});
