// NCLEX Exam Simulator Pro - Core Application Logic
(function() {
  'use strict';

  // --- STATE ---
  const state = {
    bank: [],
    labValues: [],
    categories: [],
    isLoaded: false,
    currentView: 'dashboard',
    
    // Active Exam
    exam: {
      active: false,
      questions: [],
      currentIndex: 0,
      userAnswers: {},       // { [qIndex]: string | string[] }
      marked: new Set(),     // Set of qIndices
      eliminated: {},        // { [qIndex]: Set of optionLabels }
      highlights: {},        // { [qIndex]: string }
      config: null,
      startedAt: 0,
      timerSeconds: 0,
      elapsedSeconds: 0,
      timerId: null,
      isPaused: false,
      isSubmitted: false,
      practiceRevealed: {}   // { [qIndex]: boolean } in practice mode
    },

    // Last Exam Result
    lastResult: null,

    // Explorer State
    explorer: {
      searchTerm: '',
      selectedBank: 'all',
      selectedCategory: 'all',
      selectedType: 'all',
      onlySaved: false,
      page: 1,
      pageSize: 20
    },

    // User Data (Persisted)
    savedIds: new Set(),
    history: [],
    preferences: {
      theme: 'modern',
      fontSize: 'normal'
    }
  };

  // Helper DOM selectors
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // --- LOCAL STORAGE HELPERS ---
  function loadPersistedData() {
    try {
      const saved = localStorage.getItem('nclex_saved_ids');
      if (saved) state.savedIds = new Set(JSON.parse(saved));
      
      const hist = localStorage.getItem('nclex_history');
      if (hist) state.history = JSON.parse(hist);
      
      const prefs = localStorage.getItem('nclex_prefs');
      if (prefs) {
        state.preferences = Object.assign(state.preferences, JSON.parse(prefs));
      }
    } catch (e) {
      console.warn('Could not read from localStorage:', e);
    }
    applyPreferences();
  }

  function saveBookmarks() {
    try {
      localStorage.setItem('nclex_saved_ids', JSON.stringify([...state.savedIds]));
    } catch(e) {}
  }

  function saveHistoryRecord(record) {
    state.history.unshift(record);
    if (state.history.length > 50) state.history.pop();
    try {
      localStorage.setItem('nclex_history', JSON.stringify(state.history));
    } catch(e) {}
    updateDashboardStats();
  }

  function applyPreferences() {
    document.documentElement.setAttribute('data-theme', state.preferences.theme || 'modern');
    document.documentElement.setAttribute('data-fontsize', state.preferences.fontSize || 'normal');
    try {
      localStorage.setItem('nclex_prefs', JSON.stringify(state.preferences));
    } catch(e) {}
    
    // Update theme button state
    $$('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === state.preferences.theme);
    });
    $$('.font-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === state.preferences.fontSize);
    });
  }

  // --- INITIALIZATION ---
  async function init() {
    loadPersistedData();
    setupEventListeners();
    await loadData();
    populateCategorySelectors();
    updateDashboardStats();
    switchView('dashboard');

    // Register service worker if available
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.log('SW registration skipped:', err);
      });
    }
  }

  async function loadData() {
    // 1. Try window.NCLEX_BANK first (fastest, works offline and via file://)
    if (window.NCLEX_BANK && Array.isArray(window.NCLEX_BANK)) {
      state.bank = window.NCLEX_BANK;
    } else {
      try {
        const res = await fetch('./data/questions.json');
        state.bank = await res.json();
      } catch (err) {
        console.error('Failed to fetch questions.json:', err);
      }
    }

    // 2. Load lab values
    if (window.NCLEX_LAB_VALUES && Array.isArray(window.NCLEX_LAB_VALUES)) {
      state.labValues = window.NCLEX_LAB_VALUES;
    } else {
      try {
        const res = await fetch('./data/lab-values.json');
        state.labValues = await res.json();
      } catch (err) {
        console.error('Failed to fetch lab-values.json:', err);
      }
    }

    // Extract categories
    const catMap = new Map();
    state.bank.forEach(q => {
      if (q.category) {
        catMap.set(q.category, (catMap.get(q.category) || 0) + 1);
      }
    });
    state.categories = Array.from(catMap.entries()).map(([name, count]) => ({ name, count }));
    state.categories.sort((a, b) => b.count - a.count);

    state.isLoaded = true;
    $('totalQuestionsBadge').textContent = state.bank.length.toLocaleString();
    renderLabValuesTable();
  }

  // --- VIEW SWITCHING ---
  function switchView(viewName) {
    state.currentView = viewName;
    $$('.view-panel').forEach(panel => panel.classList.add('hidden'));
    $$('.nav-tab').forEach(tab => tab.classList.remove('active'));

    const activeTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
    if (activeTab) activeTab.classList.add('active');

    const targetPanel = $(`view-${viewName}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    if (viewName === 'dashboard') {
      updateDashboardStats();
    } else if (viewName === 'explorer') {
      renderExplorer();
    } else if (viewName === 'saved') {
      renderSavedQuestions();
    } else if (viewName === 'analytics') {
      renderAnalyticsView();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- DASHBOARD ---
  function updateDashboardStats() {
    $('dashTotalBank').textContent = state.bank.length.toLocaleString();
    $('dashBookmarksCount').textContent = state.savedIds.size.toLocaleString();
    $('navSavedBadge').textContent = state.savedIds.size;

    // Calculate historical stats
    let totalQuestionsAnswered = 0;
    let totalCorrect = 0;
    state.history.forEach(h => {
      totalQuestionsAnswered += (h.totalQuestions || 0);
      totalCorrect += (h.correct || 0);
    });

    $('dashPracticedCount').textContent = totalQuestionsAnswered.toLocaleString();
    const overallAcc = totalQuestionsAnswered > 0 ? Math.round((totalCorrect / totalQuestionsAnswered) * 100) : 0;
    $('dashOverallAccuracy').textContent = `${overallAcc}%`;

    // Passing Probability Indicator
    let passLabel = 'Not Enough Data';
    let passColor = '#94a3b8';
    if (totalQuestionsAnswered >= 50) {
      if (overallAcc >= 72) {
        passLabel = 'Very High (Ready)';
        passColor = '#10b981';
      } else if (overallAcc >= 65) {
        passLabel = 'High (Borderline Ready)';
        passColor = '#3b82f6';
      } else if (overallAcc >= 55) {
        passLabel = 'Moderate (Review Needed)';
        passColor = '#f59e0b';
      } else {
        passLabel = 'Low (Intensive Prep)';
        passColor = '#ef4444';
      }
    }
    const probEl = $('dashPassProbability');
    if (probEl) {
      probEl.textContent = passLabel;
      probEl.style.color = passColor;
    }

    renderRecentHistoryList();
  }

  function renderRecentHistoryList() {
    const list = $('dashRecentExamsList');
    if (!list) return;
    if (state.history.length === 0) {
      list.innerHTML = `<div class="text-muted" style="text-align:center; padding: 1.5rem;">No exam attempts recorded yet. Launch your first practice exam above!</div>`;
      return;
    }

    list.innerHTML = state.history.slice(0, 5).map(h => {
      const dateStr = new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const pct = Math.round((h.correct / h.totalQuestions) * 100);
      const isPass = pct >= 65;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.85rem; border-bottom:1px solid var(--border); font-size:0.9rem;">
          <div>
            <div style="font-weight:700;">${h.title || 'NCLEX Practice Exam'}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${dateStr} · ${h.totalQuestions} Questions · ${h.mode === 'practice' ? 'Tutor Mode' : 'Timed Exam'}</div>
          </div>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span class="badge ${isPass ? 'badge-primary' : 'badge-sata'}" style="font-weight:800;">${pct}%</span>
            <span style="font-size:0.8rem; font-weight:700; color:${isPass ? 'var(--success)' : 'var(--danger)'};">${isPass ? 'PASS' : 'STUDY'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- EXAM SETUP & BUILDER ---
  function populateCategorySelectors() {
    const container = $('setupCategoryCheckboxes');
    if (!container) return;
    container.innerHTML = state.categories.map((c, i) => `
      <label class="checkbox-item">
        <input type="checkbox" name="setupCategory" value="${encodeURIComponent(c.name)}" checked>
        <span>${c.name} <span class="text-muted">(${c.count})</span></span>
      </label>
    `).join('');

    // Also populate Explorer category filter
    const expSelect = $('explorerCategoryFilter');
    if (expSelect) {
      expSelect.innerHTML = `<option value="all">All Clinical Categories (${state.bank.length})</option>` +
        state.categories.map(c => `<option value="${encodeURIComponent(c.name)}">${c.name} (${c.count})</option>`).join('');
    }
  }

  function startExamWithConfig(config) {
    // Filter questions based on config
    let candidates = state.bank.filter(q => q.type !== 'unsupported');

    // 0. Filter by Question Bank Source (NCSBN Official vs Comprehensive)
    if (config.bankSource && config.bankSource !== 'all') {
      candidates = candidates.filter(q => q.sourceBank === config.bankSource);
    }

    // 1. Filter by category
    if (config.categories && config.categories.length > 0 && !config.categories.includes('all')) {
      const allowed = new Set(config.categories);
      candidates = candidates.filter(q => allowed.has(q.category));
    }

    // 2. Filter by question type
    if (config.questionType && config.questionType !== 'all') {
      candidates = candidates.filter(q => q.type === config.questionType);
    }

    // 3. Filter by question pool
    if (config.pool === 'saved') {
      candidates = candidates.filter(q => state.savedIds.has(q.id));
      if (candidates.length === 0) {
        alert('You have no saved/bookmarked questions in this category. Please bookmark questions or select another pool.');
        return;
      }
    } else if (config.pool === 'missed') {
      // Find all missed IDs from history
      const missedIds = new Set();
      state.history.forEach(h => {
        (h.missedIds || []).forEach(id => missedIds.add(id));
      });
      candidates = candidates.filter(q => missedIds.has(q.id));
      if (candidates.length === 0) {
        alert('No previously missed questions recorded yet! Complete an exam first or practice with the general question bank.');
        return;
      }
    }

    // 4. Shuffle / Order
    if (config.order === 'random') {
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
    }

    // 5. Slice question count
    let n = config.count === 'all' ? candidates.length : Number(config.count);
    n = Math.min(n, candidates.length);
    if (n <= 0) {
      alert('No questions matched the selected criteria. Try adjusting your category or type filters.');
      return;
    }
    const examQuestions = candidates.slice(0, n);

    // Initialize Active Exam
    clearInterval(state.exam.timerId);
    state.exam = {
      active: true,
      questions: examQuestions,
      currentIndex: 0,
      userAnswers: {},
      marked: new Set(),
      eliminated: {},
      highlights: {},
      config: config,
      startedAt: Date.now(),
      timerSeconds: Number(config.duration || 0) * 60,
      elapsedSeconds: 0,
      timerId: null,
      isPaused: false,
      isSubmitted: false,
      practiceRevealed: {}
    };

    // Setup timer
    if (state.exam.timerSeconds > 0) {
      updateTimerDisplay();
      state.exam.timerId = setInterval(() => {
        if (!state.exam.isPaused) {
          state.exam.timerSeconds--;
          state.exam.elapsedSeconds++;
          updateTimerDisplay();
          if (state.exam.timerSeconds <= 0) {
            clearInterval(state.exam.timerId);
            alert('Time has expired! Submitting your exam now.');
            submitExam(true);
          }
        }
      }, 1000);
    } else {
      $('examTimerWrap').classList.add('hidden');
    }

    switchView('exam');
    renderCurrentQuestion();
    renderQuestionPalette();
  }

  function updateTimerDisplay() {
    const wrap = $('examTimerWrap');
    const display = $('examTimerText');
    if (!wrap || !display) return;
    wrap.classList.remove('hidden');

    const totalSec = Math.max(0, state.exam.timerSeconds);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    let timeStr = '';
    if (hrs > 0) {
      timeStr = `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    display.textContent = timeStr;

    if (totalSec < 300) { // Under 5 minutes
      display.parentElement.classList.add('warning');
    } else {
      display.parentElement.classList.remove('warning');
    }
  }

  // --- ACTIVE EXAM RENDERING ---
  function renderCurrentQuestion() {
    const exam = state.exam;
    const q = exam.questions[exam.currentIndex];
    if (!q) return;

    // Header info
    $('examQuestionCounter').textContent = `Question ${exam.currentIndex + 1} of ${exam.questions.length}`;
    let bankLabel = `Bank #${q.bankId || q.id}`;
    if (q.sourceBank === 'NCSBN Official') {
      bankLabel = `NCSBN #${q.bankId}`;
    } else if (q.sourceBank === 'NCLEX Exam Cram') {
      bankLabel = `Cram Ch.${q.chapter || 1} #${q.chapterQuestionNumber || q.bankId}`;
    } else if (q.sourceBank === 'NCLEX Practice Bank 4') {
      bankLabel = `Bank 4 #${q.bankId}`;
    } else if (q.sourceBank === 'NCLEX Practice Bank 5') {
      bankLabel = `Bank 5 #${q.bankId}`;
    } else if (q.sourceBank === 'HESI 1200 Bank 6') {
      bankLabel = `HESI #${q.bankId}`;
    }
    $('examBankIdBadge').textContent = bankLabel;
    $('examCategoryBadge').textContent = q.category || 'Clinical';

    // Type Badge
    const typeBadge = $('examTypeBadge');
    if (q.type === 'sata') {
      typeBadge.textContent = 'Select All That Apply';
      typeBadge.className = 'badge badge-sata';
      $('sataInstructionBanner').classList.remove('hidden');
      $('numericContainer').classList.add('hidden');
      $('optionsContainer').classList.remove('hidden');
    } else if (q.type === 'numeric') {
      typeBadge.textContent = 'Calculation / Fill-in';
      typeBadge.className = 'badge badge-numeric';
      $('sataInstructionBanner').classList.add('hidden');
      $('optionsContainer').classList.add('hidden');
      $('numericContainer').classList.remove('hidden');
    } else {
      typeBadge.textContent = 'Multiple Choice';
      typeBadge.className = 'badge badge-primary';
      $('sataInstructionBanner').classList.add('hidden');
      $('numericContainer').classList.add('hidden');
      $('optionsContainer').classList.remove('hidden');
    }

    // Progress bar
    const answeredCount = Object.keys(exam.userAnswers).length;
    $('examProgressBar').style.width = `${(answeredCount / exam.questions.length) * 100}%`;
    $('examAnsweredStat').textContent = answeredCount;
    $('examRemainingStat').textContent = exam.questions.length - answeredCount;

    // Stem
    const stemEl = $('questionStemText');
    stemEl.innerHTML = formatStemText(q.question, exam.highlights[exam.currentIndex]);

    // Render Options or Numeric Input
    if (q.type === 'numeric') {
      renderNumericInput(q);
    } else {
      renderOptionsList(q);
    }

    // Mark button status
    const isMarked = exam.marked.has(exam.currentIndex);
    const markBtn = $('btnMarkReview');
    markBtn.textContent = isMarked ? '★ Marked for Review' : '☆ Mark for Review';
    markBtn.classList.toggle('btn-warning', isMarked);

    // Prev / Next buttons
    $('btnPrevQuestion').disabled = exam.currentIndex === 0;
    $('btnNextQuestion').disabled = exam.currentIndex === exam.questions.length - 1;

    // Instant Feedback in Practice Mode
    renderPracticeFeedback(q);

    // Update active highlight in palette
    updatePaletteActiveState();
  }

  function formatStemText(rawText, highlightWords) {
    if (!highlightWords || highlightWords.length === 0) return escapeHtml(rawText);
    let escaped = escapeHtml(rawText);
    highlightWords.forEach(word => {
      if (word.trim().length > 1) {
        const reg = new RegExp(`(${escapeRegex(word)})`, 'gi');
        escaped = escaped.replace(reg, '<mark>$1</mark>');
      }
    });
    return escaped;
  }

  function renderOptionsList(q) {
    const container = $('optionsContainer');
    container.innerHTML = '';
    const currentAnswer = state.exam.userAnswers[state.exam.currentIndex];
    const eliminated = state.exam.eliminated[state.exam.currentIndex] || new Set();

    q.options.forEach((opt, idx) => {
      const isSata = q.type === 'sata';
      const isSelected = isSata 
        ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.label)
        : currentAnswer === opt.label;
      const isStriked = eliminated.has(opt.label);

      const card = document.createElement('div');
      card.className = `option-card ${isSelected ? 'selected' : ''} ${isStriked ? 'strikethrough' : ''}`;
      
      const labelLetter = isSata ? '✓' : String.fromCharCode(65 + idx); // A, B, C, D or check

      card.innerHTML = `
        <div class="option-label">${opt.label || labelLetter}</div>
        <div class="option-text">${opt.text}</div>
        <button type="button" class="option-strike-btn" title="Eliminate / Cross-out option" data-label="${opt.label}">
          <s>✕</s>
        </button>
      `;

      // Option selection click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.option-strike-btn')) return;
        selectOption(q, opt.label);
      });

      // Strikethrough elimination click
      const strikeBtn = card.querySelector('.option-strike-btn');
      strikeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleElimination(opt.label);
      });

      // Right-click to toggle elimination
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        toggleElimination(opt.label);
      });

      container.appendChild(card);
    });
  }

  function selectOption(q, label) {
    const exam = state.exam;
    if (exam.isSubmitted) return;

    if (q.type === 'sata') {
      let selected = Array.isArray(exam.userAnswers[exam.currentIndex]) 
        ? [...exam.userAnswers[exam.currentIndex]] 
        : [];
      if (selected.includes(label)) {
        selected = selected.filter(l => l !== label);
      } else {
        selected.push(label);
      }
      if (selected.length > 0) {
        exam.userAnswers[exam.currentIndex] = selected;
      } else {
        delete exam.userAnswers[exam.currentIndex];
      }
    } else {
      exam.userAnswers[exam.currentIndex] = label;
    }

    renderCurrentQuestion();
    renderQuestionPalette();
  }

  function toggleElimination(label) {
    const exam = state.exam;
    if (!exam.eliminated[exam.currentIndex]) {
      exam.eliminated[exam.currentIndex] = new Set();
    }
    const set = exam.eliminated[exam.currentIndex];
    if (set.has(label)) {
      set.delete(label);
    } else {
      set.add(label);
    }
    renderCurrentQuestion();
  }

  function renderNumericInput(q) {
    const input = $('numericAnswerInput');
    const curVal = state.exam.userAnswers[state.exam.currentIndex] || '';
    input.value = curVal;
    input.oninput = (e) => {
      const val = e.target.value.trim();
      if (val) {
        state.exam.userAnswers[state.exam.currentIndex] = val;
      } else {
        delete state.exam.userAnswers[state.exam.currentIndex];
      }
      renderQuestionPalette();
    };
  }

  // --- PRACTICE MODE INSTANT FEEDBACK ---
  function renderPracticeFeedback(q) {
    const panel = $('practiceFeedbackPanel');
    if (!panel) return;
    
    // Only in Practice mode
    if (state.exam.config && state.exam.config.mode !== 'practice') {
      panel.classList.add('hidden');
      return;
    }

    const userAnswer = state.exam.userAnswers[state.exam.currentIndex];
    const isAnswered = userAnswer !== undefined && (Array.isArray(userAnswer) ? userAnswer.length > 0 : Boolean(userAnswer));

    if (!isAnswered) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    const isCorrect = checkAnswerCorrectness(q, userAnswer);

    panel.className = `rationale-panel ${isCorrect ? 'correct' : 'incorrect'}`;
    const header = panel.querySelector('.rationale-header');
    header.className = `rationale-header ${isCorrect ? 'correct' : 'incorrect'}`;
    header.innerHTML = isCorrect ? '✓ Correct Answer!' : '✕ Incorrect';

    const body = panel.querySelector('.rationale-body');
    let correctText = '';
    if (q.type === 'sata') {
      correctText = `Correct selections: <strong>${(q.correctAnswers || []).join(', ')}</strong>`;
    } else if (q.type === 'numeric') {
      correctText = `Correct numeric answer: <strong>${(q.correctAnswers || []).join(' or ')}</strong>`;
    } else {
      const opt = (q.options || []).find(o => o.label === (q.correctAnswers && q.correctAnswers[0]));
      correctText = `Correct answer: <strong>Option ${q.correctAnswers ? q.correctAnswers[0] : ''}: ${opt ? opt.text : ''}</strong>`;
    }

    body.innerHTML = `
      <div style="margin-bottom:0.75rem; font-size:0.95rem;">${correctText}</div>
      ${q.answerText ? `<div style="background:var(--bg-surface); padding:0.85rem; border-radius:var(--radius-md); border:1px solid var(--border); font-size:0.9rem;"><strong>Clinical Explanation & Rationale:</strong><br>${escapeHtml(q.answerText)}</div>` : ''}
    `;
  }

  function checkAnswerCorrectness(q, userAns) {
    if (!userAns || !q.correctAnswers || q.correctAnswers.length === 0) return false;

    if (q.type === 'sata') {
      if (!Array.isArray(userAns)) return false;
      const sortedUser = [...userAns].sort();
      const sortedCorrect = [...q.correctAnswers].sort();
      return JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect);
    } else if (q.type === 'numeric') {
      const u = parseFloat(userAns);
      return q.correctAnswers.some(c => parseFloat(c) === u);
    } else {
      return String(userAns).trim() === String(q.correctAnswers[0]).trim();
    }
  }

  // --- PALETTE DRAWER ---
  function renderQuestionPalette() {
    const grid = $('questionPaletteGrid');
    if (!grid) return;
    grid.innerHTML = '';

    state.exam.questions.forEach((q, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pal-btn';
      btn.textContent = i + 1;
      btn.dataset.index = i;

      const ans = state.exam.userAnswers[i];
      const isAnswered = ans !== undefined && (Array.isArray(ans) ? ans.length > 0 : Boolean(ans));
      if (isAnswered) btn.classList.add('answered');
      if (state.exam.marked.has(i)) btn.classList.add('marked');
      if (state.exam.currentIndex === i) btn.classList.add('current');

      btn.onclick = () => {
        state.exam.currentIndex = i;
        renderCurrentQuestion();
      };

      grid.appendChild(btn);
    });
  }

  function updatePaletteActiveState() {
    $$('.pal-btn').forEach(btn => {
      const idx = Number(btn.dataset.index);
      btn.classList.toggle('current', idx === state.exam.currentIndex);
    });
  }

  // --- SUBMIT & SCORE EXAM ---
  function confirmSubmitExam() {
    const exam = state.exam;
    const answeredCount = Object.keys(exam.userAnswers).length;
    const unanswered = exam.questions.length - answeredCount;

    let msg = 'Are you sure you want to finish and submit your exam?';
    if (unanswered > 0) {
      msg = `Warning: You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Unanswered questions will be scored as incorrect.\n\nDo you still wish to submit?`;
    }
    if (confirm(msg)) {
      submitExam(false);
    }
  }

  function submitExam(isTimeout) {
    const exam = state.exam;
    if (exam.isSubmitted) return;
    exam.isSubmitted = true;
    clearInterval(exam.timerId);

    // Scoring & Analysis
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;
    const missedIds = [];
    const itemResults = [];
    const categoryStats = {};

    exam.questions.forEach((q, i) => {
      const userAns = exam.userAnswers[i];
      const isAnswered = userAns !== undefined && (Array.isArray(userAns) ? userAns.length > 0 : Boolean(userAns));
      const isCorrect = isAnswered && checkAnswerCorrectness(q, userAns);

      if (!isAnswered) {
        blankCount++;
        missedIds.push(q.id);
      } else if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
        missedIds.push(q.id);
      }

      // Category breakdown
      const cat = q.category || 'Fundamentals';
      if (!categoryStats[cat]) categoryStats[cat] = { total: 0, correct: 0 };
      categoryStats[cat].total++;
      if (isCorrect) categoryStats[cat].correct++;

      itemResults.push({
        index: i + 1,
        question: q,
        userAnswer: userAns,
        isAnswered: isAnswered,
        isCorrect: isCorrect,
        isMarked: exam.marked.has(i)
      });
    });

    const totalQ = exam.questions.length;
    const percentage = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
    const isPass = percentage >= 65; // Standard NCLEX threshold benchmark

    const timeSpentSec = exam.config.duration > 0 
      ? Math.max(1, (exam.config.duration * 60) - exam.timerSeconds) 
      : exam.elapsedSeconds;

    const resultRecord = {
      id: Date.now(),
      title: `${exam.config.mode === 'practice' ? 'Practice' : 'Simulated'} Exam (${totalQ} Qs)`,
      timestamp: Date.now(),
      totalQuestions: totalQ,
      correct: correctCount,
      wrong: wrongCount,
      blank: blankCount,
      percentage: percentage,
      isPass: isPass,
      timeSpentSeconds: timeSpentSec,
      mode: exam.config.mode,
      missedIds: missedIds,
      items: itemResults,
      categoryStats: categoryStats
    };

    state.lastResult = resultRecord;
    saveHistoryRecord(resultRecord);
    renderResultsView(resultRecord);
    switchView('results');
  }

  // --- RESULTS VIEW ---
  function renderResultsView(res) {
    $('resScorePercent').textContent = `${res.percentage}%`;
    const circle = $('resScoreCircle');
    circle.className = `score-circle ${res.isPass ? 'pass' : 'fail'}`;
    $('resScoreStatus').textContent = res.isPass ? 'PASSING STANDARD MET' : 'NEEDS ADDITIONAL STUDY';
    $('resScoreStatus').style.color = res.isPass ? 'var(--success)' : 'var(--danger)';

    $('resCorrectCount').textContent = res.correct;
    $('resWrongCount').textContent = res.wrong;
    $('resBlankCount').textContent = res.blank;

    // Time used
    const mins = Math.floor(res.timeSpentSeconds / 60);
    const secs = res.timeSpentSeconds % 60;
    $('resTimeUsed').textContent = `${mins}m ${secs}s`;

    const avgSec = Math.round(res.timeSpentSeconds / (res.totalQuestions || 1));
    $('resAvgTime').textContent = `${avgSec}s / question`;

    // Category Performance
    renderResultsCategoryBars(res.categoryStats);

    // Review List
    renderReviewItems(res.items, 'all');
  }

  function renderResultsCategoryBars(catStats) {
    const host = $('resCategoryBars');
    if (!host) return;
    const entries = Object.entries(catStats || {});
    if (entries.length === 0) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = entries.map(([cat, stat]) => {
      const pct = Math.round((stat.correct / stat.total) * 100);
      const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--primary)' : 'var(--danger)';
      return `
        <div style="margin-bottom:0.85rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700; margin-bottom:0.25rem;">
            <span>${cat}</span>
            <span>${stat.correct}/${stat.total} (${pct}%)</span>
          </div>
          <div style="height:8px; background:var(--border); border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:${color}; border-radius:999px;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderReviewItems(items, filter) {
    const host = $('reviewItemsList');
    if (!host) return;

    let filtered = items;
    if (filter === 'incorrect') {
      filtered = items.filter(it => !it.isCorrect);
    } else if (filter === 'correct') {
      filtered = items.filter(it => it.isCorrect);
    } else if (filter === 'marked') {
      filtered = items.filter(it => it.isMarked);
    }

    if (filtered.length === 0) {
      host.innerHTML = `<div class="card text-muted" style="text-align:center; padding:2rem;">No questions match this review filter.</div>`;
      return;
    }

    host.innerHTML = filtered.map(item => {
      const q = item.question;
      const statusClass = item.isCorrect ? 'correct' : item.isAnswered ? 'incorrect' : 'unanswered';
      const statusLabel = item.isCorrect ? '✓ Correct' : item.isAnswered ? '✕ Incorrect' : '○ Unanswered';
      const isSaved = state.savedIds.has(q.id);

      return `
        <div class="review-item ${statusClass}">
          <div class="review-q-header">
            <div>
              <strong>Question ${item.index} of ${items.length}</strong> · <span class="badge ${q.sourceBank === 'NCSBN Official' ? 'badge-primary' : 'badge-sata'}">${escapeHtml(q.sourceBank || 'Bank')} #${q.bankId || q.id}</span> · <span class="badge ${q.type === 'sata' ? 'badge-sata' : 'badge-primary'}">${q.type.toUpperCase()}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="font-bold ${item.isCorrect ? 'text-success' : 'text-danger'}">${statusLabel}</span>
              <button type="button" class="btn btn-sm btn-secondary bookmark-toggle" data-id="${q.id}">
                ${isSaved ? '★ Saved' : '☆ Save'}
              </button>
            </div>
          </div>
          <div class="question-stem" style="font-size:1rem; margin-bottom:1rem;">${escapeHtml(q.question)}</div>
          
          <div class="review-options-wrap">
            ${renderReviewOptions(q, item.userAnswer)}
          </div>

          ${q.answerText ? `
            <div style="background:var(--bg-subtle); border:1px solid var(--border); padding:0.85rem; border-radius:var(--radius-md); margin-top:0.75rem; font-size:0.88rem;">
              <strong>Clinical Rationale / Key Explanation:</strong><br>
              ${escapeHtml(q.answerText)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach bookmark events
    host.querySelectorAll('.bookmark-toggle').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        toggleBookmark(id);
        btn.textContent = state.savedIds.has(id) ? '★ Saved' : '☆ Save';
      };
    });
  }

  function renderReviewOptions(q, userAns) {
    if (q.type === 'numeric') {
      const correctStr = (q.correctAnswers || []).join(', ');
      return `
        <div style="font-size:0.9rem; padding:0.5rem;">
          <div>Your input: <strong>${userAns || 'None (Unanswered)'}</strong></div>
          <div class="text-success font-bold">Target Answer: ${correctStr}</div>
        </div>
      `;
    }

    return (q.options || []).map(opt => {
      const isSata = q.type === 'sata';
      const isChosen = isSata 
        ? Array.isArray(userAns) && userAns.includes(opt.label)
        : userAns === opt.label;
      const isKey = (q.correctAnswers || []).includes(opt.label);

      let cardClass = 'review-option';
      let icon = '○';

      if (isKey) {
        cardClass += ' is-correct';
        icon = '✓';
      } else if (isChosen && !isKey) {
        cardClass += ' user-selected-wrong';
        icon = '✕';
      }

      return `
        <div class="${cardClass}">
          <span>${icon}</span>
          <strong>Option ${opt.label}:</strong>
          <span>${escapeHtml(opt.text)}</span>
          ${isChosen ? '<span class="badge badge-primary" style="margin-left:auto;">Your Choice</span>' : ''}
        </div>
      `;
    }).join('');
  }

  // --- CSV EXPORT ---
  function exportResultsCSV() {
    if (!state.lastResult || !state.lastResult.items) return;
    const rows = [
      ["Exam Position", "Source Bank", "Bank Question ID", "Category", "Question Type", "Question Stem", "Your Answer", "Correct Answer", "Result", "Rationale"]
    ];

    state.lastResult.items.forEach(it => {
      const q = it.question;
      const userAnsStr = Array.isArray(it.userAnswer) ? it.userAnswer.join(';') : (it.userAnswer || 'Unanswered');
      const correctStr = (q.correctAnswers || []).join(';');
      const resultStr = it.isCorrect ? 'Correct' : it.isAnswered ? 'Incorrect' : 'Unanswered';

      rows.push([
        it.index,
        q.sourceBank || 'Comprehensive NCLEX',
        q.bankId || q.id,
        q.category || '',
        q.type || '',
        q.question || '',
        userAnsStr,
        correctStr,
        resultStr,
        q.answerText || ''
      ]);
    });

    const csvContent = rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NCLEX_Results_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // --- QUESTION BANK EXPLORER & PAGINATION ---
  function getFilteredExplorerQuestions() {
    let items = state.bank.filter(q => q.type !== 'unsupported');

    // 0. Bank filter
    if (state.explorer.selectedBank && state.explorer.selectedBank !== 'all') {
      items = items.filter(q => q.sourceBank === state.explorer.selectedBank);
    }

    // 1. Search term
    const term = state.explorer.searchTerm.trim().toLowerCase();
    if (term) {
      items = items.filter(q => 
        (q.question && q.question.toLowerCase().includes(term)) ||
        (q.answerText && q.answerText.toLowerCase().includes(term)) ||
        (q.options && q.options.some(o => o.text.toLowerCase().includes(term)))
      );
    }

    // 2. Category filter
    if (state.explorer.selectedCategory !== 'all') {
      const decodedCat = decodeURIComponent(state.explorer.selectedCategory);
      items = items.filter(q => q.category === decodedCat);
    }

    // 3. Type filter
    if (state.explorer.selectedType !== 'all') {
      items = items.filter(q => q.type === state.explorer.selectedType);
    }

    // 4. Saved filter
    if (state.explorer.onlySaved) {
      items = items.filter(q => state.savedIds.has(q.id));
    }

    return items;
  }

  function goToExplorerPage(targetPage) {
    const items = getFilteredExplorerQuestions();
    const pageSize = state.explorer.pageSize || 20;
    const totalPages = Math.ceil(items.length / pageSize) || 1;
    let page = parseInt(targetPage, 10);
    if (isNaN(page)) return;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    state.explorer.page = page;
    renderExplorer();

    // Smooth scroll to top of Explorer question container
    const navBar = document.querySelector('.explorer-nav-bar') || $('explorerQuestionsList');
    if (navBar) {
      navBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderPaginationButtons(currentPage, totalPages) {
    if (totalPages <= 1) return '';

    let pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) {
        start = 2;
        end = 4;
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages.map(p => {
      if (p === '...') {
        return `<span class="page-ellipsis">…</span>`;
      }
      const isActive = p === currentPage;
      return `<button type="button" class="page-num-btn ${isActive ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }).join('');
  }

  function renderExplorer() {
    const qList = $('explorerQuestionsList');
    if (!qList) return;

    const items = getFilteredExplorerQuestions();
    const totalItems = items.length;
    const pageSize = state.explorer.pageSize || 20;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    // Guard page bounds
    state.explorer.page = Math.max(1, Math.min(state.explorer.page, totalPages));
    const currentPage = state.explorer.page;

    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = items.slice(startIdx, startIdx + pageSize);
    const endIdx = Math.min(startIdx + pageItems.length, totalItems);

    // Update match count & total pages indicators
    $('explorerMatchCount').textContent = `${totalItems.toLocaleString()} matching question${totalItems === 1 ? '' : 's'}`;
    $('explorerPageIndicator').textContent = `Page ${currentPage.toLocaleString()} of ${totalPages.toLocaleString()}`;
    $$('.totalPagesSpan').forEach(el => el.textContent = totalPages.toLocaleString());

    // Update Go To Page Inputs
    const inputTop = $('explorerGoToPageTop');
    if (inputTop) {
      inputTop.value = currentPage;
      inputTop.max = totalPages;
    }
    const inputBottom = $('explorerGoToPageBottom');
    if (inputBottom) {
      inputBottom.value = currentPage;
      inputBottom.max = totalPages;
    }

    // Update page size select
    const sizeSelect = $('explorerPageSizeSelect');
    if (sizeSelect && sizeSelect.value !== String(pageSize)) {
      sizeSelect.value = String(pageSize);
    }

    // Update range summary
    const rangeSummary = $('explorerPageRangeSummary');
    if (rangeSummary) {
      rangeSummary.textContent = totalItems === 0 
        ? 'No matching questions found' 
        : `Showing questions ${(startIdx + 1).toLocaleString()} – ${endIdx.toLocaleString()} of ${totalItems.toLocaleString()} (Page ${currentPage.toLocaleString()} of ${totalPages.toLocaleString()})`;
    }

    // Update Page Number Buttons (Top and Bottom)
    const btnHtml = renderPaginationButtons(currentPage, totalPages);
    const btnsBottom = $('explorerPageNumberButtons');
    if (btnsBottom) {
      btnsBottom.innerHTML = btnHtml;
      btnsBottom.querySelectorAll('.page-num-btn').forEach(btn => {
        btn.onclick = () => goToExplorerPage(btn.dataset.page);
      });
    }

    const btnsTop = $('explorerPageButtonsTop');
    if (btnsTop) {
      btnsTop.innerHTML = btnHtml;
      btnsTop.querySelectorAll('.page-num-btn').forEach(btn => {
        btn.onclick = () => goToExplorerPage(btn.dataset.page);
      });
    }

    // Disable/Enable Nav buttons
    const isFirst = currentPage <= 1;
    const isLast = currentPage >= totalPages;

    const btnFirst = $('btnExplorerFirst');
    if (btnFirst) btnFirst.disabled = isFirst;
    const btnPrev = $('btnExplorerPrev');
    if (btnPrev) btnPrev.disabled = isFirst;
    const btnNext = $('btnExplorerNext');
    if (btnNext) btnNext.disabled = isLast;
    const btnLast = $('btnExplorerLast');
    if (btnLast) btnLast.disabled = isLast;

    const btnBack10 = $('btnJumpBack10');
    if (btnBack10) btnBack10.disabled = currentPage <= 10;
    const btnBack5 = $('btnJumpBack5');
    if (btnBack5) btnBack5.disabled = currentPage <= 5;
    const btnFwd5 = $('btnJumpFwd5');
    if (btnFwd5) btnFwd5.disabled = currentPage + 5 > totalPages;
    const btnFwd10 = $('btnJumpFwd10');
    if (btnFwd10) btnFwd10.disabled = currentPage + 10 > totalPages;

    // Render Question Cards
    if (pageItems.length === 0) {
      qList.innerHTML = `<div class="card text-muted" style="text-align:center; padding:2.5rem;">No questions match your current search and filter criteria.</div>`;
      return;
    }

    qList.innerHTML = pageItems.map(q => {
      const isSaved = state.savedIds.has(q.id);
      return `
        <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span class="badge ${q.sourceBank === 'NCSBN Official' ? 'badge-primary' : 'badge-sata'}">${escapeHtml(q.sourceBank || 'Bank')} #${q.bankId || q.id}</span>
              <span class="badge ${q.type === 'sata' ? 'badge-sata' : 'badge-primary'}">${q.type.toUpperCase()}</span>
              <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(q.category || '')}</span>
            </div>
            <button type="button" class="btn btn-sm btn-secondary bookmark-toggle" data-id="${q.id}">
              ${isSaved ? '★ Saved' : '☆ Save'}
            </button>
          </div>
          <div class="question-stem" style="font-size:1.05rem; margin-bottom:1rem;">${escapeHtml(q.question)}</div>
          
          <div class="options-grid" style="margin-bottom:1rem;">
            ${(q.options || []).map(opt => `
              <div class="option-card" style="cursor:default; padding:0.6rem 0.85rem;">
                <div class="option-label" style="width:24px; height:24px; font-size:0.75rem;">${opt.label}</div>
                <div class="option-text" style="font-size:0.9rem;">${escapeHtml(opt.text)}</div>
              </div>
            `).join('')}
          </div>

          <button type="button" class="btn btn-sm btn-secondary reveal-ans-btn" style="margin-bottom:0.5rem;">
            👁 Reveal Answer & Rationale
          </button>
          <div class="explorer-answer-box hidden" style="background:var(--success-bg); border:1px solid var(--success-border); padding:0.85rem; border-radius:var(--radius-md); font-size:0.9rem; margin-top:0.5rem;">
            <div style="color:var(--success); font-weight:800; margin-bottom:0.35rem;">Correct Answer: ${(q.correctAnswers || []).join(', ')}</div>
            ${q.answerText ? `<div><strong>Rationale:</strong> ${escapeHtml(q.answerText)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach button listeners
    qList.querySelectorAll('.reveal-ans-btn').forEach(btn => {
      btn.onclick = () => {
        const box = btn.nextElementSibling;
        box.classList.toggle('hidden');
        btn.textContent = box.classList.contains('hidden') ? '👁 Reveal Answer & Rationale' : 'Hide Answer';
      };
    });

    qList.querySelectorAll('.bookmark-toggle').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        toggleBookmark(id);
        btn.textContent = state.savedIds.has(id) ? '★ Saved' : '☆ Save';
        $('navSavedBadge').textContent = state.savedIds.size;
      };
    });
  }

  // --- SAVED QUESTIONS VIEW ---
  function renderSavedQuestions() {
    const host = $('savedQuestionsList');
    if (!host) return;
    const savedList = state.bank.filter(q => state.savedIds.has(q.id));

    $('savedCountBanner').textContent = `${savedList.length} bookmarked question${savedList.length === 1 ? '' : 's'}`;

    if (savedList.length === 0) {
      host.innerHTML = `<div class="card text-muted" style="text-align:center; padding:3rem;">You haven't bookmarked any questions yet. Use the star icon during exams or in the Question Bank Explorer to save challenging questions!</div>`;
      $('btnStartSavedQuiz').disabled = true;
      return;
    }
    $('btnStartSavedQuiz').disabled = false;

    host.innerHTML = savedList.map(q => `
      <div class="card" style="padding:1.25rem; margin-bottom:1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <div>
            <strong>Bank #${q.id}</strong> · <span class="badge ${q.type === 'sata' ? 'badge-sata' : 'badge-primary'}">${q.type.toUpperCase()}</span> · <span style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(q.category || '')}</span>
          </div>
          <button type="button" class="btn btn-sm btn-danger remove-saved-btn" data-id="${q.id}">Remove</button>
        </div>
        <div class="question-stem" style="font-size:1rem; margin-bottom:0.75rem;">${escapeHtml(q.question)}</div>
        ${q.answerText ? `<div style="background:var(--bg-subtle); padding:0.75rem; border-radius:var(--radius-md); font-size:0.85rem; border:1px solid var(--border);"><strong>Key Explanation:</strong> ${escapeHtml(q.answerText)}</div>` : ''}
      </div>
    `).join('');

    host.querySelectorAll('.remove-saved-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        toggleBookmark(id);
        renderSavedQuestions();
      };
    });
  }

  function toggleBookmark(id) {
    if (state.savedIds.has(id)) {
      state.savedIds.delete(id);
    } else {
      state.savedIds.add(id);
    }
    saveBookmarks();
    $('navSavedBadge').textContent = state.savedIds.size;
    $('dashBookmarksCount').textContent = state.savedIds.size.toLocaleString();
  }

  // --- ANALYTICS VIEW ---
  function renderAnalyticsView() {
    const list = $('analyticsHistoryTableBody');
    if (!list) return;

    if (state.history.length === 0) {
      list.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:2rem;">No test history recorded yet. Complete an exam to view detailed analytics.</td></tr>`;
      return;
    }

    list.innerHTML = state.history.map(h => {
      const dateStr = new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const mins = Math.floor(h.timeSpentSeconds / 60);
      const secs = h.timeSpentSeconds % 60;
      return `
        <tr>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border); font-weight:600;">${dateStr}</td>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border);">${h.title}</td>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border); font-weight:700;">${h.totalQuestions}</td>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border);">${mins}m ${secs}s</td>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border); font-weight:800; color:${h.isPass ? 'var(--success)' : 'var(--danger)'};">${h.percentage}%</td>
          <td style="padding:0.75rem; border-bottom:1px solid var(--border); font-weight:800;">
            <span class="badge ${h.isPass ? 'badge-primary' : 'badge-sata'}">${h.isPass ? 'PASS' : 'STUDY'}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- NORMAL LAB VALUES MODAL ---
  function renderLabValuesTable(filterTerm = '') {
    const container = $('labValuesModalBody');
    if (!container) return;

    const term = filterTerm.trim().toLowerCase();
    container.innerHTML = state.labValues.map(panel => {
      const matchedValues = panel.values.filter(v => 
        !term || 
        v.name.toLowerCase().includes(term) || 
        v.range.toLowerCase().includes(term) || 
        (v.notes && v.notes.toLowerCase().includes(term))
      );

      if (matchedValues.length === 0) return '';

      return `
        <div style="margin-bottom:1.5rem;">
          <div class="labs-category-heading">${panel.category}</div>
          <table class="labs-table">
            <thead>
              <tr>
                <th style="width:28%;">Laboratory Test</th>
                <th style="width:32%;">Normal Reference Range</th>
                <th style="width:40%;">Clinical NCLEX Significance</th>
              </tr>
            </thead>
            <tbody>
              ${matchedValues.map(v => `
                <tr>
                  <td style="font-weight:700; color:var(--text-main);">${v.name}</td>
                  <td style="font-family:var(--font-mono); font-weight:600; color:var(--primary);">${v.range}</td>
                  <td style="color:var(--text-muted); font-size:0.84rem;">${v.notes || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  }

  // --- CALCULATOR IMPLEMENTATION ---
  let calcMemory = 0;
  let calcCurrent = '0';
  let calcPendingOp = null;
  let calcResetNext = false;

  function handleCalcInput(val) {
    const disp = $('calcDisplay');
    if (!disp) return;

    if (!isNaN(val) || val === '.') {
      if (calcResetNext) {
        calcCurrent = val === '.' ? '0.' : val;
        calcResetNext = false;
      } else {
        if (val === '.' && calcCurrent.includes('.')) return;
        calcCurrent = calcCurrent === '0' && val !== '.' ? val : calcCurrent + val;
      }
    } else if (val === 'C') {
      calcCurrent = '0';
      calcMemory = 0;
      calcPendingOp = null;
      calcResetNext = false;
    } else if (val === 'CE') {
      calcCurrent = '0';
    } else if (val === '+/-') {
      calcCurrent = String(-parseFloat(calcCurrent));
    } else if (val === 'sqrt') {
      const num = parseFloat(calcCurrent);
      if (num >= 0) calcCurrent = String(Math.sqrt(num));
    } else if (val === '%') {
      calcCurrent = String(parseFloat(calcCurrent) / 100);
    } else if (['+', '-', '*', '/'].includes(val)) {
      if (calcPendingOp) executeCalc();
      calcMemory = parseFloat(calcCurrent);
      calcPendingOp = val;
      calcResetNext = true;
    } else if (val === '=') {
      if (calcPendingOp) {
        executeCalc();
        calcPendingOp = null;
        calcResetNext = true;
      }
    }
    disp.textContent = calcCurrent;
  }

  function executeCalc() {
    const cur = parseFloat(calcCurrent);
    if (calcPendingOp === '+') calcCurrent = String(calcMemory + cur);
    if (calcPendingOp === '-') calcCurrent = String(calcMemory - cur);
    if (calcPendingOp === '*') calcCurrent = String(calcMemory * cur);
    if (calcPendingOp === '/') calcCurrent = cur === 0 ? 'Error' : String(calcMemory / cur);
  }

  // --- EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    // Nav bar tabs
    $$('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });

    $('brandLogo').addEventListener('click', () => switchView('dashboard'));

    // Theme toggles
    $$('.theme-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.preferences.theme = btn.dataset.theme;
        applyPreferences();
      });
    });

    // Font size toggles
    $$('.font-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.preferences.fontSize = btn.dataset.size;
        applyPreferences();
      });
    });

    // Header Tools (Calculator & Labs)
    $('btnOpenCalculator').addEventListener('click', () => $('modalCalculator').classList.remove('hidden'));
    $('btnCloseCalculator').addEventListener('click', () => $('modalCalculator').classList.add('hidden'));

    $('btnOpenLabValues').addEventListener('click', () => $('modalLabValues').classList.remove('hidden'));
    $('btnCloseLabValues').addEventListener('click', () => $('modalLabValues').classList.add('hidden'));

    $('labSearchInput').addEventListener('input', (e) => renderLabValuesTable(e.target.value));

    // Calculator buttons
    $$('.calc-btn').forEach(btn => {
      btn.addEventListener('click', () => handleCalcInput(btn.dataset.val));
    });

    // Quick Start Cards on Dashboard
    const btnCram = $('btnQuickCram');
    if (btnCram) {
      btnCram.onclick = () => {
        startExamWithConfig({
          count: '50',
          duration: '60',
          order: 'random',
          mode: 'practice',
          questionType: 'all',
          categories: ['all'],
          bankSource: 'NCLEX Exam Cram',
          pool: 'bank'
        });
      };
    }

    const btnNCSBN = $('btnQuickNCSBN');
    if (btnNCSBN) {
      btnNCSBN.onclick = () => {
        startExamWithConfig({
          count: '50',
          duration: '90',
          order: 'random',
          mode: 'practice',
          questionType: 'all',
          categories: ['all'],
          bankSource: 'NCSBN Official',
          pool: 'bank'
        });
      };
    }

    const btnB4 = $('btnQuickBank4');
    if (btnB4) {
      btnB4.onclick = () => {
        startExamWithConfig({
          count: '50',
          duration: '60',
          order: 'random',
          mode: 'practice',
          questionType: 'all',
          categories: ['all'],
          bankSource: 'NCLEX Practice Bank 4',
          pool: 'bank'
        });
      };
    }

    const btnB5 = $('btnQuickBank5');
    if (btnB5) {
      btnB5.onclick = () => {
        startExamWithConfig({
          count: '50',
          duration: '60',
          order: 'random',
          mode: 'practice',
          questionType: 'all',
          categories: ['all'],
          bankSource: 'NCLEX Practice Bank 5',
          pool: 'bank'
        });
      };
    }

    const btnH6 = $('btnQuickHESI6');
    if (btnH6) {
      btnH6.onclick = () => {
        startExamWithConfig({
          count: '50',
          duration: '60',
          order: 'random',
          mode: 'practice',
          questionType: 'all',
          categories: ['all'],
          bankSource: 'HESI 1200 Bank 6',
          pool: 'bank'
        });
      };
    }

    $('btnQuickCAT').onclick = () => {
      startExamWithConfig({
        count: '85',
        duration: '180',
        order: 'random',
        mode: 'exam',
        questionType: 'all',
        categories: ['all'],
        pool: 'bank'
      });
    };

    $('btnQuickPractice').onclick = () => {
      startExamWithConfig({
        count: '25',
        duration: '0',
        order: 'random',
        mode: 'practice',
        questionType: 'all',
        categories: ['all'],
        pool: 'bank'
      });
    };

    $('btnQuickSATA').onclick = () => {
      startExamWithConfig({
        count: '50',
        duration: '60',
        order: 'random',
        mode: 'practice',
        questionType: 'sata',
        categories: ['all'],
        pool: 'bank'
      });
    };

    $('btnQuickMath').onclick = () => {
      startExamWithConfig({
        count: '40',
        duration: '60',
        order: 'random',
        mode: 'practice',
        questionType: 'numeric',
        categories: ['all'],
        pool: 'bank'
      });
    };

    $('btnQuickWeakness').onclick = () => {
      startExamWithConfig({
        count: '50',
        duration: '0',
        order: 'random',
        mode: 'practice',
        questionType: 'all',
        categories: ['all'],
        pool: 'missed'
      });
    };

    // Exam Setup Form Submit
    $('btnStartCustomExam').onclick = () => {
      const bankSource = $('setupBankSourceSelect') ? $('setupBankSourceSelect').value : 'all';
      const count = $('setupCountSelect').value;
      const duration = $('setupDurationSelect').value;
      const order = $('setupOrderSelect').value;
      const mode = $('setupModeSelect').value;
      const questionType = $('setupTypeSelect').value;
      const pool = $('setupPoolSelect').value;

      const checkedCategories = Array.from(document.querySelectorAll('input[name="setupCategory"]:checked'))
        .map(cb => decodeURIComponent(cb.value));

      startExamWithConfig({
        bankSource,
        count,
        duration,
        order,
        mode,
        questionType,
        pool,
        categories: checkedCategories.length > 0 ? checkedCategories : ['all']
      });
    };

    // Category select all / deselect all
    $('btnSelectAllCats').onclick = () => {
      document.querySelectorAll('input[name="setupCategory"]').forEach(cb => cb.checked = true);
    };
    $('btnDeselectAllCats').onclick = () => {
      document.querySelectorAll('input[name="setupCategory"]').forEach(cb => cb.checked = false);
    };

    // Active Exam Navigation
    $('btnPrevQuestion').onclick = () => {
      if (state.exam.currentIndex > 0) {
        state.exam.currentIndex--;
        renderCurrentQuestion();
      }
    };

    $('btnNextQuestion').onclick = () => {
      if (state.exam.currentIndex < state.exam.questions.length - 1) {
        state.exam.currentIndex++;
        renderCurrentQuestion();
      }
    };

    $('btnMarkReview').onclick = () => {
      const idx = state.exam.currentIndex;
      if (state.exam.marked.has(idx)) {
        state.exam.marked.delete(idx);
      } else {
        state.exam.marked.add(idx);
      }
      renderCurrentQuestion();
      renderQuestionPalette();
    };

    $('btnSubmitExam').onclick = confirmSubmitExam;

    // Toggle Palette Drawer
    $('btnTogglePalette').onclick = () => {
      $('examPaletteDrawer').classList.toggle('hidden');
    };

    // Results Actions
    $('btnDownloadCSV').onclick = exportResultsCSV;
    $('btnRetryExam').onclick = () => switchView('setup');
    $('btnRetestMissed').onclick = () => {
      if (!state.lastResult || !state.lastResult.missedIds || state.lastResult.missedIds.length === 0) {
        alert('Great job! You had 0 missed questions in this test session.');
        return;
      }
      startExamWithConfig({
        count: 'all',
        duration: '0',
        order: 'random',
        mode: 'practice',
        questionType: 'all',
        categories: ['all'],
        pool: 'missed'
      });
    };

    // Review filters
    $$('.review-filter-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.review-filter-btn').forEach(b => b.classList.remove('btn-primary'));
        btn.classList.add('btn-primary');
        if (state.lastResult) {
          renderReviewItems(state.lastResult.items, btn.dataset.filter);
        }
      };
    });

    // Explorer Search & Filters
    $('explorerSearchInput').oninput = (e) => {
      state.explorer.searchTerm = e.target.value;
      state.explorer.page = 1;
      renderExplorer();
    };

    const expBankFilter = $('explorerBankSourceFilter');
    if (expBankFilter) {
      expBankFilter.onchange = (e) => {
        state.explorer.selectedBank = e.target.value;
        state.explorer.page = 1;
        renderExplorer();
      };
    }

    $('explorerCategoryFilter').onchange = (e) => {
      state.explorer.selectedCategory = e.target.value;
      state.explorer.page = 1;
      renderExplorer();
    };

    $('explorerTypeFilter').onchange = (e) => {
      state.explorer.selectedType = e.target.value;
      state.explorer.page = 1;
      renderExplorer();
    };

    // Explorer Go To Page Top & Bottom
    const handleGoToPage = (inputId) => {
      const el = $(inputId);
      if (!el) return;
      const target = parseInt(el.value, 10);
      if (!isNaN(target)) goToExplorerPage(target);
    };

    const btnGoTop = $('btnGoToPageTop');
    if (btnGoTop) btnGoTop.onclick = () => handleGoToPage('explorerGoToPageTop');

    const inputGoTop = $('explorerGoToPageTop');
    if (inputGoTop) {
      inputGoTop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGoToPage('explorerGoToPageTop');
      });
    }

    const btnGoBottom = $('btnGoToPageBottom');
    if (btnGoBottom) btnGoBottom.onclick = () => handleGoToPage('explorerGoToPageBottom');

    const inputGoBottom = $('explorerGoToPageBottom');
    if (inputGoBottom) {
      inputGoBottom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGoToPage('explorerGoToPageBottom');
      });
    }

    // Page Size Selector
    const sizeSelect = $('explorerPageSizeSelect');
    if (sizeSelect) {
      sizeSelect.onchange = (e) => {
        state.explorer.pageSize = parseInt(e.target.value, 10) || 20;
        state.explorer.page = 1;
        renderExplorer();
      };
    }

    // First / Prev / Next / Last navigation
    const btnExpFirst = $('btnExplorerFirst');
    if (btnExpFirst) btnExpFirst.onclick = () => goToExplorerPage(1);

    const btnExpPrev = $('btnExplorerPrev');
    if (btnExpPrev) btnExpPrev.onclick = () => goToExplorerPage(state.explorer.page - 1);

    const btnExpNext = $('btnExplorerNext');
    if (btnExpNext) btnExpNext.onclick = () => goToExplorerPage(state.explorer.page + 1);

    const btnExpLast = $('btnExplorerLast');
    if (btnExpLast) btnExpLast.onclick = () => {
      const totalPages = Math.ceil(getFilteredExplorerQuestions().length / (state.explorer.pageSize || 20)) || 1;
      goToExplorerPage(totalPages);
    };

    // Quick Jumps -10, -5, +5, +10
    const btnJBack10 = $('btnJumpBack10');
    if (btnJBack10) btnJBack10.onclick = () => goToExplorerPage(state.explorer.page - 10);

    const btnJBack5 = $('btnJumpBack5');
    if (btnJBack5) btnJBack5.onclick = () => goToExplorerPage(state.explorer.page - 5);

    const btnJFwd5 = $('btnJumpFwd5');
    if (btnJFwd5) btnJFwd5.onclick = () => goToExplorerPage(state.explorer.page + 5);

    const btnJFwd10 = $('btnJumpFwd10');
    if (btnJFwd10) btnJFwd10.onclick = () => goToExplorerPage(state.explorer.page + 10);

    // Saved Questions quiz launcher
    $('btnStartSavedQuiz').onclick = () => {
      if (state.savedIds.size === 0) return;
      startExamWithConfig({
        count: 'all',
        duration: '0',
        order: 'random',
        mode: 'practice',
        questionType: 'all',
        categories: ['all'],
        pool: 'saved'
      });
    };

    // Clear history
    $('btnClearHistory').onclick = () => {
      if (confirm('Are you sure you want to clear your test history? This action cannot be undone.')) {
        state.history = [];
        localStorage.removeItem('nclex_history');
        renderAnalyticsView();
        updateDashboardStats();
      }
    };

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't intercept when inside inputs or modals
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (state.currentView !== 'exam' || !state.exam.active || state.exam.isSubmitted) return;

      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
        $('btnNextQuestion').click();
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'p') {
        $('btnPrevQuestion').click();
      } else if (e.key.toLowerCase() === 'm') {
        $('btnMarkReview').click();
      } else if (e.key.toLowerCase() === 'c') {
        $('btnOpenCalculator').click();
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const q = state.exam.questions[state.exam.currentIndex];
        if (q && q.options && q.options.length >= Number(e.key)) {
          selectOption(q, e.key);
        }
      }
    });
  }

  // Regex & HTML safety utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Launch on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
