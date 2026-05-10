/**
 * ATS Gastronómico — app.js
 * ─────────────────────────────────────────────────────────────────
 * Sistema de reclutamiento invisible para candidatos.
 * Sabores Express & Hamburguesas Extremas
 *
 * Arquitectura: Vanilla JS puro | Sin dependencias
 * ─────────────────────────────────────────────────────────────────
 *
 * CONFIGURACIÓN ANTES DE PRODUCCIÓN:
 *   1. En index.html → <div id="app" data-sheets-url="TU_URL_AQUI">
 *   2. O bien editar CONFIG.sheetsUrl directamente aquí abajo.
 *
 * APPS SCRIPT (doPost) — pegar en Google Apps Script:
 * ─────────────────────────────────────────────────────────────────
 *   function doPost(e) {
 *     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
 *     if (sheet.getLastRow() === 0) {
 *       sheet.appendRow([
 *         'Timestamp','Nombre','Edad','Zona','Teléfono','Email','Puesto',
 *         'Disp.Noche','Curso.Mani','Antecedentes',
 *         'Disp.Horaria','Disp.FDS','Disp.Feriados','Inicio',
 *         'Exp.Gastro','Exp.Caja',
 *         'Pts.Disp','Pts.Exp','Pts.Quiz','Pts.Total','Perfil',
 *         'Quiz.Detalle'
 *       ]);
 *     }
 *     var d = JSON.parse(e.postData.contents);
 *     sheet.appendRow([
 *       d.timestamp, d.nombre, d.edad, d.zona, d.telefono, d.email, d.puesto,
 *       d.disp_noche, d.curso_mani, d.antecedentes,
 *       d.disp_horaria, d.disp_fds, d.disp_feriados, d.inicio,
 *       d.exp_gastro, d.exp_caja,
 *       d.pts_disp, d.pts_exp, d.pts_quiz, d.pts_total, d.perfil,
 *       d.quiz_detalle
 *     ]);
 *     return ContentService.createTextOutput('OK');
 *   }
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/* ══════════════════════════════════════════════════
   § 1. CONFIGURACIÓN
══════════════════════════════════════════════════ */

const CONFIG = {
  /** URL del Google Apps Script (reemplazar en producción) */
  sheetsUrl: '',

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

/**
 * Mapa de valores → puntos por grupo.
 * CRÍTICO: no modificar sin actualizar los umbrales de perfil.
 */
const SCORE_MAP = {
  dispHoraria:  { 'full-time': 30, 'part-tarde': 25, 'part-manana': 15, 'solo-fds': 10 },
  dispFds:      { 'always': 20, 'sometimes': 10, 'never': 0 },
  dispFeriados: { 'yes': 10, 'no': 0 },
  dispInicio:   { 'now': 10, '2weeks': 5, '1month': 0 },
  expGastro:    { '+2': 20, '1-2': 15, 'lt1': 8, '0': 0 },
  expCaja:      { 'yes': 5, 'no': 0 }
};

/**
 * Puntos del quiz por distancia a la respuesta ideal.
 * distancia 0 → 10 pts | 1 → 5 | 2 → 2 | 3 → 0
 */
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
   § 3. PREGUNTAS DEL QUIZ (orden e valores exactos)
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

/** Opciones de respuesta con icono, etiqueta y clase CSS */
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
  step:        1,          // paso actual (1–5)
  inputs:      {},         // { fieldId: value }
  selections:  {},         // { groupName: { value, pts } }
  puestos:     [],         // posiciones seleccionadas
  quizIndex:   0,          // pregunta actual del quiz (0–11)
  quizAnswers: [],         // [{ q, answer, correct, pts }]
  quizScore:   0,          // suma de pts del quiz
  sheetsUrl:   ''          // URL configurada por admin
};


/* ══════════════════════════════════════════════════
   § 5. ACCESOS AL DOM (lazy, centralizados)
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
  } catch (_) { /* cuota llena — ignorar silenciosamente */ }
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

    // Combinar sin sobrescribir propiedades no almacenadas
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

/**
 * Transiciona al paso indicado, actualizando UI y estado.
 * @param {number} targetStep
 */
function goToStep(targetStep) {
  // Ocultar paso actual
  const prevEl = el('step-' + state.step);
  if (prevEl) prevEl.classList.remove('is-active');

  // Mostrar paso destino
  const nextEl = el('step-' + targetStep);
  if (!nextEl) return;
  nextEl.classList.add('is-active');

  state.step = targetStep;

  // Scroll al inicio
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
  // El paso 4 (quiz) tiene su propia navegación interna
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
  // Campos de texto obligatorios
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

  // Validación básica de email
  const emailEl = el('email');
  if (emailEl && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) {
    emailEl.classList.add('is-error');
    emailEl.focus();
    showStepError(1, 'Ingresá un email válido.');
    return false;
  }

  // Al menos un puesto seleccionado
  if (state.puestos.length === 0) {
    showStepError(1, 'Seleccioná al menos un puesto de interés.');
    return false;
  }

  // Grupos requeridos del paso 1
  const reqGroups = ['dispNoche', 'cursoMani', 'antecedentes'];
  for (const g of reqGroups) {
    if (!state.selections[g]) {
      showStepError(1, 'Respondé todas las preguntas de requisitos.');
      return false;
    }
  }

  // Bloqueo por requisito excluyente
  if (state.selections.cursoMani?.value === 'no') {
    showStepError(1, 'El Curso de Manipulación de Alimentos es un requisito excluyente.');
    return false;
  }

  return true;
}

/**
 * Valida que todos los grupos indicados tengan selección.
 * @param {string[]} groups - nombres de data-group
 * @param {number}   step   - paso en el que mostrar el error
 */
function validateOptGroups(groups, step) {
  for (const g of groups) {
    if (!state.selections[g]) {
      showStepError(step, 'Respondé todas las preguntas antes de continuar.');
      return false;
    }
  }
  return true;
}

/**
 * Muestra un mensaje de error no invasivo dentro del paso.
 * Se auto-oculta a los 3.5 s.
 */
function showStepError(step, msg) {
  const stepEl = el('step-' + step);
  if (!stepEl) return;

  let errEl = stepEl.querySelector('.step-error');
  if (!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'step-error';
    // Insertarlo justo después del encabezado del paso
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

  // En la pantalla de gracias no hay nav
  if (step === 5) { if (nav) nav.hidden = true; return; }
  if (nav) nav.hidden = false;

  // En el quiz: solo hay nav interna (sin botones del shell)
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

  // Actualizar visual
  group.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('is-sel'));
  btn.classList.add('is-sel');

  // Actualizar estado
  state.selections[groupName] = { value, pts };

  // Advertencia de requisito excluyente
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
  // Solo reiniciar si no hay progreso guardado
  if (state.quizAnswers.length === 0) {
    state.quizIndex  = 0;
    state.quizScore  = 0;
  }
  renderQuizQuestion();
}

/**
 * Renderiza la pregunta actual con animación de entrada.
 */
function renderQuizQuestion() {
  const idx = state.quizIndex;
  const q   = QUIZ[idx];
  if (!q) return;

  // Contador y barra de progreso
  const counter = DOM.quizCounter();
  if (counter) counter.textContent = `Pregunta ${idx + 1} de ${QUIZ.length}`;

  const pbar = DOM.quizProgressFill();
  if (pbar) pbar.style.width = `${(idx / QUIZ.length) * 100}%`;

  // Animar texto de pregunta (fade + slide leve)
  const qEl = DOM.quizQuestion();
  if (qEl) {
    qEl.style.opacity   = '0';
    qEl.style.transform = 'translateY(10px)';
    qEl.textContent     = q.q;

    // Doble rAF para garantizar repaint antes de la transición
    requestAnimationFrame(() => requestAnimationFrame(() => {
      qEl.style.transition = 'opacity 0.24s ease, transform 0.24s ease';
      qEl.style.opacity    = '1';
      qEl.style.transform  = 'translateY(0)';
    }));
  }

  // Renderizar botones de respuesta
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

  // Ocultar botón siguiente hasta que respondan
  const footer = DOM.quizFooter();
  if (footer) footer.hidden = true;

  // Texto del botón: último paso muestra "Finalizar"
  const nextBtn = DOM.btnQuizNext();
  if (nextBtn) nextBtn.textContent = idx < QUIZ.length - 1 ? 'Siguiente →' : 'Finalizar →';
}

/**
 * Procesa la respuesta seleccionada (sin revelar si es correcta).
 */
function handleQuizAnswer(btn, value) {
  const idx  = state.quizIndex;
  const corr = QUIZ[idx].correct;
  const dist = Math.abs(value - corr);
  const pts  = QUIZ_PTS[Math.min(dist, 3)];

  // Deshabilitar todos los botones y resaltar el elegido
  const answersEl = DOM.quizAnswers();
  if (answersEl) {
    answersEl.querySelectorAll('.quiz-ans').forEach(b => {
      b.classList.add('is-off');
      b.disabled = true;
    });
    btn.classList.add('is-picked');
    btn.classList.remove('is-off'); // la respuesta elegida mantiene opacidad
  }

  // Registrar respuesta
  state.quizAnswers.push({ q: idx + 1, answer: value, correct: corr, pts });
  state.quizScore += pts;

  // Mostrar botón siguiente
  const footer = DOM.quizFooter();
  if (footer) footer.hidden = false;

  saveState();
}

/**
 * Avanza a la siguiente pregunta o termina el quiz.
 */
function handleQuizNext() {
  state.quizIndex++;

  if (state.quizIndex < QUIZ.length) {
    renderQuizQuestion();
  } else {
    // Quiz completado → barra al 100% y enviar
    const pbar = DOM.quizProgressFill();
    if (pbar) pbar.style.width = '100%';
    submitForm();
  }
}


/* ══════════════════════════════════════════════════
   § 13. CÁLCULO DE PUNTUACIÓN
══════════════════════════════════════════════════ */

/**
 * Calcula el score total y devuelve el perfil correspondiente.
 * @returns {{ dispScore, expScore, quizScore, total, profile }}
 */
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
   § 14. ENVÍO A GOOGLE SHEETS
══════════════════════════════════════════════════ */

/**
 * Construye el payload completo para Google Sheets.
 */
function buildPayload(scores) {
  const s   = state.selections;
  const i   = state.inputs;
  const val = (g) => s[g]?.value ?? '';

  return {
    timestamp:    new Date().toLocaleString('es-AR'),
    nombre:       `${i.firstName || ''} ${i.lastName || ''}`.trim(),
    edad:         i.age      || '',
    zona:         i.zone     || '',
    telefono:     i.phone    || '',
    email:        i.email    || '',
    puesto:       state.puestos.join(', ') || 'No especificado',

    disp_noche:   val('dispNoche'),
    curso_mani:   val('cursoMani'),
    antecedentes: val('antecedentes'),

    disp_horaria: val('dispHoraria'),
    disp_fds:     val('dispFds'),
    disp_feriados:val('dispFeriados'),
    inicio:       val('dispInicio'),

    exp_gastro:   val('expGastro'),
    exp_caja:     val('expCaja'),

    pts_disp:     scores.dispScore,
    pts_exp:      scores.expScore,
    pts_quiz:     scores.quizScore,
    pts_total:    scores.total,
    perfil:       `${scores.profile.code} - ${scores.profile.label}`,

    quiz_detalle: JSON.stringify(state.quizAnswers)
  };
}

/**
 * Envía el formulario: verifica duplicado, calcula score,
 * postea a Sheets y muestra pantalla de gracias.
 */
async function submitForm() {
  const email   = state.inputs.email || '';
  const scores  = calculateScore();
  const payload = buildPayload(scores);

  // Prevención silenciosa de reenvíos
  if (email && isEmailKnown(email)) {
    goToStep(5);
    clearState();
    return;
  }

  // Determinar URL (estado > atributo HTML > constante)
  const appEl  = DOM.app();
  const url    = state.sheetsUrl
              || (appEl?.dataset.sheetsUrl || '')
              || CONFIG.sheetsUrl;

  if (url) {
    try {
      await fetch(url, {
        method:  'POST',
        mode:    'no-cors',          // Apps Script no devuelve CORS
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
    } catch (_) {
      // Fallar silenciosamente — mostrar gracias de todas formas
    }
  }

  // Registrar email y limpiar borrador
  if (email) registerEmail(email);
  clearState();

  // Mostrar pantalla final
  goToStep(5);
}


/* ══════════════════════════════════════════════════
   § 15. RESTAURACIÓN DESDE LOCALSTORAGE
══════════════════════════════════════════════════ */

/**
 * Aplica el estado guardado al DOM (inputs, selecciones, checkboxes).
 */
function restoreDOMFromState() {
  // Inputs de texto
  ['firstName', 'lastName', 'age', 'phone', 'email', 'zone'].forEach(id => {
    const input = el(id);
    if (input && state.inputs[id] !== undefined) {
      input.value = state.inputs[id];
    }
  });

  // URL del Apps Script
  const sheetsEl = DOM.sheetsInput();
  if (sheetsEl && state.sheetsUrl) sheetsEl.value = state.sheetsUrl;

  // Grupos de opciones
  Object.entries(state.selections).forEach(([groupName, sel]) => {
    if (!sel) return;
    const group = document.querySelector(`[data-group="${groupName}"]`);
    if (!group) return;

    const btn = group.querySelector(`[data-value="${sel.value}"]`);
    if (btn) {
      btn.classList.add('is-sel');
      // Advertencia excluyente
      if (groupName === 'cursoMani' && sel.value === 'no') {
        const warn = DOM.exclWarn();
        if (warn) warn.hidden = false;
      }
    }
  });

  // Checkboxes de puestos
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

  // ── Botones de navegación principal ──
  DOM.btnNext()?.addEventListener('click', handleNext);
  DOM.btnBack()?.addEventListener('click', handleBack);
  DOM.btnQuizNext()?.addEventListener('click', handleQuizNext);

  // ── Botón de salida en pantalla de gracias ──
  DOM.btnExit()?.addEventListener('click', () => {
    window.close();
    // Fallback si el navegador no permite cerrar
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

  // ── Grupos de opciones (radio-style) — delegación de eventos ──
  document.querySelectorAll('.opt-group').forEach(group => {
    group.addEventListener('click', e => {
      const btn = e.target.closest('.opt-btn');
      if (btn) handleOptionClick(btn);
    });
  });

  // ── Checkboxes de puestos ──
  document.querySelectorAll('input[name="puesto"]').forEach(input => {
    input.addEventListener('change', () => {
      // Clase para compatibilidad con browsers sin :has()
      input.closest('.check-opt')?.classList.toggle('is-checked', input.checked);
      state.puestos = Array.from(
        document.querySelectorAll('input[name="puesto"]:checked')
      ).map(cb => cb.value);
      saveState();
    });
  });

  // ── Inputs de texto: guardar y limpiar error visual ──
  ['firstName', 'lastName', 'age', 'phone', 'email', 'zone'].forEach(id => {
    const input = el(id);
    if (!input) return;

    input.addEventListener('input', () => {
      state.inputs[id] = input.value;
      input.classList.remove('is-error');
      saveState();
    });

    // blur como respaldo para asegurar guardado
    input.addEventListener('blur', () => {
      state.inputs[id] = input.value;
      saveState();
    });
  });

  // ── URL del Apps Script ──
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
    // Restaurar paso guardado
    el('step-1')?.classList.remove('is-active');
    el('step-' + state.step)?.classList.add('is-active');
    restoreDOMFromState();

    // Si se guardó a mitad del quiz, retomarlo
    if (state.step === 4) renderQuizQuestion();
  } else {
    // Inicio fresco
    state.step = 1;
    el('step-1')?.classList.add('is-active');
  }

  // Prioridad para la URL: atributo HTML > constante
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

// Punto de entrada
document.addEventListener('DOMContentLoaded', init);
