/**
 * Node tests for the Fusion Helper synergy engine.
 * Run: node fusion/fusion.test.js
 */
import * as E from './fusion-engine.js';
import { Parallel } from '../shared/parallels.js';

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function eq(name, a, b) { ok(name + ' (got ' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b)); }

// --- Fixtures ---
const fusion = {
  week: 'W1',
  attributes: {
    player: 'Kaka Silva', club: 'AC Milan', position: 'Midfielder',
    skillType1: 'Control', skillType2: 'Accuracy', set: 'Base', license: 'PL',
  },
  rows: [],
};
function card(o) {
  return Object.assign({
    'First Name': '', 'Second Name': '', 'Club': '', 'Position': '',
    'Skill Type #1': '', 'Skill Type #2': '', 'Set': '', 'License': '', 'Parallel': 'Base',
  }, o);
}

// --- P1: attrSynergy step function ---
eq('P1 count1=0', E.attrSynergy(1), 0);
eq('P1 count2=2', E.attrSynergy(2), 2);
eq('P1 count3=5', E.attrSynergy(3), 5);
eq('P1 count4=8', E.attrSynergy(4), 8);
eq('P1 count5=12', E.attrSynergy(5), 12);
eq('P1 count6=12', E.attrSynergy(6), 12);
ok('P1 count0 ineligible', E.attrSynergy(0) === null);
ok('P1 never negative', [0,1,2,3,4,5,6].every(n => (E.attrSynergy(n) || 0) >= 0));

// --- match counting ---
const c3 = card({ 'Club': 'AC Milan', 'Position': 'Midfielder', 'Skill Type #1': 'Control' }); // club+pos+st1 = 3
eq('match count = 3', E.countMatches(c3, fusion, {}).count, 3);
eq('synergy for 3 = 5', E.attrSynergy(E.countMatches(c3, fusion, {}).count), 5);

// --- set is a Set + License pair ---
const cSetLic = card({ 'Set': 'Base', 'License': 'PL' });
ok('set matches when set AND license match', E.countMatches(cSetLic, fusion, {}).matched.includes('set'));
const cSetOnly = card({ 'Set': 'Base', 'License': 'Champions' });
ok('set does NOT match when license differs', !E.countMatches(cSetOnly, fusion, {}).matched.includes('set'));
// omitted "set" requirement uses the combined pair
const reqSet = E.parseRequirement('set', fusion);
ok('req set matches Base(PL)', reqSet(cSetLic) === true);
ok('req set rejects Base(Champions)', reqSet(cSetOnly) === false);
eq('formatRequirement set -> Set: Base (PL)', E.formatRequirement('set', fusion), 'Set: Base (PL)');

// --- P2: physical excludes skill types & count <= base ---
const cSkills = card({ 'Club': 'AC Milan', 'Skill Type #1': 'Control', 'Skill Type #2': 'Accuracy' }); // club+st1+st2 = 3
const baseCount = E.countMatches(cSkills, fusion, {}).count;
const physCount = E.countMatches(cSkills, fusion, { excludeSkillTypes: true }).count;
eq('P2 base count 3', baseCount, 3);
eq('P2 physical count 1 (club only)', physCount, 1);
ok('P2 physical <= base', physCount <= baseCount);

// --- P3: variant value composition ---
const v = E.cardVariants(c3, fusion, ['Base', '#/77']);
ok('P3 eligible', v !== null);
const baseVar = v.variants.find(x => x.parallel === 'Base');
const p77 = v.variants.find(x => x.parallel === '#/77');
eq('P3 base value == baseSynergy', baseVar.value, v.baseSynergy);
eq('P3 #/77 value = attr + 2', p77.value, v.baseSynergy + 2);
ok('P3 ineligible returns null', E.cardVariants(card({ 'Club': 'Nowhere' }), fusion, ['Base']) === null);

// physical variant: skill types excluded, so cSkills (club+st1+st2) counts only club=1 -> attr 0, +3 for P50
const vPhys = E.cardVariants(cSkills, fusion, ['Base', Parallel.P50]);
const p50 = vPhys.variants.find(x => x.parallel === Parallel.P50);
ok('physical variant included with known bonus', !!p50);
eq('physical P50 value = 0 (play styles excluded) + 3', p50.value, 3);
eq('physical P50 matchCount excludes skill types', p50.matchCount, 1);
// skill-only card: physical variants are ineligible (no skill types) -> skipped
const cSkillOnly = card({ 'Skill Type #1': 'Control' }); // matches only fusion skillType1 -> base count 1
const vSkillOnly = E.cardVariants(cSkillOnly, fusion, ['Base', Parallel.P50, Parallel.P77]);
ok('skill-only card is eligible (base)', vSkillOnly !== null);
ok('skill-only card has NO physical variants', !vSkillOnly.variants.some(x => E.isPhysicalParallel(x.parallel)));
ok('skill-only card keeps digital variants', vSkillOnly.variants.some(x => x.parallel === Parallel.P77));
// P99 (#/99) is no longer a physical parallel (equivalent to Base)
ok('P99 not a physical parallel', E.isPhysicalParallel(Parallel.P99) === false);
// new parallels present
eq('P35 bonus = 4', E.PHYSICAL_PARALLEL_BONUS[Parallel.P35], 4);
eq('P7 bonus = 6', E.PHYSICAL_PARALLEL_BONUS[Parallel.P7], 6);
eq('P1 bonus = 7', E.PHYSICAL_PARALLEL_BONUS[Parallel.P1], 7);

// --- P4: tier well-ordered + monotonic ---
eq('P4 <20 => 1x', E.tierFor(19).label, '1x');
eq('P4 20 => 2x', E.tierFor(20).label, '2x');
eq('P4 40 => 4x', E.tierFor(40).label, '4x');
eq('P4 100 => 10x', E.tierFor(100).label, '10x');
let mono = true, prevMin = -1;
for (let t = 0; t <= 120; t++) { const cur = E.tierFor(t).min; if (cur < prevMin) mono = false; prevMin = Math.max(prevMin, cur); }
ok('P4 monotonic non-decreasing tier floor', mono);

// --- P5: suggester combos have 10 values summing >= target ---
const domain = [0, 2, 5, 8, 12];
const combos20 = E.enumerateCombinations(domain, 10, 20, 500);
ok('P5 found combos for 20', combos20.length > 0);
ok('P5 all length 10', combos20.every(c => c.length === 10));
ok('P5 all sum >= 20', combos20.every(c => c.reduce((a, b) => a + b, 0) >= 20));
// includes 5+5+5+5+0*6
ok('P5 includes 5x4+0x6', combos20.some(c => JSON.stringify(c.slice().sort((a,b)=>b-a)) === JSON.stringify([5,5,5,5,0,0,0,0,0,0])));

// --- P7: parallels-off domain restricted ---
ok('P7 domain subset of {0,2,5,8,12}', combos20.every(c => c.every(v => [0,2,5,8,12].includes(v))));

// --- P6: feasibility ---
const combo = [5,5,5,5,0,0,0,0,0,0];
eq('P6 infeasible when only 3 fives', E.checkFeasibility(combo, { '5': 3, '0': 100 }).feasible, false);
eq('P6 feasible when enough', E.checkFeasibility(combo, { '5': 4, '0': 100 }).feasible, true);

// --- parseRequirement ---
// explicit value
const reqEq = E.parseRequirement('club=AC Milan', fusion);
ok('req eq matches', reqEq(c3) === true);
ok('req eq rejects', reqEq(card({ 'Club': 'Other' })) === false);
// explicit multi-value with '/' (OR)
const reqSlash = E.parseRequirement('skilltype=Accuracy/Control', fusion);
ok('req skilltype / matches st1', reqSlash(card({ 'Skill Type #1': 'Control' })) === true);
ok('req skilltype / matches st2', reqSlash(card({ 'Skill Type #2': 'Accuracy' })) === true);
ok('req skilltype / rejects', reqSlash(card({ 'Skill Type #1': 'Speed' })) === false);
// omitted value -> resolves against the fusion's own attribute
const reqPlayerOmitted = E.parseRequirement('player', fusion); // fusion player = 'Kaka Silva'
ok('req omitted player matches fusion player', reqPlayerOmitted(card({ 'First Name': 'Kaka', 'Second Name': 'Silva' })) === true);
ok('req omitted player rejects other', reqPlayerOmitted(card({ 'First Name': 'Other', 'Second Name': 'Guy' })) === false);
const reqSkillOmitted = E.parseRequirement('skilltype', fusion); // fusion st1=Control, st2=Accuracy
ok('req omitted skilltype matches fusion st1', reqSkillOmitted(card({ 'Skill Type #1': 'Control' })) === true);
ok('req omitted skilltype matches fusion st2', reqSkillOmitted(card({ 'Skill Type #2': 'Accuracy' })) === true);
ok('req omitted skilltype rejects', reqSkillOmitted(card({ 'Skill Type #1': 'Speed' })) === false);
// blank / garbage
ok('req blank permissive', E.parseRequirement('', fusion)(c3) === true);
ok('req unknown attr permissive (no throw)', E.parseRequirement('???', fusion)(c3) === true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
