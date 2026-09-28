/* SSC Percentage Speed Trainer — Calculation Speed Lab
 * Vanilla JS, offline-first. Questions are generated and mathematically checked at runtime.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'ssc-speed-lab-v1';
  const ACTIVE_KEY = 'ssc-speed-lab-active-v1';
  const HISTORY_KEY = 'ssc-speed-lab-question-history-v1';
  const MAX_HISTORY = 700;
  const TARGETS = Object.freeze({
    normalSecondsPerQuestion: 25,
    extremeQuestions: 100, extremeSeconds: 15 * 60,
    godQuestions: 100, godSeconds: 5 * 60,
    normalQuestions: 20, hardQuestions: 20,
    workoutSectionSeconds: [180, 180, 240, 240]
  });

  const SECTION_LIST = [
    { id: 'p2f', title: 'Percentage → Fraction', short: 'PERCENT → FRACTION', description: 'Turn familiar percentages into a fraction in simplest form.', icon: '⅟', duration: 180 },
    { id: 'f2p', title: 'Fraction → Percentage', short: 'FRACTION → PERCENT', description: 'Recall the percentage value of a fraction, including repeating values.', icon: '%' , duration: 180 },
    { id: 'of-number', title: 'Percentage of a Number', short: 'PERCENT OF A NUMBER', description: 'Use fraction shortcuts to find an elegant part of a whole.', icon: '×', duration: 240 },
    { id: 'reverse', title: 'Reverse Percentage', short: 'REVERSE PERCENTAGE', description: 'Work backward from a known percentage to the whole.', icon: '↶', duration: 240 },
    { id: 'mixed', title: 'Mixed Percentage Calculation', short: 'MIXED CALCULATION', description: 'Switch rapidly between conversions, comparisons, and mental maths.', icon: '⌁', duration: 240 }
  ];
  const SECTION_BY_ID = Object.fromEntries(SECTION_LIST.map(section => [section.id, section]));
  const CATEGORY_LABEL = {
    p2f: 'Percentage → Fraction', f2p: 'Fraction → Percentage', 'of-number': 'Percentage of a Number',
    reverse: 'Reverse Percentage', standard: 'Standard Fractions', decimal: 'Decimal ↔ Percentage',
    p2d: 'Percentage → Decimal', compare: 'Percentage Comparison', mental: 'Mental Percentage'
  };

  // Exact rational values; display labels intentionally distinguish repeating approximations.
  const STANDARD_FRACTIONS = [
    [1,100,'1%'],[1,50,'2%'],[3,100,'3%'],[1,30,'3.33%'],[1,25,'4%'],[1,20,'5%'],[1,16,'6.25%'],[2,25,'8%'],[1,12,'8.33%'],
    [1,10,'10%'],[1,8,'12.5%'],[1,7,'14.2857%'],[1,6,'16.67%'],[1,5,'20%'],[2,9,'22.22%'],[1,4,'25%'],
    [17,60,'28.33%'],[3,10,'30%'],[1,3,'33.33%'],[11,30,'36.67%'],[3,8,'37.5%'],[2,5,'40%'],[5,12,'41.67%'],
    [4,9,'44.44%'],[1,2,'50%'],[5,9,'55.56%'],[3,5,'60%'],[5,8,'62.5%'],[2,3,'66.67%'],[7,10,'70%'],
    [3,4,'75%'],[7,9,'77.78%'],[4,5,'80%'],[5,6,'83.33%'],[7,8,'87.5%'],[9,10,'90%'],[11,12,'91.67%'],[19,20,'95%']
  ].map(([n,d,label]) => {
    const [num, den] = reduceFraction(n, d);
    return { n: num, d: den, percent: num / den * 100, displayPercent: label, approximate: !isTerminating(num, den), value: num / den };
  });

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let appData = loadData();
  let recentKeys = loadQuestionHistory();
  let session = null;
  let timerInterval = null;
  let lastSessionPersistAt = 0;
  let draftSaveTimeout = null;
  let toastTimeout = null;
  let selectedDifficulty = 'normal';
  let lastResultMode = 'extreme';
  let lastResultSection = null;

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }
  function reduceFraction(n, d) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return [n / g, d / g]; }
  function isTerminating(n, d) { d = Math.abs(d / gcd(n, d)); for (const factor of [2, 5]) while (d % factor === 0) d /= factor; return d === 1; }
  function randInt(min, max) { const range = max - min + 1; if (window.crypto && crypto.getRandomValues) { const n = new Uint32Array(1); crypto.getRandomValues(n); return min + (n[0] % range); } return min + Math.floor(Math.random() * range); }
  function pick(items) { return items[randInt(0, items.length - 1)]; }
  function weightedPick(entries) { const total = entries.reduce((sum, item) => sum + item[1], 0); let roll = Math.random() * total; for (const [value, weight] of entries) { roll -= weight; if (roll <= 0) return value; } return entries[entries.length - 1][0]; }
  function shuffle(items) { for (let i = items.length - 1; i > 0; i--) { const j = randInt(0, i); [items[i], items[j]] = [items[j], items[i]]; } return items; }
  function roundTo(value, places = 2) { const factor = 10 ** places; return Math.round((value + Number.EPSILON) * factor) / factor; }
  function trimDecimal(value, places = 4) { return Number(value.toFixed(places)).toString(); }
  function fmtNumber(value) { return Number.isInteger(value) ? String(value) : trimDecimal(value, 4); }
  function fmtTime(seconds) { seconds = Math.max(0, Math.floor(seconds)); const m = Math.floor(seconds / 60); const s = seconds % 60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  function fmtDuration(seconds, decimals = 2) { if (!Number.isFinite(seconds)) return '—'; return `${seconds.toFixed(decimals)} sec`; }
  function todayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function formatLongDate(date) { return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(date); }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && typeof parsed === 'object') return { tests: [], personalBests: {}, recent: [], ...parsed };
    } catch (_) { /* A corrupt or unavailable local record should never block a new session. */ }
    return { tests: [], personalBests: {}, recent: [] };
  }
  function persistData() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); } catch (_) { showToast('Browser storage is unavailable. Your current session still works.'); } }
  function loadQuestionHistory() { try { const result = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(result) ? result : []; } catch (_) { return []; } }
  function persistQuestionHistory() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(recentKeys.slice(-MAX_HISTORY))); } catch (_) { /* History is a repetition aid, not required for a test. */ } }
  function saveActiveSession() { if (!session) return; try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(session)); } catch (_) { /* Continue in memory if storage is full. */ } }
  function clearActiveSession() { try { localStorage.removeItem(ACTIVE_KEY); } catch (_) {} }
  function readActiveSession() { try { const value = JSON.parse(localStorage.getItem(ACTIVE_KEY)); return value && Array.isArray(value.questions) ? value : null; } catch (_) { return null; } }

  function standardPool() { return STANDARD_FRACTIONS; }
  function randomRational(difficulty = 'normal') {
    const ds = difficulty === 'hard' ? [7,9,11,12,14,15,18,21,24,28,30,36,40,45,48,60,75,80] : [2,3,4,5,6,8,9,10,12,15,16,20,24,25,30,40,50,60,80,100];
    for (let tries = 0; tries < 16; tries++) {
      const d = pick(ds); const n = randInt(1, d - 1); const [rn, rd] = reduceFraction(n, d);
      if (rn === n && rd === d) return { n: rn, d: rd, percent: n / d * 100, value: n / d, displayPercent: formatPercent(n / d * 100), approximate: !isTerminating(n, d) };
    }
    return pick(standardPool());
  }
  function chooseRational(difficulty, standardWeight = 0.72, recognition = false) {
    if (Math.random() < standardWeight) {
      let candidates = standardPool();
      if (recognition) candidates = candidates.filter(x => x.d <= 30 || [1,2,3,4,5,6,7,8,9,10,11,12,16,20,25].includes(x.d));
      return pick(candidates);
    }
    return randomRational(difficulty);
  }
  function formatPercent(value) {
    const rounded = roundTo(value, 2);
    return `${trimDecimal(rounded, 2)}%`;
  }
  function fractionText(n, d) { const [rn, rd] = reduceFraction(n, d); return `${rn}/${rd}`; }
  function addQuestion(meta) {
    const q = { ...meta };
    q.signature = q.prompt.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!q.answerFormat) q.answerFormat = 'number';
    if (!Number.isFinite(q.answerValue) && typeof q.answerValue !== 'string') throw new Error('Question has no finite answer.');
    if (!validateGeneratedQuestion(q)) throw new Error(`Question validation failed: ${q.prompt}`);
    return q;
  }

  // Each generator returns a freshly randomized question and a separate recomputation recipe.
  function generatePercentageToFraction(difficulty = 'normal', opts = {}) {
    const standardWeight = opts.standardWeight ?? (difficulty === 'god' ? 0.88 : difficulty === 'hard' ? 0.56 : 0.75);
    const r = chooseRational(difficulty, standardWeight, difficulty === 'god');
    const show = r.displayPercent || formatPercent(r.percent);
    const approx = r.approximate || !isTerminating(r.n, r.d);
    const label = opts.standardLabel ? 'standard' : 'p2f';
    return addQuestion({ category: label, sectionId: opts.sectionId || 'p2f', prompt: `${show}${approx ? ' ≈' : ' ='} ?`, hint: 'Give the fraction in its simplest form.', answerFormat: 'fraction', answerValue: r.n / r.d, answerDisplay: fractionText(r.n, r.d), tolerance: 1e-8, validation: { type: 'ratio', n: r.n, d: r.d }, source: 'percentage-to-fraction' });
  }
  function generateFractionToPercentage(difficulty = 'normal', opts = {}) {
    const r = chooseRational(difficulty, opts.standardWeight ?? (difficulty === 'god' ? 0.86 : difficulty === 'hard' ? 0.58 : 0.72), difficulty === 'god');
    const repeating = !isTerminating(r.n * 100, r.d);
    const pct = r.n / r.d * 100;
    return addQuestion({ category: opts.standardLabel ? 'standard' : 'f2p', sectionId: opts.sectionId || 'f2p', prompt: `${fractionText(r.n, r.d)} = ?%`, hint: repeating ? 'A rounded percentage is fine (for example, 33.33).' : 'Enter the percentage value. A percent sign is optional.', answerFormat: 'percent', answerValue: pct, answerDisplay: `${formatPercent(pct)}${repeating ? ' ≈' : ''}`, tolerance: 0.041, validation: { type: 'ratio-percent', n: r.n, d: r.d }, source: 'fraction-to-percentage' });
  }
  function usableMentalFractions(difficulty, god = false) {
    let pool = standardPool().filter(r => r.d <= (god ? 30 : difficulty === 'hard' ? 60 : 50) && r.percent >= (god ? 5 : 1));
    if (difficulty === 'hard') pool = pool.concat([randomRational('hard'), randomRational('hard')]);
    return pool;
  }
  function generatePercentageOfNumber(difficulty = 'normal', opts = {}) {
    const r = pick(usableMentalFractions(difficulty, difficulty === 'god'));
    const k = difficulty === 'god' ? randInt(3, 30) : difficulty === 'hard' ? randInt(8, 120) : randInt(8, 75);
    const number = r.d * k;
    const result = r.n * k;
    const p = r.displayPercent || formatPercent(r.percent);
    const prompt = `${p} of ${number} = ?`;
    return addQuestion({ category: opts.category || 'of-number', sectionId: opts.sectionId || 'of-number', prompt, hint: 'Use the fraction shortcut. Enter the value.', answerFormat: 'number', answerValue: result, answerDisplay: fmtNumber(result), tolerance: 1e-8, validation: { type: 'percent-of', n: r.n, d: r.d, number }, source: 'percentage-of-number' });
  }
  function generateReversePercentage(difficulty = 'normal', opts = {}) {
    const r = pick(usableMentalFractions(difficulty, difficulty === 'god'));
    const k = difficulty === 'hard' ? randInt(8, 100) : randInt(8, 80);
    const whole = r.d * k, part = r.n * k;
    const p = r.displayPercent || formatPercent(r.percent);
    const prompt = `${p} of a number is ${part}. Find the number.`;
    return addQuestion({ category: 'reverse', sectionId: opts.sectionId || 'reverse', prompt, hint: 'Undo the percentage to find the whole.', answerFormat: 'number', answerValue: whole, answerDisplay: fmtNumber(whole), tolerance: 1e-8, validation: { type: 'reverse', n: r.n, d: r.d, part }, source: 'reverse-percentage' });
  }
  function decimalRationalPool() { return standardPool().filter(r => isTerminating(r.n, r.d) && [8,10,16,20,25,40,50,100].includes(r.d)); }
  function generateDecimalPercentage(difficulty = 'normal', opts = {}) {
    if (opts.category === 'p2d' || opts.percentToDecimal) return generateSpecificPercentToDecimal();
    const r = pick(decimalRationalPool());
    const decimal = r.n / r.d, pct = decimal * 100;
    const form = randInt(0, 3);
    if (form === 0) {
      return addQuestion({ category: 'decimal', sectionId: opts.sectionId || 'mixed', prompt: `${trimDecimal(decimal, 4)} = ?%`, hint: 'Convert the decimal to a percentage.', answerFormat: 'percent', answerValue: pct, answerDisplay: formatPercent(pct), tolerance: 0.005, validation: { type: 'decimal-to-percent', n: r.n, d: r.d }, source: 'decimal-to-percent' });
    }
    if (form === 1) {
      return addQuestion({ category: 'decimal', sectionId: opts.sectionId || 'mixed', prompt: `${formatPercent(pct)} = decimal?`, hint: 'Write the percentage as a decimal.', answerFormat: 'decimal', answerValue: decimal, answerDisplay: trimDecimal(decimal, 4), tolerance: 0.00005, validation: { type: 'percent-to-decimal', n: r.n, d: r.d }, source: 'percentage-to-decimal' });
    }
    if (form === 2) {
      return addQuestion({ category: 'decimal', sectionId: opts.sectionId || 'mixed', prompt: `${trimDecimal(decimal, 4)} = ? as a fraction`, hint: 'Give the fraction in its simplest form.', answerFormat: 'fraction', answerValue: decimal, answerDisplay: fractionText(r.n, r.d), tolerance: 1e-8, validation: { type: 'decimal-to-ratio', n: r.n, d: r.d }, source: 'decimal-to-fraction' });
    }
    return addQuestion({ category: 'decimal', sectionId: opts.sectionId || 'mixed', prompt: `${fractionText(r.n, r.d)} = decimal?`, hint: 'Write the fraction as a decimal.', answerFormat: 'decimal', answerValue: decimal, answerDisplay: trimDecimal(decimal, 4), tolerance: 0.00005, validation: { type: 'ratio-to-decimal', n: r.n, d: r.d }, source: 'fraction-to-decimal' });
  }
  function generateComparison(difficulty = 'normal') {
    const a = chooseRational(difficulty, 0.75), b = chooseRational(difficulty, 0.75);
    const right = a.value === b.value ? pick(standardPool().filter(x => x.value !== a.value)) : b;
    const answer = Math.abs(a.value - right.value) < 1e-12 ? 'EQUAL' : a.value > right.value ? 'A' : 'B';
    return addQuestion({ category: 'compare', sectionId: 'mixed', prompt: `Which is greater?  A) ${a.displayPercent || formatPercent(a.percent)}   B) ${right.displayPercent || formatPercent(right.percent)}`, hint: 'Type A, B, or EQUAL. Compare the fraction values.', answerFormat: 'text', answerValue: answer, answerDisplay: answer, validation: { type: 'compare', a: a.value, b: right.value }, source: 'comparison' });
  }
  function generateStandardRecognition(difficulty = 'normal') {
    return Math.random() < 0.5 ? generatePercentageToFraction(difficulty, { standardLabel: true, standardWeight: 1 }) : generateFractionToPercentage(difficulty, { standardLabel: true, standardWeight: 1 });
  }
  function generateMixedQuestion(difficulty = 'normal', mode = 'extreme') {
    const type = mode === 'god'
      ? weightedPick([['p2f',25],['f2p',24],['standard',15],['decimal',13],['p2d',9],['compare',11],['of-number',3]])
      : weightedPick([['p2f',15],['f2p',15],['of-number',17],['reverse',12],['standard',13],['decimal',10],['p2d',6],['compare',6],['mental',6]]);
    switch (type) {
      case 'p2f': return generatePercentageToFraction(difficulty);
      case 'f2p': return generateFractionToPercentage(difficulty);
      case 'of-number': return generatePercentageOfNumber(difficulty);
      case 'reverse': return generateReversePercentage(difficulty);
      case 'standard': return generateStandardRecognition(difficulty);
      case 'decimal': return generateDecimalPercentage(difficulty, { category: 'decimal' });
      case 'p2d': return generateSpecificPercentToDecimal();
      case 'compare': return generateComparison(difficulty);
      case 'mental': return generatePercentageOfNumber(difficulty, { category: 'mental' });
      default: return generatePercentageToFraction(difficulty);
    }
  }
  function generateSpecificPercentToDecimal() {
    const r = pick(decimalRationalPool()), pct = r.n / r.d * 100, dec = r.n / r.d;
    return addQuestion({ category: 'p2d', sectionId: 'mixed', prompt: `${formatPercent(pct)} = decimal?`, hint: 'Write the percentage as a decimal.', answerFormat: 'decimal', answerValue: dec, answerDisplay: trimDecimal(dec,4), tolerance: 0.00005, validation: { type: 'percent-to-decimal', n: r.n, d: r.d }, source: 'percentage-to-decimal' });
  }
  function generateForSection(sectionId, difficulty) {
    switch (sectionId) {
      case 'p2f': return generatePercentageToFraction(difficulty, { sectionId });
      case 'f2p': return generateFractionToPercentage(difficulty, { sectionId });
      case 'of-number': return generatePercentageOfNumber(difficulty, { sectionId });
      case 'reverse': return generateReversePercentage(difficulty, { sectionId });
      default: return generateMixedQuestion(difficulty, difficulty === 'god' ? 'god' : 'extreme');
    }
  }
  function validateGeneratedQuestion(q) {
    const v = q.validation;
    let independentlyCalculated;
    switch (v.type) {
      case 'ratio': independentlyCalculated = v.n / v.d; break;
      case 'ratio-percent': independentlyCalculated = (v.n / v.d) * 100; break;
      case 'percent-of': independentlyCalculated = (v.n / v.d) * v.number; break;
      case 'reverse': independentlyCalculated = (v.part * v.d) / v.n; break;
      case 'decimal-to-percent': independentlyCalculated = (v.n / v.d) * 100; break;
      case 'percent-to-decimal': independentlyCalculated = v.n / v.d; break;
      case 'decimal-to-ratio': independentlyCalculated = v.n / v.d; break;
      case 'ratio-to-decimal': independentlyCalculated = v.n / v.d; break;
      case 'compare': independentlyCalculated = Math.abs(v.a - v.b) < 1e-12 ? 'EQUAL' : v.a > v.b ? 'A' : 'B'; break;
      default: return false;
    }
    if (typeof independentlyCalculated === 'number') return Number.isFinite(independentlyCalculated) && Math.abs(independentlyCalculated - q.answerValue) < 1e-8;
    return independentlyCalculated === q.answerValue;
  }

  function assembleQuestions(mode, sectionId, difficulty) {
    const plan = mode === 'workout'
      ? ['p2f', 'f2p', 'of-number', 'reverse'].map((id, i) => ({ id, count: 20, duration: TARGETS.workoutSectionSeconds[i] }))
      : [{ id: sectionId || 'mixed', count: mode === 'extreme' ? TARGETS.extremeQuestions : mode === 'god' ? TARGETS.godQuestions : mode === 'hard' ? TARGETS.hardQuestions : TARGETS.normalQuestions,
          duration: mode === 'extreme' ? TARGETS.extremeSeconds : mode === 'god' ? TARGETS.godSeconds : mode === 'hard' ? 150 : ((SECTION_BY_ID[sectionId] || SECTION_BY_ID.mixed).duration) }];
    const questions = [], sections = [], inTest = new Set();
    for (const part of plan) {
      const start = questions.length;
      let attempts = 0;
      while (questions.length < start + part.count) {
        attempts++;
        let q = generateForSection(part.id, difficulty);
        if (inTest.has(q.signature)) continue;
        if (recentKeys.includes(q.signature) && attempts < part.count * 32) continue;
        q = { ...q, sectionId: part.id, sectionTitle: SECTION_BY_ID[part.id]?.title || 'Mixed round' };
        questions.push(q); inTest.add(q.signature);
        if (attempts > part.count * 90) throw new Error('The question generator could not fill a unique test.');
      }
      sections.push({ id: part.id, title: SECTION_BY_ID[part.id]?.title || (mode === 'god' ? 'Recognition sprint' : 'Mixed round'), start, end: questions.length, duration: part.duration });
    }
    shuffle(questions);
    // Keep sectional workouts ordered; each section has its own independent clock.
    if (mode === 'workout') {
      const bySection = new Map(sections.map(s => [s.id, questions.filter(q => q.sectionId === s.id)]));
      questions.length = 0;
      for (const section of sections) questions.push(...shuffle(bySection.get(section.id)));
      let offset = 0; for (const section of sections) { section.start = offset; offset += section.end - section.start; section.end = offset; }
    }
    const used = new Set(recentKeys);
    questions.forEach(q => used.add(q.signature)); recentKeys = [...used].slice(-MAX_HISTORY); persistQuestionHistory();
    return { questions, sections };
  }

  function normalizeAnswer(raw, format = 'number') {
    let text = String(raw ?? '').trim();
    if (!text) return { valid: false };
    const compact = text.toUpperCase().replace(/\s+/g, '');
    if (format === 'text') {
      if (['A','B'].includes(compact)) return { valid: true, value: compact };
      if (['EQUAL','EQUALS','SAME','=','TIE'].includes(compact)) return { valid: true, value: 'EQUAL' };
      return { valid: false };
    }
    text = text.replace(/−/g, '-').trim();
    const hasPercent = /%$/.test(text);
    if (hasPercent) text = text.slice(0, -1).trim();
    if (text.includes(',')) {
      if (text.includes('.')) text = text.replace(/,/g, '');
      else if (/^[+-]?\d{1,3}(?:,\d{3})+$/.test(text)) text = text.replace(/,/g, '');
      else if ((text.match(/,/g) || []).length === 1) text = text.replace(',', '.');
      else return { valid: false };
    }
    const fractionMatch = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
    if (fractionMatch) {
      const n = Number(fractionMatch[1]), d = Number(fractionMatch[2]);
      if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return { valid: false };
      return { valid: true, value: n / d };
    }
    const value = Number(text);
    if (!Number.isFinite(value)) return { valid: false };
    if (hasPercent && format !== 'percent') return { valid: true, value: value / 100 };
    return { valid: true, value };
  }
  function checkAnswer(q, raw) {
    const parsed = normalizeAnswer(raw, q.answerFormat);
    if (!parsed.valid) return false;
    if (q.answerFormat === 'text') return parsed.value === q.answerValue;
    return Math.abs(parsed.value - q.answerValue) <= (q.tolerance ?? 1e-8);
  }

  function populateSelectors() {
    const options = SECTION_LIST.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('');
    $('#normal-section').innerHTML = options;
    $('#hard-section').innerHTML = options;
    $('#normal-section').value = 'mixed'; $('#hard-section').value = 'mixed';
    $('#section-grid').innerHTML = SECTION_LIST.map((s, i) => `
      <article class="section-card"><div class="section-card-head"><span class="section-card-num">SECTION 0${i+1}</span><span class="section-card-icon">${s.icon}</span></div>
      <h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p><div class="section-card-foot"><span>20 QUESTIONS</span><strong class="section-card-time" data-section="${s.id}">03:00</strong><button class="section-start" data-section-start="${s.id}">START →</button></div></article>`).join('');
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }

  function showView(name) {
    if (session && name !== 'test') { showToast('Exit the current session to switch views.'); return; }
    $$('.view').forEach(view => view.classList.toggle('hidden', view.id !== `${name}-view`));
    $$('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.view === name));
    const labels = { dashboard: 'Dashboard', training: 'Training modes', atlas: 'Fraction atlas', test: 'Live session', result: 'Session result' };
    $('#breadcrumb-current').textContent = labels[name] || 'Dashboard';
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (name === 'dashboard') renderDashboard();
    if (name === 'atlas') renderAtlas($('#atlas-search').value);
  }
  function startTest(mode, sectionId = null) {
    const difficulty = mode === 'normal' || mode === 'workout' ? 'normal' : mode === 'hard' ? 'hard' : mode;
    if (mode === 'normal' && !sectionId) sectionId = $('#normal-section').value;
    if (mode === 'hard' && !sectionId) sectionId = $('#hard-section').value;
    if (mode === 'workout') sectionId = 'workout';
    if (mode === 'extreme' || mode === 'god') sectionId = 'mixed';
    try {
      const { questions, sections } = assembleQuestions(mode, sectionId, difficulty);
      const now = Date.now();
      session = { mode, difficulty, sectionId, questions, sections, answers: Array(questions.length).fill(null), cursor: 0,
        streak: 0, maxStreak: 0, correctCount: 0, answeredCount: 0, startAt: now, deadlineAt: now + sections[0].duration * 1000,
        currentQuestionStartedAt: now, draft: '', pausedAt: null, completed: false };
      lastResultMode = mode; lastResultSection = sectionId;
      saveActiveSession();
      showView('test'); renderTest(); startTimer();
    } catch (error) {
      console.error(error); showToast('Could not build a fresh test. Please try again.');
    }
  }
  function resumeSavedSession() {
    const saved = readActiveSession();
    if (!saved) { renderResumeBanner(); return; }
    session = saved;
    if (session.pausedAt) {
      const pauseDuration = Date.now() - session.pausedAt;
      session.startAt += pauseDuration;
      session.deadlineAt += pauseDuration;
      session.currentQuestionStartedAt += pauseDuration;
      session.pausedAt = null;
    }
    if (!session.sections?.length) { clearActiveSession(); session = null; renderResumeBanner(); return; }
    if (Date.now() >= session.deadlineAt) {
      handleTimerExpiry();
      if (session) startTimer();
    } else { saveActiveSession(); showView('test'); renderTest(); startTimer(); }
  }
  function pauseAndExit() {
    if (!session) return;
    if (timerInterval) clearInterval(timerInterval); timerInterval = null;
    session.pausedAt = Date.now(); saveActiveSession(); session = null;
    showView('dashboard'); renderResumeBanner();
  }
  function discardSavedSession() { clearActiveSession(); $('#resume-banner').classList.add('hidden'); showToast('Saved session discarded.'); }

  function sectionForCursor() { return session.sections.findIndex(section => session.cursor >= section.start && session.cursor < section.end); }
  function currentSection() { const idx = sectionForCursor(); return session.sections[Math.max(0, idx)] || session.sections[session.sections.length - 1]; }
  function questionSecondsNow() { return Math.max(0, (Date.now() - session.currentQuestionStartedAt) / 1000); }
  function renderTest() {
    if (!session) return;
    const q = session.questions[session.cursor];
    if (!q) { finishTest(false); return; }
    const total = session.questions.length, section = currentSection(), qInSection = session.cursor - section.start + 1, sectionCount = section.end - section.start;
    const modeNames = { normal: 'NORMAL PRACTICE', hard: 'HARD PRACTICE', extreme: 'EXTREME SPEED DRILL', god: 'GOD MODE · 100 IN 5', workout: 'FULL WORKOUT' };
    $('#test-mode-label').textContent = modeNames[session.mode];
    $('#test-section-label').textContent = session.mode === 'workout' ? `SECTION ${sectionForCursor()+1} / 4` : session.mode === 'normal' || session.mode === 'hard' ? section.title.toUpperCase() : 'MIXED ROUND';
    $('#test-difficulty-label').textContent = session.mode === 'workout' ? 'NORMAL' : session.mode.toUpperCase();
    $('#test-title').innerHTML = `${session.mode === 'god' ? 'God mode' : session.mode === 'workout' ? 'Full workout' : session.mode === 'normal' ? 'Normal practice' : session.mode === 'hard' ? 'Hard practice' : 'Extreme'} <span>${total}</span>`;
    $('#timer-sub').textContent = session.mode === 'god' ? '5 minute target' : session.mode === 'extreme' ? '15 minute target' : session.mode === 'hard' ? '2:30 section target' : session.mode === 'workout' ? `Section ${sectionForCursor()+1} · ${sectionCount} questions` : 'Section target';
    $('#question-counter').innerHTML = `QUESTION ${String(session.cursor + 1).padStart(2,'0')} <span>/ ${total}</span>`;
    $('#question-number').textContent = `Q. ${String(session.cursor + 1).padStart(2,'0')}`;
    $('#progress-percent').textContent = `${Math.floor(session.cursor / total * 100)}% COMPLETE`;
    $('#progress-fill').style.width = `${session.cursor / total * 100}%`;
    $('#category-chip').textContent = (CATEGORY_LABEL[q.category] || 'MIXED CALCULATION').toUpperCase();
    $('#question-text').textContent = q.prompt;
    $('#question-hint').textContent = q.hint || 'Calculate mentally. Enter your answer.';
    $('#answer-input').value = session.draft || '';
    $('#answer-input').setAttribute('inputmode', q.answerFormat === 'fraction' || q.answerFormat === 'text' ? 'text' : 'decimal');
    $('#streak-value').textContent = session.streak;
    $('#live-correct').innerHTML = `${session.correctCount}<small> / ${session.answeredCount} answered</small>`;
    $('#live-accuracy').innerHTML = `${session.answeredCount ? Math.round(session.correctCount / session.answeredCount * 100) : '—'}<small>%</small>`;
    $('#section-progress-label').textContent = session.mode === 'workout' ? `${section.title.toUpperCase()} · ${qInSection} / ${sectionCount}` : `${section.title.toUpperCase()} · ${total} QUESTIONS`;
    updateTimerDisplay();
    requestAnimationFrame(() => { if (!$('#test-view').classList.contains('hidden')) { $('#answer-input').focus({ preventScroll: true }); $('#answer-input').select(); } });
  }
  function recordAnswer(raw, skipped = false) {
    if (!session || session.completed) return;
    if (Date.now() >= session.deadlineAt) { handleTimerExpiry(); return; }
    const q = session.questions[session.cursor];
    if (!q) return;
    const text = String(raw || '').trim();
    const correct = !skipped && checkAnswer(q, text);
    const status = skipped ? 'skipped' : correct ? 'correct' : 'wrong';
    const seconds = questionSecondsNow();
    session.answers[session.cursor] = { status, response: text, seconds, expected: q.answerDisplay };
    if (!skipped) session.answeredCount++;
    if (correct) { session.correctCount++; session.streak++; session.maxStreak = Math.max(session.maxStreak, session.streak); }
    else session.streak = 0;
    session.cursor++;
    session.draft = '';
    if (session.cursor >= session.questions.length) { finishTest(false); return; }
    let idx = sectionForCursor();
    if (session.mode === 'workout' && idx >= 0 && session.cursor === session.sections[idx].start) {
      session.deadlineAt = Date.now() + session.sections[idx].duration * 1000;
      showToast(`${session.sections[idx].title} — next section`);
    }
    session.currentQuestionStartedAt = Date.now();
    clearTimeout(draftSaveTimeout);
    saveActiveSession(); lastSessionPersistAt = Date.now(); renderTest();
  }
  function updateTimerDisplay() {
    if (!session) return;
    const remaining = Math.max(0, (session.deadlineAt - Date.now()) / 1000);
    const seconds = Math.ceil(remaining);
    const timer = $('#timer-panel');
    $('#timer-display').textContent = fmtTime(seconds);
    timer.classList.toggle('timer-warning', seconds < 60 && seconds >= 15);
    timer.classList.toggle('timer-critical', seconds < 15);
    const totalQuestions = session.questions.length;
    $('#progress-fill').style.width = `${Math.min(100, session.cursor / totalQuestions * 100)}%`;
  }
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    lastSessionPersistAt = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (!session) { clearInterval(timerInterval); timerInterval = null; return; }
      updateTimerDisplay();
      if (Date.now() >= session.deadlineAt) handleTimerExpiry();
      else if (Date.now() - lastSessionPersistAt >= 1000) { saveActiveSession(); lastSessionPersistAt = Date.now(); }
    }, 200);
  }
  function handleTimerExpiry() {
    if (!session) return;
    if (session.mode === 'workout') {
      const idx = sectionForCursor();
      const next = idx + 1;
      if (next >= session.sections.length) { finishTest(true); return; }
      session.cursor = session.sections[idx].end;
      session.sections[next].visitedAt = Date.now();
      session.deadlineAt = Date.now() + session.sections[next].duration * 1000;
      session.currentQuestionStartedAt = Date.now(); session.draft = '';
      saveActiveSession(); renderTest(); showToast(`${session.sections[idx].title} time. Moving to the next section.`);
      return;
    }
    finishTest(true);
  }
  function onAnswerSubmit() { if (!session) return; const value = $('#answer-input').value; recordAnswer(value, !String(value).trim()); }
  function finishTest(timedOut) {
    if (!session || session.completed) return;
    if (timerInterval) clearInterval(timerInterval); timerInterval = null;
    const endAt = Date.now();
    session.completed = true;
    const elapsed = Math.max(0.1, (endAt - session.startAt) / 1000);
    const answers = session.answers.map((answer, index) => answer || { status: 'skipped', response: '', seconds: null, expected: session.questions[index].answerDisplay });
    const total = session.questions.length;
    const correct = answers.filter(a => a.status === 'correct').length;
    const wrong = answers.filter(a => a.status === 'wrong').length;
    const skipped = total - correct - wrong;
    const accuracy = total ? correct / total * 100 : 0;
    const answerTimes = answers.filter(a => Number.isFinite(a.seconds)).map(a => a.seconds);
    const metrics = { correct, wrong, skipped, total, accuracy, elapsed, average: elapsed / total, qpm: total / (elapsed / 60),
      fastest: answerTimes.length ? Math.min(...answerTimes) : null, slowest: answerTimes.length ? Math.max(...answerTimes) : null,
      targetSeconds: session.mode === 'god' ? TARGETS.godSeconds : session.mode === 'extreme' ? TARGETS.extremeSeconds : null,
      targetCrossed: (session.mode === 'god' || session.mode === 'extreme') && correct + wrong + skipped === total && endAt - session.startAt <= (session.mode === 'god' ? TARGETS.godSeconds : TARGETS.extremeSeconds) * 1000 && !timedOut,
      timedOut, maxStreak: session.maxStreak, mode: session.mode, sectionId: session.sectionId, difficulty: session.difficulty,
      date: new Date(endAt).toISOString(), dateKey: todayKey(new Date(endAt)), questions: session.questions, answers };
    lastResultMode = metrics.mode; lastResultSection = metrics.sectionId;
    const isNewBest = storeResult(metrics);
    clearActiveSession(); session = null;
    renderResult(metrics, isNewBest);
    showView('result');
  }
  function isBetter(candidate, current) {
    if (!current) return true;
    if (candidate.correct !== current.correct) return candidate.correct > current.correct;
    if (Math.abs(candidate.accuracy - current.accuracy) > 1e-8) return candidate.accuracy > current.accuracy;
    return candidate.average < current.average;
  }
  function storeResult(result) {
    const saved = { ...result, questions: undefined, answers: undefined };
    const key = result.mode === 'workout' ? 'workout' : result.mode;
    const old = appData.personalBests[key];
    const isNew = isBetter(saved, old);
    if (isNew) appData.personalBests[key] = saved;
    if (result.mode === 'normal' || result.mode === 'hard' || result.mode === 'workout') {
      const oldGeneral = appData.personalBests.general;
      if (!oldGeneral || result.accuracy > oldGeneral.accuracy || (result.accuracy === oldGeneral.accuracy && result.average < oldGeneral.average)) appData.personalBests.general = saved;
    }
    // Keep independent all-time records as well as the mode-specific score PBs.
    const metrics = appData.personalBests.metrics || (appData.personalBests.metrics = {});
    if (!metrics.accuracy || result.accuracy > metrics.accuracy.accuracy) metrics.accuracy = saved;
    if (!metrics.average || result.average < metrics.average.average) metrics.average = saved;
    if (!metrics.qpm || result.qpm > metrics.qpm.qpm) metrics.qpm = saved;
    appData.totalTestsCompleted = (appData.totalTestsCompleted || 0) + 1;
    appData.tests.push(saved); appData.tests = appData.tests.slice(-300);
    appData.recent.unshift({ mode: result.mode, correct: result.correct, total: result.total, accuracy: result.accuracy, qpm: result.qpm, date: result.date, dateKey: result.dateKey }); appData.recent = appData.recent.slice(0, 30);
    persistData();
    return isNew;
  }

  function renderResult(result, isNewBest) {
    $('#pb-celebration').classList.toggle('hidden', !isNewBest);
    const modeLabel = { normal: 'NORMAL PRACTICE', hard: 'HARD PRACTICE', extreme: 'EXTREME · 100 / 15', god: 'GOD MODE · 100 / 5', workout: 'FULL WORKOUT · 80 QUESTIONS' }[result.mode];
    $('#result-mode-tag').textContent = modeLabel;
    $('#result-score').innerHTML = `${result.correct}<span> / ${result.total}</span>`;
    $('#result-accuracy').innerHTML = `${Math.round(result.accuracy)}<small>%</small>`;
    $('#result-correct').textContent = result.correct; $('#result-wrong').textContent = result.wrong; $('#result-skipped').textContent = result.skipped;
    $('#result-time').textContent = fmtTime(result.elapsed);
    $('#result-average').innerHTML = `${result.average.toFixed(2)}<small> sec</small>`;
    $('#result-qpm').innerHTML = `${result.qpm.toFixed(2)}<small> q/min</small>`;
    $('#result-fastest').textContent = result.fastest === null ? '—' : fmtDuration(result.fastest, 2);
    $('#result-avg-time').textContent = `${result.average.toFixed(2)} sec`;
    $('#result-slowest').textContent = result.slowest === null ? '—' : fmtDuration(result.slowest, 2);
    const target = $('#result-target');
    const targetLabel = { extreme: '15-MINUTE TARGET', god: '5-MINUTE TARGET', normal: 'SECTION TARGET', hard: '2:30 SECTION', workout: 'SECTION CLOCKS' }[result.mode];
    $('#result-target-label').textContent = targetLabel;
    if (result.mode === 'extreme' || result.mode === 'god') target.innerHTML = result.targetCrossed ? '<span style="color:var(--lime)">CROSSED ✓</span>' : result.timedOut ? 'TIME EXPIRED' : 'NOT YET';
    else target.textContent = result.timedOut ? 'CLOCK EXPIRED' : 'WITHIN TIME';
    const verdict = result.accuracy >= 90 ? 'Excellent control. Keep that accuracy as the pace climbs.' : result.accuracy >= 75 ? 'A solid run. Review the patterns that cost you time.' : result.accuracy >= 50 ? 'Build accuracy first; speed follows reliable recall.' : 'Use the review to rebuild recognition before the next sprint.';
    $('#result-verdict').textContent = verdict;
    renderCategoryAnalysis(result);
    renderAnswerReview(result);
    $('#retry-test').textContent = 'RUN IT BACK  ↻';
    $('#retry-test').dataset.retry = result.mode;
  }
  function renderCategoryAnalysis(result) {
    const stats = new Map();
    result.questions.forEach((q, index) => {
      const key = q.category; if (!stats.has(key)) stats.set(key, { total: 0, correct: 0 });
      const stat = stats.get(key); stat.total++; if (result.answers[index].status === 'correct') stat.correct++;
    });
    const rows = [...stats.entries()].map(([key, stat]) => ({ key, ...stat, pct: stat.total ? stat.correct / stat.total * 100 : 0 })).sort((a,b) => a.pct - b.pct || b.total - a.total);
    $('#category-results').innerHTML = rows.map(row => `<div class="category-result"><span title="${escapeHtml(CATEGORY_LABEL[row.key])}">${escapeHtml(CATEGORY_LABEL[row.key])}</span><div class="cat-bar"><i style="width:${row.pct}%"></i></div><strong>${row.correct}/${row.total} · ${Math.round(row.pct)}%</strong></div>`).join('');
    const weak = rows.find(row => row.total >= 2);
    $('#weak-pattern').textContent = weak ? `Focus next: ${CATEGORY_LABEL[weak.key]} (${weak.correct}/${weak.total} correct).` : rows.length ? `${CATEGORY_LABEL[rows[0].key]}: ${rows[0].correct}/${rows[0].total} correct. Keep building the sample.` : 'No questions were answered in this session.';
  }
  function renderAnswerReview(result) {
    const rows = result.questions.map((q, index) => {
      const a = result.answers[index], statusName = a.status[0].toUpperCase() + a.status.slice(1);
      const response = a.response ? escapeHtml(a.response) : '—';
      const expected = escapeHtml(a.expected);
      const expectedCell = a.status === 'correct' ? expected : `${response} <span style="color:#778478">→ ${expected}</span>`;
      return `<div class="review-row"><span class="review-index">${String(index+1).padStart(2,'0')}</span><span class="review-prompt" title="${escapeHtml(q.prompt)}">${escapeHtml(q.prompt)}</span><span class="review-answer">${expectedCell}</span><span class="review-status ${a.status}">${statusName}</span></div>`;
    }).join('');
    $('#answer-review').innerHTML = rows; $('#review-count').textContent = `${result.total} questions`;
  }

  function renderDashboard() {
    appData = loadData();
    const today = todayKey(); const todays = appData.tests.filter(test => test.dateKey === today);
    const count = todays.length;
    $('#today-date').textContent = formatLongDate(new Date()).toUpperCase();
    $('#stat-tests').textContent = count; $('#ring-count').textContent = count;
    $('#sidebar-tests').textContent = `${count} test${count === 1 ? '' : 's'} today`;
    $('.target-progress span').style.width = `${Math.min(100, count / 3 * 100)}%`;
    $('.ring-outer').style.setProperty('--ring-progress', `${Math.min(100, count / 3 * 100)}%`);
    if (count) {
      const best = todays.reduce((a,b) => b.correct > a.correct ? b : a);
      $('#stat-best').textContent = `${best.correct} / ${best.total}`; $('#stat-best-sub').textContent = `${Math.round(best.accuracy)}% accuracy · ${best.mode.toUpperCase()}`;
      $('#stat-accuracy').innerHTML = `${Math.round(todays.reduce((sum,t) => sum+t.accuracy,0)/count)}<em>%</em>`;
      $('#stat-pace').textContent = (todays.reduce((sum,t) => sum+t.qpm,0)/count).toFixed(1);
    } else { $('#stat-best').textContent = '—'; $('#stat-best-sub').textContent = 'Complete a test to set a mark'; $('#stat-accuracy').innerHTML = '—<em>%</em>'; $('#stat-pace').textContent = '—'; }
    renderPersonalBests(); renderResumeBanner();
  }
  function renderPersonalBests() {
    const items = [
      ['EXTREME PB', 'extreme', '◉'], ['GOD MODE PB', 'god', '✳'], ['SECTION PB', 'general', '↗']
    ];
    $('#pb-grid').innerHTML = items.map(([label,key,icon]) => {
      const pb = appData.personalBests[key];
      return `<article class="pb-card"><div class="pb-card-head"><span>${label}</span><span>${icon}</span></div>${pb ? `<strong>${pb.correct} / ${pb.total}</strong><p>${Math.round(pb.accuracy)}% accuracy · ${pb.qpm.toFixed(1)} q/min</p>` : `<strong>—</strong><p>Record waiting to be set</p>`}</article>`;
    }).join('');
  }
  function renderResumeBanner() {
    const saved = readActiveSession();
    const banner = $('#resume-banner');
    if (!saved || !saved.questions?.length) { banner.classList.add('hidden'); return; }
    const title = saved.mode === 'god' ? 'GOD MODE · 100 IN 5' : saved.mode === 'extreme' ? 'EXTREME · 100 IN 15' : saved.mode === 'workout' ? 'FULL WORKOUT' : `${saved.mode.toUpperCase()} PRACTICE`;
    $('#resume-copy').textContent = `${title} · question ${Math.min(saved.cursor + 1, saved.questions.length)} of ${saved.questions.length}. Your answers are saved.`;
    banner.classList.remove('hidden');
  }

  function renderAtlas(query = '') {
    const normalized = query.trim().toLowerCase();
    const filtered = STANDARD_FRACTIONS.filter(r => `${r.displayPercent} ${fractionText(r.n,r.d)} ${r.value}`.toLowerCase().includes(normalized));
    $('#atlas-body').innerHTML = filtered.map(r => {
      const decimal = r.value.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
      const approx = !isTerminating(r.n * 100, r.d);
      return `<tr><td>${r.displayPercent}${approx ? '<span class="approx-badge">≈</span>' : ''}</td><td>${fractionText(r.n,r.d)}</td><td>${decimal}${!isTerminating(r.n,r.d) ? '…' : ''}</td><td>${trimDecimal(r.value*100,2)}%</td></tr>`;
    }).join('');
    $('#atlas-empty').classList.toggle('hidden', filtered.length !== 0);
  }

  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function bindEvents() {
    $('.brand').addEventListener('click', event => { event.preventDefault(); showView('dashboard'); });
    $$('.nav-link').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
    $$('[data-go="training"]').forEach(button => button.addEventListener('click', () => showView('training')));
    $$('[data-start]').forEach(button => button.addEventListener('click', () => startTest(button.dataset.start)));
    $('#section-grid').addEventListener('click', event => {
      const button = event.target.closest('[data-section-start]'); if (!button) return;
      startTest(selectedDifficulty, button.dataset.section);
    });
    $$('.seg-button').forEach(button => button.addEventListener('click', () => {
      selectedDifficulty = button.dataset.difficulty;
      $$('.seg-button').forEach(item => item.classList.toggle('active', item === button));
      $$('.section-card-time').forEach(el => { const section = SECTION_BY_ID[el.dataset.section]; el.textContent = fmtTime(selectedDifficulty === 'hard' ? 150 : section.duration); });
    }));
    $('#submit-answer').addEventListener('click', onAnswerSubmit);
    $('#skip-question').addEventListener('click', () => recordAnswer('', true));
    $('#answer-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); onAnswerSubmit(); } });
    $('#answer-input').addEventListener('input', () => { if (session) { session.draft = $('#answer-input').value; clearTimeout(draftSaveTimeout); draftSaveTimeout = setTimeout(saveActiveSession, 350); } });
    $('#exit-test').addEventListener('click', () => $('#exit-dialog').showModal());
    $('#exit-dialog').addEventListener('close', () => { if ($('#exit-dialog').returnValue === 'confirm') pauseAndExit(); });
    $('#resume-button').addEventListener('click', resumeSavedSession);
    $('#discard-button').addEventListener('click', discardSavedSession);
    $('#atlas-search').addEventListener('input', event => renderAtlas(event.target.value));
    $('#retry-test').addEventListener('click', () => {
      const mode = $('#retry-test').dataset.retry || lastResultMode;
      startTest(mode, mode === 'normal' || mode === 'hard' ? lastResultSection : null);
    });
    $('#home-button').addEventListener('click', () => showView('dashboard'));
    window.addEventListener('beforeunload', event => { if (session) { saveActiveSession(); event.preventDefault(); event.returnValue = ''; } });
  }

  function init() {
    populateSelectors();
    bindEvents();
    $('#today-date').textContent = formatLongDate(new Date()).toUpperCase();
    $('#section-grid').querySelectorAll('.section-card-time').forEach(el => { const section = SECTION_BY_ID[el.dataset.section]; el.textContent = fmtTime(section.duration); });
    $('.atlas-count strong').textContent = STANDARD_FRACTIONS.length;
    renderDashboard();
    const saved = readActiveSession();
    if (saved) renderResumeBanner();
  }
  init();

  // Keep the generator/checker callable for lightweight browser-console QA without a build step.
  window.SSCSpeedLab = Object.freeze({
    generatePercentageToFraction, generateFractionToPercentage, generatePercentageOfNumber,
    generateReversePercentage, generateDecimalPercentage, generateMixedQuestion,
    validateGeneratedQuestion, checkAnswer, assembleQuestions, standardFractions: STANDARD_FRACTIONS,
    targets: TARGETS
  });
})();
