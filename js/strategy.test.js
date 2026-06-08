// ===== Validation tests for the basic strategy + deviation engine =====
// Plain-Node test module (no dependencies). Run with: node js/strategy.test.js
//
// Loads strategy.js into a minimal `window`/`App` sandbox (it's written as a
// browser script that hangs itself off `window.App.Strategy`) and checks its
// decisions against known-correct basic strategy chart entries and Illustrious
// 18 deviation thresholds.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, 'strategy.js'), 'utf8');
vm.runInContext(src, sandbox);
const Strategy = sandbox.App.Strategy;

const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };
function card(rank) {
  return { rank, value: RANK_VALUES[rank], label: rank };
}

const S17_DAS = { decks: 6, dealerHitsSoft17: false, doubleAfterSplit: true, doubleRange: 'any', surrenderAllowed: true, useDeviations: false, askInsurance: true };
const H17_DAS = { ...S17_DAS, dealerHitsSoft17: true };
const NO_DEVIATIONS = S17_DAS;
const WITH_DEVIATIONS = { ...S17_DAS, useDeviations: true };

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected "${expected}", got "${actual}"`);
  }
}

function checkAction(label, playerRanks, dealerRank, rules, expectedAction, trueCount = 0) {
  const result = Strategy.decide(playerRanks.map(card), card(dealerRank), rules, trueCount);
  check(label, result.action, expectedAction);
}

// ----- Hard totals (S17, DAS, double on any two cards) -----
checkAction('Hard 8 vs 6 -> hit', ['5', '3'], '6', S17_DAS, 'hit');
checkAction('Hard 9 vs 3 -> double', ['5', '4'], '3', S17_DAS, 'double');
checkAction('Hard 9 vs 2 -> hit', ['5', '4'], '2', S17_DAS, 'hit');
checkAction('Hard 10 vs 9 -> double', ['6', '4'], '9', S17_DAS, 'double');
checkAction('Hard 10 vs 10 -> hit', ['6', '4'], '10', S17_DAS, 'hit');
checkAction('Hard 11 vs A (S17) -> hit', ['6', '5'], 'A', S17_DAS, 'hit');
checkAction('Hard 11 vs A (H17) -> double', ['6', '5'], 'A', H17_DAS, 'double');
checkAction('Hard 12 vs 4 -> stand', ['7', '5'], '4', S17_DAS, 'stand');
checkAction('Hard 12 vs 2 -> hit', ['7', '5'], '2', S17_DAS, 'hit');
checkAction('Hard 13 vs 6 -> stand', ['7', '6'], '6', S17_DAS, 'stand');
checkAction('Hard 13 vs 7 -> hit', ['7', '6'], '7', S17_DAS, 'hit');
checkAction('Hard 16 vs 9, surrender allowed -> surrender', ['9', '7'], '9', S17_DAS, 'surrender');
checkAction('Hard 16 vs 9, surrender NOT allowed -> hit', ['9', '7'], '9', { ...S17_DAS, surrenderAllowed: false }, 'hit');
checkAction('Hard 16 vs 10, surrender allowed -> surrender', ['10', '6'], '10', S17_DAS, 'surrender');
checkAction('Hard 16 vs 10, surrender NOT allowed -> hit', ['10', '6'], '10', { ...S17_DAS, surrenderAllowed: false }, 'hit');
checkAction('Hard 17 vs A -> stand (always stand >=17)', ['10', '7'], 'A', S17_DAS, 'stand');
checkAction('Hard 7 vs 6 -> hit (always hit <=7)', ['4', '3'], '6', S17_DAS, 'hit');

// ----- Soft totals -----
checkAction('Soft 13 (A,2) vs 5 -> double', ['A', '2'], '5', S17_DAS, 'double');
checkAction('Soft 13 (A,2) vs 6 (no double, total 9-11 only) -> hit', ['A', '2'], '6', { ...S17_DAS, doubleRange: '9-11' }, 'hit');
checkAction('Soft 17 (A,6) vs 3 -> double', ['A', '6'], '3', S17_DAS, 'double');
checkAction('Soft 18 (A,7) vs 9 -> hit', ['A', '7'], '9', S17_DAS, 'hit');
checkAction('Soft 18 (A,7) vs 2 -> double (Ds, double allowed)', ['A', '7'], '2', S17_DAS, 'double');
checkAction('Soft 18 (A,7) vs 2, double range 10-11 -> stand (Ds falls back to stand)', ['A', '7'], '2', { ...S17_DAS, doubleRange: '10-11' }, 'stand');
checkAction('Soft 19 (A,8) vs 6, S17 -> stand', ['A', '8'], '6', S17_DAS, 'stand');
checkAction('Soft 19 (A,8) vs 6, H17 -> double (Ds override)', ['A', '8'], '6', H17_DAS, 'double');
checkAction('Soft 20 (A,9) vs anything -> stand', ['A', '9'], '6', S17_DAS, 'stand');

// ----- Pairs -----
checkAction('A,A -> split', ['A', 'A'], '6', S17_DAS, 'split');
checkAction('8,8 vs A -> split (always split)', ['8', '8'], 'A', S17_DAS, 'split');
checkAction('5,5 vs 6 -> double (treated as hard 10)', ['5', '5'], '6', S17_DAS, 'double');
checkAction('5,5 vs 10 -> hit (treated as hard 10)', ['5', '5'], '10', S17_DAS, 'hit');
checkAction('10,10 vs 6 -> stand (never split tens in basic strategy)', ['10', '10'], '6', S17_DAS, 'stand');
checkAction('K,Q vs 6 -> stand (mixed tens treated as pair-of-tens -> hard 20)', ['K', 'Q'], '6', S17_DAS, 'stand');
checkAction('9,9 vs 7 -> stand', ['9', '9'], '7', S17_DAS, 'stand');
checkAction('9,9 vs 9 -> split (one of the few hands that splits vs a 9)', ['9', '9'], '9', S17_DAS, 'split');
checkAction('4,4 vs 5, DAS -> split (Ph)', ['4', '4'], '5', { ...S17_DAS, doubleAfterSplit: true }, 'split');
checkAction('4,4 vs 5, no DAS -> hit (Ph falls back to hit)', ['4', '4'], '5', { ...S17_DAS, doubleAfterSplit: false }, 'hit');
checkAction('2,2 vs 3, no DAS -> hit (Ph falls back to hit)', ['2', '2'], '3', { ...S17_DAS, doubleAfterSplit: false }, 'hit');

// ----- Double-down range restrictions -----
checkAction('Hard 9 vs 6, double range 10-11 -> hit (9 outside range)', ['5', '4'], '6', { ...S17_DAS, doubleRange: '10-11' }, 'hit');
checkAction('Hard 11 vs 6, double range 9-11 -> double', ['6', '5'], '6', { ...S17_DAS, doubleRange: '9-11' }, 'double');
checkAction('Hard 9 vs 6, double range 9-11 -> double', ['5', '4'], '6', { ...S17_DAS, doubleRange: '9-11' }, 'double');

// ----- Insurance -----
check('Insurance prompted vs A when askInsurance true', Strategy.shouldAskInsurance(card('A'), S17_DAS), true);
check('Insurance NOT prompted vs 10', Strategy.shouldAskInsurance(card('10'), S17_DAS), false);
check('Insurance NOT prompted when askInsurance false', Strategy.shouldAskInsurance(card('A'), { ...S17_DAS, askInsurance: false }), false);
check('Correct insurance call without deviations -> always decline', Strategy.correctInsuranceCall(NO_DEVIATIONS, 5), 'no-insurance');
check('Correct insurance call with deviations, count below index 3 -> decline', Strategy.correctInsuranceCall(WITH_DEVIATIONS, 2), 'no-insurance');
check('Correct insurance call with deviations, count at/above index 3 -> take', Strategy.correctInsuranceCall(WITH_DEVIATIONS, 3), 'insurance');

// ----- Illustrious 18 deviations (Hi-Lo true count) -----
// Hard 16 vs 10: index 0 -> stand at/above 0, hit below
checkAction('Hard 16 vs 10, count -1 (below index 0) -> hit', ['10', '6'], '10', WITH_DEVIATIONS, 'hit', -1);
checkAction('Hard 16 vs 10, count 0 (at index 0) -> stand', ['10', '6'], '10', WITH_DEVIATIONS, 'stand', 0);
checkAction('Hard 16 vs 10, count +2 -> stand', ['10', '6'], '10', WITH_DEVIATIONS, 'stand', 2);

// Hard 15 vs 10: index 4
checkAction('Hard 15 vs 10, count 3 (below index 4) -> hit', ['10', '5'], '10', WITH_DEVIATIONS, 'hit', 3);
checkAction('Hard 15 vs 10, count 4 (at index 4) -> stand', ['10', '5'], '10', WITH_DEVIATIONS, 'stand', 4);

// 10,10 vs 6: index 4 -> split at/above, otherwise stand (never "hit")
checkAction('10,10 vs 6, count 3 -> stand (below index, deviation default)', ['10', '10'], '6', WITH_DEVIATIONS, 'stand', 3);
checkAction('10,10 vs 6, count 4 -> split (deviation triggered)', ['10', '10'], '6', WITH_DEVIATIONS, 'split', 4);
checkAction('10,10 vs 6, count 4, no DAS -> stand (split downgraded, basic code is P not Ph so split stands)', ['10', '10'], '6', { ...WITH_DEVIATIONS, doubleAfterSplit: false }, 'split', 4);

// Hard 10 vs 10: index 4 -> double at/above, hit below
checkAction('Hard 10 vs 10, count 3 -> hit', ['6', '4'], '10', WITH_DEVIATIONS, 'hit', 3);
checkAction('Hard 10 vs 10, count 4 -> double', ['6', '4'], '10', WITH_DEVIATIONS, 'double', 4);
checkAction('Hard 10 vs 10, count 4, double range 10-11 -> double still allowed (total is 10)', ['6', '4'], '10', { ...WITH_DEVIATIONS, doubleRange: '10-11' }, 'double', 4);

// Hard 12 vs 3: index 2 -> stand at/above, hit below
checkAction('Hard 12 vs 3, count 1 -> hit', ['9', '3'], '3', WITH_DEVIATIONS, 'hit', 1);
checkAction('Hard 12 vs 3, count 2 -> stand', ['9', '3'], '3', WITH_DEVIATIONS, 'stand', 2);

// Hard 13 vs 2: index -1 -> stand at/above -1, hit below
checkAction('Hard 13 vs 2, count -2 -> hit', ['9', '4'], '2', WITH_DEVIATIONS, 'hit', -2);
checkAction('Hard 13 vs 2, count -1 -> stand', ['9', '4'], '2', WITH_DEVIATIONS, 'stand', -1);

// Hard 9 vs 2: index 1 -> double at/above, hit below
checkAction('Hard 9 vs 2, count 0 -> hit', ['5', '4'], '2', WITH_DEVIATIONS, 'hit', 0);
checkAction('Hard 9 vs 2, count 1 -> double', ['5', '4'], '2', WITH_DEVIATIONS, 'double', 1);

// Deviations should be ignored when useDeviations is false, even at extreme counts
checkAction('Hard 16 vs 10, useDeviations=false, count +5 -> still surrender (basic strategy)', ['10', '6'], '10', NO_DEVIATIONS, 'surrender', 5);

// ----- Reported metadata (basicAction vs deviation-adjusted action) -----
(function () {
  const result = Strategy.decide(['10', '6'].map(card), card('10'), WITH_DEVIATIONS, 2);
  check('Hard 16 vs 10 @ count 2: basicAction stays "surrender"', result.basicAction, 'surrender');
  check('Hard 16 vs 10 @ count 2: deviation-adjusted action is "stand"', result.action, 'stand');
  check('Hard 16 vs 10 @ count 2: deviation metadata reports triggered=true', result.deviation && result.deviation.triggered, true);
})();
(function () {
  const result = Strategy.decide(['9', '7'].map(card), card('9'), WITH_DEVIATIONS, -1);
  check('Hard 16 vs 9 @ count -1 (below index 5): deviation entry matches but is not "triggered"', result.deviation && result.deviation.triggered, false);
  check('Hard 16 vs 9 @ count -1: deviation\'s "below" action ("hit") is used regardless of basic surrender', result.action, 'hit');
  check('Hard 16 vs 9 @ count -1: basicAction still reports the underlying basic-strategy play ("surrender")', result.basicAction, 'surrender');
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail > 0 ? 1 : 0;
