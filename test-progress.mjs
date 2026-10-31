import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const math = vm.runInNewContext(readFileSync(new URL('./progress-math.js', import.meta.url), 'utf8') + ';readingMath');
test('un chapitre quatre fois plus long contribue quatre fois plus au total', () => {
  assert.equal(math.total([100, 400], [1, 0]), .2);
  assert.equal(math.total([100, 400], [0, .5]), .4);
});
test('sauter un chapitre ne remplit pas les chapitres précédents', () => {
  assert.deepEqual(Array.from(math.advance([0, 0, 0], 2, .3)), [0, 0, .3]);
});
test('revenir en arrière conserve l’avancée atteinte dans le chapitre', () => {
  assert.deepEqual(Array.from(math.advance([.8, .2], 0, .1)), [.8, .2]);
});
test('100 % exige la fin effective ; les données invalides restent bornées', () => {
  assert.equal(math.percent(.999), 99);
  assert.equal(math.percent(1), 100);
  assert.equal(math.total([1, 4], [1, 1]), 1);
  assert.equal(math.total([1, 4], [-8, 40]), .8);
});
test('retour de la page 12 à la page 8 : clair jusqu’à 8, foncé jusqu’à 12, gris après', () => {
  const colors = math.colors(.6, 0, 0, .4);
  assert.equal(colors.current, .4);
  assert.ok(Math.abs(colors.retained - .2) < 1e-10);
  assert.equal(colors.unread, .4);
});
test('les chapitres sautés restent gris, même avant le curseur', () => {
  assert.equal(math.colors(0, 0, 2, .5).current, 0);
  assert.equal(math.colors(0, 0, 2, .5).unread, 1);
  assert.equal(math.colors(.8, 3, 2, .5).current, 0);
  assert.equal(math.colors(.8, 3, 2, .5).retained, .8);
});
