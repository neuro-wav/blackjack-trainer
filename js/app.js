// ===== Blackjack Counting Trainer — main controller =====

window.App = window.App || {};

const SETTINGS_KEY = 'blackjackTrainerSettings';
const DEFAULT_SETTINGS = {
  decks: 6,
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  doubleRange: 'any',
  surrenderAllowed: true,
  penetration: 0.75,
  useDeviations: false,
  askInsurance: false,
  showCount: true,
  countQuizEvery: 5,
  drillMode: false,
  voiceOut: true,
  voiceIn: true,
  voiceURI: '',
  rate: 1,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const els = {};
function $(id) { return document.getElementById(id); }

const state = {
  settings: loadSettings(),
  mistakes: App.Mistakes.load(),
  drillMode: false,
  shoe: null,
  running: false,
  paused: false,
  muted: false,
  handsPlayed: 0,
  correctCount: 0,
  handsSinceQuiz: 0,
  choiceToken: 0,
  pendingKind: null,
  resolveChoice: null,
  currentPromptText: '',
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
}

function rulesFromSettings(s) {
  return {
    decks: s.decks,
    dealerHitsSoft17: s.dealerHitsSoft17,
    doubleAfterSplit: s.doubleAfterSplit,
    doubleRange: s.doubleRange,
    surrenderAllowed: s.surrenderAllowed,
    useDeviations: s.useDeviations,
    askInsurance: s.askInsurance,
  };
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  cacheEls();
  App.Voice.init();
  populateVoicesWhenReady();
  applySettingsToForm();
  wireEvents();
  noteVoiceSupport();
  renderTroubleSpots();
});

function cacheEls() {
  [
    'view-settings', 'view-practice', 'settings-form', 'start-btn', 'settings-btn',
    'opt-decks', 'opt-soft17', 'opt-das', 'opt-double-range', 'opt-surrender', 'opt-penetration',
    'opt-deviations', 'opt-insurance', 'opt-show-count', 'opt-count-quiz', 'opt-drill-mode',
    'opt-voice-out', 'opt-voice-in', 'opt-voice-select', 'opt-rate', 'voice-support-note', 'handsfree-btn',
    'trouble-spots', 'trouble-spots-list', 'reset-mistakes-btn',
    'stat-hands', 'stat-accuracy', 'stat-running', 'stat-true', 'count-stat-running', 'count-stat-true',
    'dealer-cards', 'player-cards', 'player-total', 'status-pill', 'prompt-text', 'mic-indicator',
    'feedback-banner', 'action-buttons', 'yesno-buttons', 'count-input-row', 'count-answer', 'count-submit',
    'listen-btn', 'pause-btn', 'repeat-btn', 'mute-btn', 'drill-indicator',
    'chart-btn', 'chart-panel', 'chart-close-btn', 'chart-rules-summary', 'chart-hard', 'chart-soft', 'chart-pairs',
    'heatmap-btn', 'heatmap-panel', 'heatmap-close-btn', 'heatmap-hard', 'heatmap-soft', 'heatmap-pairs',
  ].forEach(id => { els[id] = $(id); });
}

function noteVoiceSupport() {
  const parts = [];
  parts.push(App.Voice.supportsSynthesis ? 'Spoken feedback is supported in this browser.' : 'This browser cannot speak aloud — feedback will be shown as text.');
  parts.push(App.Voice.supportsRecognition ? 'Voice input is supported — you can answer hands-free.' : 'This browser does not support voice input — use the on-screen buttons to answer (Chrome/Edge recommended for hands-free use).');
  els['voice-support-note'].textContent = parts.join(' ');
  if (!App.Voice.supportsRecognition) {
    els['opt-voice-in'].checked = false;
    els['opt-voice-in'].disabled = true;
  }
}

function populateVoicesWhenReady() {
  const populate = () => {
    const select = els['opt-voice-select'];
    const voices = App.Voice.voices().filter(v => v.lang && v.lang.startsWith('en'));
    select.innerHTML = '<option value="">System default</option>' +
      voices.map(v => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`).join('');
    select.value = state.settings.voiceURI || '';
  };
  populate();
  setTimeout(populate, 400);
  setTimeout(populate, 1200);
}

function applySettingsToForm() {
  const s = state.settings;
  els['opt-decks'].value = String(s.decks);
  els['opt-soft17'].value = s.dealerHitsSoft17 ? 'hit' : 'stand';
  els['opt-das'].value = s.doubleAfterSplit ? 'yes' : 'no';
  els['opt-double-range'].value = s.doubleRange;
  els['opt-surrender'].value = s.surrenderAllowed ? 'yes' : 'no';
  els['opt-penetration'].value = String(s.penetration);
  els['opt-deviations'].checked = s.useDeviations;
  els['opt-insurance'].checked = s.askInsurance;
  els['opt-show-count'].checked = s.showCount;
  els['opt-count-quiz'].value = String(s.countQuizEvery);
  els['opt-drill-mode'].checked = s.drillMode;
  els['opt-voice-out'].checked = s.voiceOut;
  els['opt-voice-in'].checked = s.voiceIn && App.Voice.supportsRecognition;
  els['opt-rate'].value = String(s.rate);
  syncHandsFreeButton();
}

// Hands-free is "on" when both spoken readout and mic input are enabled.
// The toggle flips both together; voice input only activates if the browser supports it.
function isHandsFree() {
  return state.settings.voiceOut && state.settings.voiceIn && App.Voice.supportsRecognition;
}

function syncHandsFreeButton() {
  const btn = els['handsfree-btn'];
  if (!btn) return;
  const on = isHandsFree();
  btn.textContent = on ? '🤝 Hands-Free: On' : '🤝 Hands-Free: Off';
  btn.setAttribute('aria-pressed', String(on));
  btn.classList.toggle('active', on);
  btn.disabled = !App.Voice.supportsRecognition && !App.Voice.supportsSynthesis;
  btn.title = App.Voice.supportsRecognition
    ? 'Toggle spoken readout and voice answers on or off together'
    : 'Voice input is not supported in this browser — only spoken readout can be toggled';
}

function setHandsFree(on) {
  state.settings.voiceOut = on;
  state.settings.voiceIn = on && App.Voice.supportsRecognition;
  saveSettings();
  syncHandsFreeButton();
  els['opt-voice-out'].checked = state.settings.voiceOut;
  els['opt-voice-in'].checked = state.settings.voiceIn;
  if (!on) {
    App.Voice.stopSpeaking();
    App.Voice.stopListening();
  }
}

// ===== Quick-reference basic strategy chart for the current table rules =====
function toggleChart() {
  setChartVisible(els['chart-panel'].classList.contains('hidden'));
}

function setChartVisible(visible) {
  if (visible) renderChart();
  els['chart-panel'].classList.toggle('hidden', !visible);
  els['chart-btn'].setAttribute('aria-pressed', String(visible));
  els['chart-btn'].classList.toggle('active', visible);
}

function renderChart() {
  const rules = rulesFromSettings(state.settings);
  const chart = App.Strategy.buildChart(rules);

  els['chart-rules-summary'].textContent =
    `${rules.decks} deck${rules.decks > 1 ? 's' : ''}, dealer ${rules.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17, ` +
    `${rules.doubleAfterSplit ? 'DAS' : 'no DAS'}, double on ${rules.doubleRange === 'any' ? 'any two cards' : rules.doubleRange}, ` +
    `surrender ${rules.surrenderAllowed ? 'allowed' : 'not allowed'}.`;

  els['chart-hard'].innerHTML = renderChartTable('Hard Totals', chart.cols, chart.hardRows);
  els['chart-soft'].innerHTML = renderChartTable('Soft Totals', chart.cols, chart.softRows);
  els['chart-pairs'].innerHTML = renderChartTable('Pairs', chart.cols, chart.pairRows);
}

function renderChartTable(title, cols, rows) {
  const head = `<tr><th>${title}</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
  const body = rows.map(row => {
    const cells = row.cells.map(code => `<td class="chart-cell chart-cell-${code.toLowerCase()}">${code}</td>`).join('');
    return `<tr><th>${row.label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="chart-table">${head}${body}</table>`;
}

// ===== Drill-mode accuracy heat map =====
function toggleHeatmap() {
  setHeatmapVisible(els['heatmap-panel'].classList.contains('hidden'));
}

function setHeatmapVisible(visible) {
  if (visible) renderHeatmap();
  els['heatmap-panel'].classList.toggle('hidden', !visible);
  els['heatmap-btn'].setAttribute('aria-pressed', String(visible));
  els['heatmap-btn'].classList.toggle('active', visible);
}

function renderHeatmap() {
  const grid = App.Mistakes.heatmapRows(state.mistakes);
  els['heatmap-hard'].innerHTML = renderHeatmapTable('Hard Totals', grid.cols, grid.hardRows);
  els['heatmap-soft'].innerHTML = renderHeatmapTable('Soft Totals', grid.cols, grid.softRows);
  els['heatmap-pairs'].innerHTML = renderHeatmapTable('Pairs', grid.cols, grid.pairRows);
}

// Red (0% correct) -> green (100% correct) via HSL hue interpolation.
function accuracyColor(accuracy) {
  const hue = Math.round(accuracy * 120);
  return `hsl(${hue}, 65%, 38%)`;
}

function renderHeatmapTable(title, cols, rows) {
  const head = `<tr><th>${title}</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
  const body = rows.map(row => {
    const cells = row.cells.map(cell => {
      if (cell.accuracy === null) {
        return `<td class="heatmap-cell heatmap-cell-nodata" title="Not seen yet">&ndash;</td>`;
      }
      const pct = Math.round(cell.accuracy * 100);
      const style = `background:${accuracyColor(cell.accuracy)}`;
      const title = `${pct}% correct (${cell.seen - cell.missed}/${cell.seen})`;
      return `<td class="heatmap-cell" style="${style}" title="${title}">${pct}</td>`;
    }).join('');
    return `<tr><th>${row.label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="chart-table">${head}${body}</table>`;
}

function readSettingsFromForm() {
  return {
    decks: parseInt(els['opt-decks'].value, 10),
    dealerHitsSoft17: els['opt-soft17'].value === 'hit',
    doubleAfterSplit: els['opt-das'].value === 'yes',
    doubleRange: els['opt-double-range'].value,
    surrenderAllowed: els['opt-surrender'].value === 'yes',
    penetration: parseFloat(els['opt-penetration'].value),
    useDeviations: els['opt-deviations'].checked,
    askInsurance: els['opt-insurance'].checked,
    showCount: els['opt-show-count'].checked,
    countQuizEvery: parseInt(els['opt-count-quiz'].value, 10),
    drillMode: els['opt-drill-mode'].checked,
    voiceOut: els['opt-voice-out'].checked,
    voiceIn: els['opt-voice-in'].checked && App.Voice.supportsRecognition,
    voiceURI: els['opt-voice-select'].value,
    rate: parseFloat(els['opt-rate'].value),
  };
}

function wireEvents() {
  els['settings-form'].addEventListener('submit', (e) => {
    e.preventDefault();
    state.settings = readSettingsFromForm();
    saveSettings();
    if (!els['chart-panel'].classList.contains('hidden')) renderChart();
    startPractice();
  });

  els['settings-btn'].addEventListener('click', () => {
    stopPractice();
    setChartVisible(false);
    setHeatmapVisible(false);
    showView('settings');
  });

  els['handsfree-btn'].addEventListener('click', () => {
    setHandsFree(!isHandsFree());
  });

  els['chart-btn'].addEventListener('click', () => {
    toggleChart();
  });
  els['chart-close-btn'].addEventListener('click', () => {
    setChartVisible(false);
  });

  els['heatmap-btn'].addEventListener('click', () => {
    toggleHeatmap();
  });
  els['heatmap-close-btn'].addEventListener('click', () => {
    setHeatmapVisible(false);
  });

  els['mute-btn'].addEventListener('click', () => {
    state.muted = !state.muted;
    els['mute-btn'].textContent = state.muted ? '🔇' : '🔊';
    if (state.muted) App.Voice.stopSpeaking();
  });

  els['pause-btn'].addEventListener('click', togglePause);

  els['repeat-btn'].addEventListener('click', () => {
    speak(state.currentPromptText);
  });

  els['listen-btn'].addEventListener('click', () => {
    // Aborting the active recognition causes the listening loop to retry immediately.
    if (state.pendingKind && state.settings.voiceIn) App.Voice.stopListening();
  });

  els['action-buttons'].addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || state.pendingKind !== 'action') return;
    submitChoice(btn.dataset.action);
  });

  els['yesno-buttons'].addEventListener('click', (e) => {
    const btn = e.target.closest('[data-yesno]');
    if (!btn || state.pendingKind !== 'yesno') return;
    submitChoice(btn.dataset.yesno);
  });

  els['count-submit'].addEventListener('click', () => {
    if (state.pendingKind !== 'count') return;
    const val = parseInt(els['count-answer'].value, 10);
    if (!Number.isNaN(val)) submitChoice(val);
  });
  els['count-answer'].addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els['count-submit'].click();
  });

  els['reset-mistakes-btn'].addEventListener('click', () => {
    if (!confirm('Reset your tracked mistakes? This clears all "trouble spot" history.')) return;
    state.mistakes = App.Mistakes.reset();
    renderTroubleSpots();
  });
}

// ===== Trouble spots panel (settings view) =====
function renderTroubleSpots() {
  const top = App.Mistakes.topMistakes(state.mistakes, 8);
  els['trouble-spots'].classList.toggle('hidden', top.length === 0);
  els['trouble-spots-list'].innerHTML = top.map(entry => {
    const pct = Math.round(entry.rate * 100);
    return `<li><span class="trouble-spot-name">${App.Mistakes.describeScenarioForDisplay(entry.key)}</span>` +
      `<span class="trouble-spot-stat">missed ${entry.missed}/${entry.seen} (${pct}%)</span></li>`;
  }).join('');
}

function showView(name) {
  els['view-settings'].classList.toggle('hidden', name !== 'settings');
  els['view-practice'].classList.toggle('hidden', name !== 'practice');
}

function togglePause() {
  state.paused = !state.paused;
  els['pause-btn'].textContent = state.paused ? 'Resume' : 'Pause';
  setStatus(state.paused ? 'Paused' : 'Practicing');
  if (state.paused) {
    App.Voice.stopSpeaking();
  }
}

// ===== Speech helper that respects mute setting =====
function speak(text, opts = {}) {
  if (!text) return Promise.resolve();
  if (state.muted || !state.settings.voiceOut) return Promise.resolve();
  return App.Voice.speak(text, { rate: state.settings.rate, voiceURI: state.settings.voiceURI, ...opts });
}

// ===== Practice lifecycle =====
function startPractice() {
  state.drillMode = state.settings.drillMode;
  state.shoe = state.drillMode ? null : new App.Cards.Shoe(state.settings.decks, state.settings.penetration);
  state.handsPlayed = 0;
  state.correctCount = 0;
  state.handsSinceQuiz = 0;
  state.paused = false;
  state.running = true;
  els['pause-btn'].textContent = 'Pause';
  els['mute-btn'].textContent = state.muted ? '🔇' : '🔊';
  const showCount = state.settings.showCount && !state.drillMode;
  els['count-stat-running'].classList.toggle('hidden', !showCount);
  els['count-stat-true'].classList.toggle('hidden', !showCount);
  els['drill-indicator'].classList.toggle('hidden', !state.drillMode);
  els['heatmap-btn'].classList.toggle('hidden', !state.drillMode);
  if (!state.drillMode) setHeatmapVisible(false);
  updateStats();
  showView('practice');
  clearFeedback();
  setStatus('Get ready…');
  els['prompt-text'].textContent = state.drillMode ? 'Drilling your trouble spots…' : 'Shuffling the shoe…';
  runLoop();
}

function stopPractice() {
  state.running = false;
  state.choiceToken++;
  state.pendingKind = null;
  App.Voice.stopListening();
  App.Voice.stopSpeaking();
  showMic(false);
}

async function runLoop() {
  while (state.running) {
    if (state.paused) { await sleep(250); continue; }
    await playRound();
    if (!state.running) return;
    await sleep(500);
  }
}

// ===== One round = one initial-draw decision (no full hand play-out) =====
async function playRound() {
  if (state.drillMode) return playDrillRound();

  if (state.shoe.needsReshuffle()) {
    setStatus('Reshuffling');
    els['prompt-text'].textContent = 'The shoe is being reshuffled. Running count resets to zero.';
    await speak('Reshuffling the shoe. The count resets to zero.');
    state.shoe.reshuffle();
    await sleep(600);
  }

  clearFeedback();
  const rules = rulesFromSettings(state.settings);

  const p1 = state.shoe.draw();
  const p2 = state.shoe.draw();
  const dealerUp = state.shoe.draw();
  const playerCards = [p1, p2];

  renderCards(els['dealer-cards'], [dealerUp]);
  renderCards(els['player-cards'], playerCards);
  updateCountDisplay();

  const hand = App.Strategy.classifyHand(playerCards);
  els['player-total'].textContent = describeTotal(hand);

  // Player blackjack: no decision to make.
  if (hand.kind === 'soft' && hand.total === 21) {
    setStatus('Blackjack!');
    const text = `Blackjack! An automatic win. No decision needed.`;
    els['prompt-text'].textContent = text;
    state.currentPromptText = text;
    await speak(text);
    await sleep(400);
    return;
  }

  const trueCount = state.shoe.trueCount();

  // Optional insurance question when dealer shows an Ace.
  if (App.Strategy.shouldAskInsurance(dealerUp, rules)) {
    await handleInsurance(rules, trueCount);
    if (!state.running) return;
  }

  await handleActionDecision(playerCards, dealerUp, hand, rules, trueCount);
  if (!state.running) return;

  if (state.settings.countQuizEvery > 0 && state.handsSinceQuiz >= state.settings.countQuizEvery) {
    state.handsSinceQuiz = 0;
    await runCountQuiz();
  }
}

// ===== Drill mode: synthetic hands weighted toward tracked mistakes =====
const SUIT_OPTIONS = ['♠', '♥', '♦', '♣'];
function randomSuit() { return SUIT_OPTIONS[Math.floor(Math.random() * SUIT_OPTIONS.length)]; }

async function playDrillRound() {
  clearFeedback();
  const rules = rulesFromSettings(state.settings);

  const scenarioKey = App.Mistakes.pickWeighted(state.mistakes);
  const { playerRanks, dealerRank } = App.Mistakes.synthesizeScenario(scenarioKey);
  const playerCards = playerRanks.map(r => App.Cards.makeCard(r, randomSuit()));
  const dealerUp = App.Cards.makeCard(dealerRank, randomSuit());

  renderCards(els['dealer-cards'], [dealerUp]);
  renderCards(els['player-cards'], playerCards);

  const hand = App.Strategy.classifyHand(playerCards);
  els['player-total'].textContent = describeTotal(hand);

  await handleActionDecision(playerCards, dealerUp, hand, rules, 0);
}

function describeTotal(hand) {
  if (hand.kind === 'pair') return `Pair of ${rankPlural(hand.pairRank)}`;
  if (hand.kind === 'soft') return `Soft ${hand.total}`;
  return `Hard ${hand.total}`;
}

function rankPlural(rank) {
  const names = { 'A': 'Aces', 'K': 'Kings', 'Q': 'Queens', 'J': 'Jacks' };
  return names[rank] || `${rank}s`;
}

// ----- Insurance sub-decision -----
async function handleInsurance(rules, trueCount) {
  setStatus('Insurance?');
  const text = 'The dealer is showing an Ace. Would you like to take insurance?';
  els['prompt-text'].textContent = text;
  state.currentPromptText = text;
  await speak(text);

  showControls('yesno');
  const answer = await waitForChoice('yesno');
  if (!state.running) return;
  hideControls();

  const correct = App.Strategy.correctInsuranceCall(rules, trueCount);
  const playerSaid = answer === 'yes' ? 'insurance' : 'no-insurance';
  const isCorrect = playerSaid === correct;

  let explanation;
  if (correct === 'insurance') {
    explanation = `True count is ${formatCount(trueCount)}. With the count this high, taking insurance is the long-run profitable play.`;
  } else {
    explanation = state.settings.useDeviations
      ? `True count is ${formatCount(trueCount)}, below +3, so basic strategy says decline insurance — it's a losing bet for the player on average.`
      : `Insurance is a side bet that loses money for the player on average — basic strategy always says decline it.`;
  }
  showFeedback(isCorrect, `${isCorrect ? 'Correct.' : 'Not quite.'} The right call was to ${correct === 'insurance' ? 'take' : 'decline'} insurance. ${explanation}`);
  await speak(`${isCorrect ? 'Correct.' : 'Not quite.'} You should ${correct === 'insurance' ? 'take' : 'decline'} insurance here. ${explanation}`);
  await sleep(400);
}

// ----- Main Hit/Stand/Double/Split/Surrender decision -----
async function handleActionDecision(playerCards, dealerUp, hand, rules, trueCount) {
  setStatus('Your move');
  const promptText = buildPrompt(hand, playerCards, dealerUp);
  els['prompt-text'].textContent = promptText;
  state.currentPromptText = promptText;
  await speak(promptText);

  showControls('action');
  const answer = await waitForChoice('action');
  if (!state.running) return;
  hideControls();

  const result = App.Strategy.decide(playerCards, dealerUp, rules, trueCount);
  const isCorrect = answer === result.action;
  state.handsPlayed++;
  state.handsSinceQuiz++;
  if (isCorrect) state.correctCount++;
  updateStats();

  const mistakeKey = App.Mistakes.scenarioKey(hand, dealerUp.label);
  state.mistakes = App.Mistakes.recordAttempt(state.mistakes, mistakeKey, isCorrect);
  renderTroubleSpots();
  if (!els['heatmap-panel'].classList.contains('hidden')) renderHeatmap();

  highlightButtons(answer, result.action);

  const feedbackText = buildFeedbackText(isCorrect, answer, result, trueCount);
  showFeedback(isCorrect, feedbackText.banner);
  await speak(feedbackText.spoken);
  await sleep(250);
  unhighlightButtons();
}

function buildPrompt(hand, playerCards, dealerUp) {
  const handDesc = hand.kind === 'pair'
    ? `a pair of ${rankPlural(hand.pairRank)}`
    : `${hand.kind === 'soft' ? 'soft' : 'hard'} ${hand.total}`;
  return `You have ${handDesc}. Dealer shows ${dealerUp.spoken}. Hit, stand, double, split, or surrender?`;
}

function buildFeedbackText(isCorrect, playerAction, result, trueCount) {
  const correctName = result.actionName;
  const playerName = App.Strategy.ACTION_NAMES[playerAction] || playerAction;
  let banner, spoken;

  if (isCorrect) {
    banner = `✅ Correct — ${correctName} is right.`;
    spoken = `Correct! ${correctName} is the right play.`;
  } else {
    banner = `❌ Not quite — you said ${playerName}, but the right play is ${correctName}.`;
    spoken = `Not quite. The right play here is to ${correctName.toLowerCase()}, not ${playerName.toLowerCase()}.`;
  }

  if (result.deviation) {
    const dev = result.deviation;
    const note = dev.triggered
      ? `This is a count play: at a true count of ${formatCount(trueCount)} (≥ ${formatCount(dev.threshold)}), you deviate from basic strategy on ${dev.label} and ${ACTION_VERB[result.action] || result.action}.`
      : `Basic strategy applies here on ${dev.label} because the true count of ${formatCount(trueCount)} hasn't reached the deviation index of ${formatCount(dev.threshold)}.`;
    banner += ` ${note}`;
    spoken += ` ${note}`;
  } else if (result.action !== result.basicAction) {
    // shouldn't normally happen, but guard
  }

  return { banner, spoken };
}

const ACTION_VERB = {
  hit: 'hit',
  stand: 'stand',
  double: 'double down',
  split: 'split',
  surrender: 'surrender',
};

// ----- Hi-Lo running-count quiz -----
async function runCountQuiz() {
  setStatus('Count check');
  const text = 'Quick check — what is the current running count?';
  els['prompt-text'].textContent = text;
  state.currentPromptText = text;
  await speak(text);

  showControls('count');
  const answer = await waitForChoice('count');
  if (!state.running) return;
  hideControls();

  const actual = state.shoe.runningCount;
  const isCorrect = answer === actual;
  const trueCount = state.shoe.trueCount();
  const banner = isCorrect
    ? `✅ Correct — the running count is ${actual}. (True count ≈ ${formatCount(trueCount)} with about ${state.shoe.decksRemaining()} deck${state.shoe.decksRemaining() === 1 ? '' : 's'} left.)`
    : `You said ${answer}, but the running count is actually ${actual}. (True count ≈ ${formatCount(trueCount)}.)`;
  const spoken = isCorrect
    ? `Correct, the running count is ${actual}.`
    : `Not quite — the running count is actually ${actual}.`;

  showFeedback(isCorrect, banner);
  await speak(spoken);
  await sleep(250);
}

function formatCount(n) {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
}

// ===== UI rendering =====
function renderCards(container, cards) {
  container.innerHTML = '';
  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'playing-card' + (['♥', '♦'].includes(card.suit) ? ' red' : '');
    div.textContent = card.display;
    container.appendChild(div);
  });
}

function setStatus(text) { els['status-pill'].textContent = text; }

function clearFeedback() {
  els['feedback-banner'].className = 'feedback-banner hidden';
  els['feedback-banner'].textContent = '';
}

function showFeedback(isCorrect, text) {
  els['feedback-banner'].className = 'feedback-banner ' + (isCorrect ? 'correct' : 'incorrect');
  els['feedback-banner'].textContent = text;
}

function highlightButtons(playerAction, correctAction) {
  els['action-buttons'].querySelectorAll('[data-action]').forEach(btn => {
    btn.classList.remove('shown-correct', 'shown-incorrect');
    if (btn.dataset.action === correctAction) btn.classList.add('shown-correct');
    else if (btn.dataset.action === playerAction) btn.classList.add('shown-incorrect');
  });
}
function unhighlightButtons() {
  els['action-buttons'].querySelectorAll('[data-action]').forEach(btn => {
    btn.classList.remove('shown-correct', 'shown-incorrect');
  });
}

function updateStats() {
  els['stat-hands'].textContent = String(state.handsPlayed);
  els['stat-accuracy'].textContent = state.handsPlayed > 0
    ? `${Math.round((state.correctCount / state.handsPlayed) * 100)}%`
    : '—';
  updateCountDisplay();
}

function updateCountDisplay() {
  if (!state.shoe) return;
  els['stat-running'].textContent = String(state.shoe.runningCount);
  els['stat-true'].textContent = formatCount(state.shoe.trueCount());
}

// ===== Choice-waiting machinery (voice + buttons race) =====
function showControls(kind) {
  els['action-buttons'].classList.toggle('hidden', kind !== 'action');
  els['yesno-buttons'].classList.toggle('hidden', kind !== 'yesno');
  els['count-input-row'].classList.toggle('hidden', kind !== 'count');
  if (kind === 'count') { els['count-answer'].value = ''; els['count-answer'].focus(); }
}
function hideControls() {
  showControls(null);
  showMic(false);
}
function showMic(on) { els['mic-indicator'].classList.toggle('hidden', !on); }

function waitForChoice(kind) {
  state.choiceToken++;
  const myToken = state.choiceToken;
  state.pendingKind = kind;
  return new Promise((resolve) => {
    state.resolveChoice = (value) => {
      if (myToken !== state.choiceToken) return;
      state.choiceToken++;
      state.pendingKind = null;
      state.resolveChoice = null;
      App.Voice.stopListening();
      showMic(false);
      resolve(value);
    };
    if (state.settings.voiceIn && App.Voice.supportsRecognition) {
      runVoiceLoop(kind, myToken);
    }
  });
}

function submitChoice(value) {
  if (state.resolveChoice) state.resolveChoice(value);
}

async function runVoiceLoop(kind, token) {
  while (token === state.choiceToken && state.running) {
    showMic(true);
    const transcript = await App.Voice.listenOnce({ timeoutMs: 6500 });
    if (token !== state.choiceToken) { showMic(false); return; }
    showMic(false);
    if (!transcript) continue;

    const control = App.Voice.matchControl(transcript);
    if (control === 'repeat') {
      await speak(state.currentPromptText);
      continue;
    }

    let value = null;
    if (kind === 'action') value = App.Voice.matchAction(transcript);
    else if (kind === 'yesno') value = App.Voice.matchYesNo(transcript);
    else if (kind === 'count') value = App.Voice.parseNumber(transcript);

    if (value !== null && value !== undefined) {
      if (state.resolveChoice) state.resolveChoice(value);
      return;
    }
    // Unrecognized — brief nudge, then keep listening.
    await speak("Sorry, I didn't catch that — please say your answer again.");
  }
}

// ===== PWA: register service worker for offline / installable use =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
