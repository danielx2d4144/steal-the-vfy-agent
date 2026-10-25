// Round-robin of strategies from the circuit's policy family under an ASSUMED resolver
// (extract up to amount from opponent balance, fortify costs 2 and cuts incoming by 6 this turn).
// Real resolver v1 numbers are frozen by the platform before scored play; re-run then.
const { policy } = require('../src/policy');
function match(a, b, turns = 20) {
  let A = 100, B = 100;
  for (let t = 1; t <= turns; t++) {
    const x = policy(a, A, B), y = policy(b, B, A);
    const take = (act, oppAct, oppBal) => act.type !== 'EXTRACT' ? 0 : Math.min(oppBal, Math.max(0, act.amount - (oppAct.type === 'FORTIFY' ? 6 : 0)));
    const ga = take(x, y, B), gb = take(y, x, A);
    A += ga - gb - (x.type === 'FORTIFY' ? 2 : 0); B += gb - ga - (y.type === 'FORTIFY' ? 2 : 0);
    A = Math.max(0, A); B = Math.max(0, B);
  }
  return A > B ? 18 : A === B ? 9 : 3;
}
const pool = [];
for (const p0 of [1, 5, 8, 10]) for (const p1 of [0, 60, 90, 100, 101]) for (const p2 of [0, 50, 90, 100]) for (const p3 of [0, 1]) pool.push([p0, p1, p2, p3, 0, 0, 0, 0]);
const score = pool.map(a => ({ a: a.slice(0, 4).join(','), pts: pool.reduce((s, b) => s + match(a, b), 0) / pool.length }));
score.sort((x, y) => y.pts - x.pts);
console.log('avg match points vs the whole family (p0,p1,p2,p3):');
for (const s of score.slice(0, 8)) console.log(s.a.padEnd(14), s.pts.toFixed(2));
console.log('...worst:', score.slice(-3).map(s => s.a + ' ' + s.pts.toFixed(2)).join(' | '));
