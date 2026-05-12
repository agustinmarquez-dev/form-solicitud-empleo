/**
 * ATS Gastronómico — app.js
 * ─────────────────────────────────────────────────────────────────
 * Sistema de reclutamiento invisible para candidatos.
 * Sabores Express & Hamburguesas Extremas
 *
 * Arquitectura: Vanilla JS puro | Sin dependencias
 * Base de datos: Supabase (REST API)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ══════════════════════════════════════════════════
   § 1. CONFIGURACIÓN
══════════════════════════════════════════════════ */

const CONFIG = {
  /** Supabase */
  supabaseUrl:    'https://syogghrwhkwdrtlcxlqp.supabase.co',
  supabaseKey:    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5b2dnaHJ3aGt3ZHJ0bGN4bHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTI2NzUsImV4cCI6MjA5NDE4ODY3NX0.Xcd5Fh3G8oo08WCaf9WcaMaFMCtf_tJIHHSDq0o0_vE',
  supabaseTable:  'postulaciones',

  /** Claves de localStorage */
  storageKey: 'ats_gastro_v2',
  emailsKey:  'ats_emails_v2',

  /** Pasos del formulario (el de gracias no cuenta) */
  totalSteps: 4,

  /** Nombres para el indicador de progreso */
  stepNames: ['Datos personales', 'Disponibilidad', 'Experiencia', 'Autoevaluación'],

  /** Milisegundos hasta que el borrador expira (24 h) */
  draftTTL: 86_400_000
};


/* ══════════════════════════════════════════════════
   § 2. SCORING
══════════════════════════════════════════════════ */

const SCORE_MAP = {
  dispHoraria:  { 'full-time': 30, 'part-tarde': 25, 'part-manana': 15, 'solo-fds': 10 },
  dispFds:      { 'always': 20, 'sometimes': 10, 'never': 0 },
  dispFeriados: { 'yes': 10, 'no': 0 },
  dispInicio:   { 'now': 10, '2weeks': 5, '1month': 0 },
  expGastro:    { '+2': 20, '1-2': 15, 'lt1': 8, '0': 0 },
  expCaja:      { 'yes': 5, 'no': 0 }
};

/** Puntos del quiz por distancia a la respuesta ideal */
const QUIZ_PTS = [10, 5, 2, 0];

/**
 * Umbrales de perfil (total sobre 215 puntos máximos).
 * Máximos: Disp=70 | Exp=25 | Quiz=120
 */
const PROFILES = [
  { min: 162, code: 'A', label: 'Prioritario' },
  { min: 121, code: 'B', label: 'Considerar'  },
  { min:  75, code: 'C', label: 'Guardar'      },
  { min:   0, code: 'D', label: 'No aplica'    }
];


/* ══════════════════════════════════════════════════
   § 3. PREGUNTAS DEL QUIZ
══════════════════════════════════════════════════ */

const QUIZ = [
  { q: 'Me resulta sencillo iniciar una conversación con personas que no conozco.',                                    correct: 4 },
  { q: 'Sigo rigurosamente los pasos establecidos en cada tarea para asegurar que el resultado sea perfecto.',         correct: 3 },
  { q: 'Creo que mi deber principal es cumplir con las normas del local, más allá de las expectativas del cliente.',   correct: 3 },
  { q: 'Considero que es más importante defender el punto de vista correcto que evitar una discusión.',                correct: 1 },
  { q: 'Prefiero resolver las situaciones sobre la marcha, sin depender tanto de una planificación estricta.',         correct: 2 },
  { q: 'Me genera entusiasmo rotar por diferentes puestos y aprender funciones que desconozco.',                       correct: 3 },
  { q: 'Me esfuerzo por comprender la situación del cliente y trato de que se retire satisfecho, incluso si es difícil.', correct: 4 },
  { q: 'Prefiero perfeccionarme en una sola tarea específica hasta lograr dominarla por completo.',                    correct: 2 },
  { q: 'Tengo facilidad para mantener la calma cuando el ritmo de trabajo se vuelve muy intenso.',                    correct: 3 },
  { q: 'Soy una persona sumamente organizada y cumplo siempre mis horarios.',                                          correct: 4 },
  { q: 'Prefiero trabajar en ambientes donde las tareas sean predecibles y no cambien de un momento a otro.',          correct: 2 },
  { q: 'A veces soy descuidado con los detalles y me cuesta seguir una tarea repetitiva por mucho tiempo.',            correct: 1 }
];

const QUIZ_OPTIONS = [
  { value: 1, label: 'Completamente\nen desacuerdo', shape: '▲', mod: '--1' },
  { value: 2, label: 'En desacuerdo',                shape: '◆', mod: '--2' },
  { value: 3, label: 'De acuerdo',                   shape: '●', mod: '--3' },
  { value: 4, label: 'Completamente\nde acuerdo',    shape: '■', mod: '--4' }
];


/* ══════════════════════════════════════════════════
   § 4. ESTADO DE LA APLICACIÓN
══════════════════════════════════════════════════ */

const state = {
  step:        1,
  inputs:      {},
  selections:  {},
  puestos:     [],
  quizIndex:   0,
  quizAnswers: [],
  quizScore:   0,
  sheetsUrl:   ''
};


/* ══════════════════════════════════════════════════
   § 5. ACCESOS AL DOM
══════════════════════════════════════════════════ */

const el = (id) => document.getElementById(id);

const DOM = {
  app:              () => el('app'),
  formMain:         () => el('formMain'),
  progressFill:     () => el('progressFill'),
  stepIndCur:       () => el('stepIndCur'),
  stepIndName:      () => el('stepIndName'),
  btnBack:          () => el('btnBack'),
  btnNext:          () => el('btnNext'),
  formNav:          () => el('formNav'),
  sheetsInput:      () => el('sheetsUrl'),
  exclWarn:         () => el('exclWarn'),
  quizProgressFill: () => el('quizProgressFill'),
  quizCounter:      () => el('quizCounter'),
  quizQuestion:     () => el('quizQuestion'),
  quizAnswers:      () => el('quizAnswers'),
  quizFooter:       () => el('quizFooter'),
  btnQuizNext:      () => el('btnQuizNext'),
  btnExit:          () => el('btnExit')
};


/* ══════════════════════════════════════════════════
   § 6. LOCALSTORAGE — borrador automático
══════════════════════════════════════════════════ */

function saveState() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      ...state,
      savedAt: Date.now()
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return false;

    const saved = JSON.parse(raw);
    if (Date.now() - (saved.savedAt || 0) > CONFIG.draftTTL) {
      localStorage.removeItem(CONFIG.storageKey);
      return false;
    }

    Object.assign(state, saved);
    return true;
  } catch (_) {
    return false;
  }
}

function clearState() {
  try { localStorage.removeItem(CONFIG.storageKey); } catch (_) {}
}


/* ══════════════════════════════════════════════════
   § 7. PREVENCIÓN DE REENVÍOS (email único)
══════════════════════════════════════════════════ */

function getSubmittedEmails() {
  try { return JSON.parse(localStorage.getItem(CONFIG.emailsKey) || '[]'); }
  catch (_) { return []; }
}

function isEmailKnown(email) {
  return getSubmittedEmails().includes(email.toLowerCase().trim());
}

function registerEmail(email) {
  try {
    const list = getSubmittedEmails();
    list.push(email.toLowerCase().trim());
    localStorage.setItem(CONFIG.emailsKey, JSON.stringify(list));
  } catch (_) {}
}


/* ══════════════════════════════════════════════════
   § 8. NAVEGACIÓN ENTRE PASOS
══════════════════════════════════════════════════ */

function goToStep(targetStep) {
  const prevEl = el('step-' + state.step);
  if (prevEl) prevEl.classList.remove('is-active');

  const nextEl = el('step-' + targetStep);
  if (!nextEl) return;
  nextEl.classList.add('is-active');

  state.step = targetStep;

  const main = DOM.formMain();
  if (main) main.scrollTop = 0;

  updateProgressUI();
  updateNavUI();
  saveState();
}

function handleNext() {
  if (!validateCurrentStep()) return;

  if (state.step < CONFIG.totalSteps) {
    goToStep(state.step + 1);
    if (state.step === 4) startQuiz();
  }
}

function handleBack() {
  if (state.step > 1 && state.step <= CONFIG.totalSteps) {
    goToStep(state.step - 1);
  }
}


/* ══════════════════════════════════════════════════
   § 9. VALIDACIÓN POR PASO
══════════════════════════════════════════════════ */

function validateCurrentStep() {
  switch (state.step) {
    case 1: return validateStep1();
    case 2: return validateOptGroups(['dispHoraria', 'dispFds', 'dispFeriados', 'dispInicio'], 2);
    case 3: return validateOptGroups(['expGastro', 'expCaja'], 3);
    default: return true;
  }
}

function validateStep1() {
  const textFields = ['firstName', 'lastName', 'age', 'phone', 'email', 'zone'];

  for (const id of textFields) {
    const input = el(id);
    if (!input) continue;
    if (!input.value.trim()) {
      input.classList.add('is-error');
      input.focus();
      showStepError(1, 'Por favor completá todos los campos obligatorios.');
      return false;
    }
  }

  const emailEl = el('email');
  if (emailEl && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
    emailEl.classList.add('is-error');
    emailEl.focus();
    showStepError(1, 'Ingresá un email válido.');
    return false;
  }

  if (state.puestos.length === 0) {
    showStepError(1, 'Seleccioná al menos un puesto de interés.');
    return false;
  }

  const reqGroups = ['dispNoche', 'cursoMani', 'antecedentes'];
  for (const g of reqGroups) {
    if (!state.selections[g]) {
      showStepError(1, 'Respondé todas las preguntas de requisitos.');
      return false;
    }
  }

  if (state.selections.cursoMani?.value === 'no') {
    showStepError(1, 'El Curso de Manipulación de Alimentos es un requisito excluyente.');
    return false;
  }

  return true;
}

function validateOptGroups(groups, step) {
  for (const g of groups) {
    if (!state.selections[g]) {
      showStepError(step, 'Respondé todas las preguntas antes de continuar.');
      return false;
    }
  }
  return true;
}

function showStepError(step, msg) {
  const stepEl = el('step-' + step);
  if (!stepEl) return;

  let errEl = stepEl.querySelector('.step-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'step-error';
    const header = stepEl.querySelector('.step-header');
    header
      ? header.insertAdjacentElement('afterend', errEl)
      : stepEl.prepend(errEl);
  }

  errEl.textContent = msg;
  errEl.classList.add('is-visible');

  clearTimeout(errEl._timeout);
  errEl._timeout = setTimeout(() => errEl.classList.remove('is-visible'), 3500);
}


/* ══════════════════════════════════════════════════
   § 10. ACTUALIZACIÓN DE UI
══════════════════════════════════════════════════ */

function updateProgressUI() {
  const { step } = state;
  const isThanks = step === 5;
  const pct      = isThanks ? 100 : Math.round((step / CONFIG.totalSteps) * 100);

  const fill = DOM.progressFill();
  if (fill) fill.style.width = pct + '%';

  const cur  = DOM.stepIndCur();
  const name = DOM.stepIndName();
  if (cur)  cur.textContent  = isThanks ? 'Completado' : `Paso ${step} de ${CONFIG.totalSteps}`;
  if (name) name.textContent = CONFIG.stepNames[step - 1] || '';
}

function updateNavUI() {
  const { step } = state;
  const nav      = DOM.formNav();
  const back     = DOM.btnBack();
  const next     = DOM.btnNext();

  if (step === 5) { if (nav) nav.hidden = true; return; }
  if (nav) nav.hidden = false;

  const isQuiz = step === 4;
  if (back) back.hidden = (step === 1 || isQuiz);
  if (next) next.hidden = isQuiz;
}


/* ══════════════════════════════════════════════════
   § 11. GRUPOS DE OPCIONES (radio-style)
══════════════════════════════════════════════════ */

function handleOptionClick(btn) {
  const group = btn.closest('[data-group]');
  if (!group) return;

  const groupName = group.dataset.group;
  const value     = btn.dataset.value;
  const pts       = parseInt(btn.dataset.pts || '0', 10);

  group.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('is-sel'));
  btn.classList.add('is-sel');

  state.selections[groupName] = { value, pts };

  if (groupName === 'cursoMani') {
    const warn = DOM.exclWarn();
    if (warn) warn.hidden = (value !== 'no');
  }

  saveState();
}


/* ══════════════════════════════════════════════════
   § 12. QUIZ ENGINE
══════════════════════════════════════════════════ */

function startQuiz() {
  if (state.quizAnswers.length === 0) {
    state.quizIndex  = 0;
    state.quizScore  = 0;
  }
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const idx = state.quizIndex;
  const q   = QUIZ[idx];
  if (!q) return;

  const counter = DOM.quizCounter();
  if (counter) counter.textContent = `Pregunta ${idx + 1} de ${QUIZ.length}`;

  const pbar = DOM.quizProgressFill();
  if (pbar) pbar.style.width = `${(idx / QUIZ.length) * 100}%`;

  const qEl = DOM.quizQuestion();
  if (qEl) {
    qEl.style.opacity   = '0';
    qEl.style.transform = 'translateY(10px)';
    qEl.textContent     = q.q;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      qEl.style.transition = 'opacity 0.24s ease, transform 0.24s ease';
      qEl.style.opacity    = '1';
      qEl.style.transform  = 'translateY(0)';
    }));
  }

  const answersEl = DOM.quizAnswers();
  if (answersEl) {
    answersEl.innerHTML = '';
    QUIZ_OPTIONS.forEach(opt => {
      const btn      = document.createElement('button');
      btn.type       = 'button';
      btn.className  = `quiz-ans quiz-ans${opt.mod}`;
      btn.dataset.value = opt.value;
      btn.setAttribute('aria-label', opt.label.replace('\n', ' '));

      const lines = opt.label.split('\n');
      btn.innerHTML =
        `<span class="quiz-shape" aria-hidden="true">${opt.shape}</span>` +
        lines.map(l => `<span>${l}</span>`).join('');

      btn.addEventListener('click', () => handleQuizAnswer(btn, Number(opt.value)));
      answersEl.appendChild(btn);
    });
  }

  const footer = DOM.quizFooter();
  if (footer) footer.hidden = true;

  const nextBtn = DOM.btnQuizNext();
  if (nextBtn) nextBtn.textContent = idx < QUIZ.length - 1 ? 'Siguiente →' : 'Finalizar →';
}

function handleQuizAnswer(btn, value) {
  const idx  = state.quizIndex;
  const corr = QUIZ[idx].correct;
  const dist = Math.abs(value - corr);
  const pts  = QUIZ_PTS[Math.min(dist, 3)];

  const answersEl = DOM.quizAnswers();
  if (answersEl) {
    answersEl.querySelectorAll('.quiz-ans').forEach(b => {
      b.classList.add('is-off');
      b.disabled = true;
    });
    btn.classList.add('is-picked');
    btn.classList.remove('is-off');
  }

  state.quizAnswers.push({ q: idx + 1, answer: value, correct: corr, pts });
  state.quizScore += pts;

  const footer = DOM.quizFooter();
  if (footer) footer.hidden = false;

  saveState();
}

function handleQuizNext() {
  state.quizIndex++;

  if (state.quizIndex < QUIZ.length) {
    renderQuizQuestion();
  } else {
    const pbar = DOM.quizProgressFill();
    if (pbar) pbar.style.width = '100%';
    submitForm();
  }
}


/* ══════════════════════════════════════════════════
   § 13. CÁLCULO DE PUNTUACIÓN
══════════════════════════════════════════════════ */

function calculateScore() {
  const sel   = state.selections;
  const getP  = (map, key) => (sel[key] ? (map[sel[key].value] ?? 0) : 0);

  const dispScore =
    getP(SCORE_MAP.dispHoraria,  'dispHoraria')  +
    getP(SCORE_MAP.dispFds,      'dispFds')      +
    getP(SCORE_MAP.dispFeriados, 'dispFeriados') +
    getP(SCORE_MAP.dispInicio,   'dispInicio');

  const expScore =
    getP(SCORE_MAP.expGastro, 'expGastro') +
    getP(SCORE_MAP.expCaja,   'expCaja');

  const total   = dispScore + expScore + state.quizScore;
  const profile = PROFILES.find(p => total >= p.min) || PROFILES[PROFILES.length - 1];

  return { dispScore, expScore, quizScore: state.quizScore, total, profile };
}


/* ══════════════════════════════════════════════════
   § 14. ENVÍO A SUPABASE
══════════════════════════════════════════════════ */

/**
 * Construye el payload para insertar en Supabase.
 * Los nombres de campo coinciden exactamente con las columnas
 * de la tabla `postulaciones`.
 */
function buildPayload(scores) {
  const s   = state.selections;
  const i   = state.inputs;
  const val = (g) => s[g]?.value ?? '';

  return {
    nombre:        `${i.firstName || ''} ${i.lastName || ''}`.trim(),
    edad:          i.age      ? parseInt(i.age, 10) : null,
    email:         i.email    || '',
    telefono:      i.phone    || '',
    zona:          i.zone     || '',
    puesto:        state.puestos.join(', ') || 'No especificado',

    disp_noche:    val('dispNoche'),
    curso_mani:    val('cursoMani'),
    antecedentes:  val('antecedentes'),

    disp_horaria:  val('dispHoraria'),
    disp_fds:      val('dispFds'),
    disp_feriados: val('dispFeriados'),
    inicio:        val('dispInicio'),

    exp_gastro:    val('expGastro'),
    exp_caja:      val('expCaja'),

    pts_disp:      scores.dispScore,
    pts_exp:       scores.expScore,
    pts_quiz:      scores.quizScore,
    pts_total:     scores.total,
    perfil:        `${scores.profile.code} - ${scores.profile.label}`,

    quiz_detalle:  JSON.stringify(state.quizAnswers)
  };
}

/**
 * Envía el payload a Supabase via REST API.
 * Falla silenciosamente para no bloquear la pantalla de gracias.
 */
async function sendToSupabase(payload) {
  const url = `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.supabaseTable}`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':         CONFIG.supabaseKey,
      'Authorization': `Bearer ${CONFIG.supabaseKey}`,
      'Prefer':        'return=minimal'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Supabase] Error al insertar:', err);
  }
}

/**
 * Orquesta: verifica duplicado → calcula score →
 * envía a Supabase → muestra pantalla de gracias.
 */
async function submitForm() {
  const email   = state.inputs.email || '';
  const scores  = calculateScore();
  const payload = buildPayload(scores);

  // URL del Google Apps Script
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJf9GWAYwiWlr2oiErRyXu737A6lricj4XreNXZvVJZ5lWf8zON5hfIF8ckn0Ie2hD/exec';

  // Prevención silenciosa de reenvíos
  if (email && isEmailKnown(email)) {
    goToStep(5);
    clearState();
    return;
  }

  try {
    await Promise.all([

      // → Supabase (todos los perfiles, base de datos completa)
      sendToSupabase(payload),

      // → Apps Script (el filtro A/B/C está en el script)
      fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...payload,
          created_at: new Date().toLocaleString('es-AR')
        })
      })

    ]);
  } catch (err) {
    // Fallar silenciosamente — mostrar gracias de todas formas
    console.error('[Submit] error:', err);
  }

  if (email) registerEmail(email);
  clearState();
  goToStep(5);
}


/* ══════════════════════════════════════════════════
   § 15. RESTAURACIÓN DESDE LOCALSTORAGE
══════════════════════════════════════════════════ */

function restoreDOMFromState() {
  ['firstName', 'lastName', 'age', 'phone', 'email', 'zone'].forEach(id => {
    const input = el(id);
    if (input && state.inputs[id] !== undefined) {
      input.value = state.inputs[id];
    }
  });

  const sheetsEl = DOM.sheetsInput();
  if (sheetsEl && state.sheetsUrl) sheetsEl.value = state.sheetsUrl;

  Object.entries(state.selections).forEach(([groupName, sel]) => {
    if (!sel) return;
    const group = document.querySelector(`[data-group="${groupName}"]`);
    if (!group) return;

    const btn = group.querySelector(`[data-value="${sel.value}"]`);
    if (btn) {
      btn.classList.add('is-sel');
      if (groupName === 'cursoMani' && sel.value === 'no') {
        const warn = DOM.exclWarn();
        if (warn) warn.hidden = false;
      }
    }
  });

  state.puestos.forEach(val => {
    const input = document.querySelector(`input[name="puesto"][value="${val}"]`);
    if (input) {
      input.checked = true;
      input.closest('.check-opt')?.classList.add('is-checked');
    }
  });
}


/* ══════════════════════════════════════════════════
   § 16. REGISTRO DE EVENTOS
══════════════════════════════════════════════════ */

function registerEvents() {

  DOM.btnNext()?.addEventListener('click', handleNext);
  DOM.btnBack()?.addEventListener('click', handleBack);
  DOM.btnQuizNext()?.addEventListener('click', handleQuizNext);

  DOM.btnExit()?.addEventListener('click', () => {
    window.close();
    setTimeout(() => {
      DOM.app().innerHTML = `
        <div style="
          display:flex;flex-direction:column;align-items:center;
          justify-content:center;height:100vh;gap:1rem;
          font-family:-apple-system,system-ui,sans-serif;
          background:#0b0b0f;color:#f0efe8;text-align:center;padding:2rem;
        ">
          <span style="font-size:2.5rem">👋</span>
          <p style="font-size:1.1rem;font-weight:700">¡Hasta pronto!</p>
          <p style="font-size:0.875rem;color:#8a8a9e">
            Podés cerrar esta ventana.
          </p>
        </div>`;
    }, 200);
  });

  document.querySelectorAll('.opt-group').forEach(group => {
    group.addEventListener('click', e => {
      const btn = e.target.closest('.opt-btn');
      if (btn) handleOptionClick(btn);
    });
  });

  document.querySelectorAll('input[name="puesto"]').forEach(input => {
    input.addEventListener('change', () => {
      input.closest('.check-opt')?.classList.toggle('is-checked', input.checked);
      state.puestos = Array.from(
        document.querySelectorAll('input[name="puesto"]:checked')
      ).map(cb => cb.value);
      saveState();
    });
  });

  ['firstName', 'lastName', 'age', 'phone', 'email', 'zone'].forEach(id => {
    const input = el(id);
    if (!input) return;

    input.addEventListener('input', () => {
      state.inputs[id] = input.value;
      input.classList.remove('is-error');
      saveState();
    });

    input.addEventListener('blur', () => {
      state.inputs[id] = input.value;
      saveState();
    });
  });

  DOM.sheetsInput()?.addEventListener('input', e => {
    state.sheetsUrl = e.target.value.trim();
    saveState();
  });
}


/* ══════════════════════════════════════════════════
   § 17. INICIALIZACIÓN
══════════════════════════════════════════════════ */

function init() {
  const hasSaved = loadState();

  if (hasSaved && state.step > 1 && state.step <= 5) {
    el('step-1')?.classList.remove('is-active');
    el('step-' + state.step)?.classList.add('is-active');
    restoreDOMFromState();

    if (state.step === 4) renderQuizQuestion();
  } else {
    state.step = 1;
    el('step-1')?.classList.add('is-active');
  }

  if (!state.sheetsUrl) {
    const fromAttr = DOM.app()?.dataset.sheetsUrl || '';
    if (fromAttr) {
      state.sheetsUrl = fromAttr;
      const inp = DOM.sheetsInput();
      if (inp) inp.value = fromAttr;
    }
  }

  updateProgressUI();
  updateNavUI();
  registerEvents();
}

document.addEventListener('DOMContentLoaded', init);
