const $ = (id) => document.getElementById(id);

const KEY_JOBS = 'er.jobs.v1';
const KEY_SESSION = 'er.session.v1';
const LOGIN_EMAIL = 'renato.sf.contador@gmail.com';
const PASS_HASH = 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7';
const MAX_REF_BYTES = 650 * 1024;
const MAX_PROMPT = 1400;
const POLL_MS = 2000;
const DESCOBERTA_MS = 8000;
const FRESCOR_MS = 12 * 60 * 1000;
const DESCOBERTA_URL =
  'https://raw.githubusercontent.com/renatosfcontador-ops/estudio-reis-descoberta/main/motor.json';

const STYLES = {
  realista: { label: 'Realista', suffix: 'realistic, natural lighting, cinematic, high detail' },
  cinematografico: { label: 'Cinema', suffix: 'cinematic, film grain, dramatic lighting, shallow depth of field, high detail' },
  animacao_3d: { label: 'Animação 3D', suffix: '3D animated, Pixar style, soft lighting, high detail' },
  anime: { label: 'Anime', suffix: 'anime style, clean lines, vibrant colors, high detail' },
  cyberpunk: { label: 'Cyberpunk', suffix: 'cyberpunk, neon lights, rainy night, cinematic, high detail' },
};

const NEGATIVE =
  'low quality, deformed, plastic, blurry, watermark, text, jitter, cropped, extra limbs';

const ESTADOS = {
  'na-fila': { label: 'Na fila', badge: 'Na fila', cls: 'ativo' },
  renderizando: { label: 'Gerando', badge: 'Gerando', cls: 'ativo' },
  concluido: { label: 'Concluído', badge: 'Pronto', cls: 'ok' },
  erro: { label: 'Erro', badge: 'Erro', cls: 'erro' },
  cancelado: { label: 'Cancelado', badge: 'Cancelado', cls: '' },
};

let jobs = loadJobs();
let activeId = null;
let pollTimer = null;
let ref = null;
let motor = null;
let motorTimer = null;
let pendente = null;

function loadJobs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_JOBS) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistJobs() {
  try {
    localStorage.setItem(KEY_JOBS, JSON.stringify(jobs.slice(0, 40)));
  } catch {
    /* cota cheia: segue sem persistir */
  }
}

function apiBase() {
  return motor ? motor.url.replace(/\/+$/, '') : '';
}

function authHeaders() {
  return motor && motor.token ? { Authorization: `Bearer ${motor.token}` } : {};
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visivel'), 3400);
}

async function api(path, options = {}) {
  if (!motor) throw new Error('motor indisponível');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
  try {
    const res = await fetch(apiBase() + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    throw new Error(aborted ? 'O motor demorou demais para responder.' : 'Sem conexão com o motor.');
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(status, data) {
  const detail = (data && (data.detail || data.erro || data.error)) || '';
  if (status === 401) return 'O motor recusou a sessão. Tente novamente.';
  if (status === 404) return 'O pedido não foi encontrado no motor.';
  if (status === 400) return detail || 'O pedido foi recusado pelo motor.';
  if (status >= 500) return detail || 'O motor teve uma falha interna.';
  return detail || `Falha inesperada (HTTP ${status}).`;
}

/* ── descoberta automática do motor ─────────────────────── */

function statusMotor(ok) {
  const note = $('motor-note');
  if (!note) return;
  note.hidden = Boolean(ok);
  if (!ok) {
    $('motor-note-text').textContent = 'Aguardando inicialização do motor…';
  }
}

async function descobrirMotor() {
  try {
    const res = await fetch(`${DESCOBERTA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !j.url || !j.atualizadoEm) return null;
    if (Date.now() - Number(j.atualizadoEm) > FRESCOR_MS) return null;
    return { url: String(j.url), token: String(j.token || '') };
  } catch {
    return null;
  }
}

async function cicloMotor() {
  const novo = await descobrirMotor();
  const mudou = Boolean(novo) && (!motor || novo.url !== motor.url);
  motor = novo;
  statusMotor(Boolean(novo));

  if (mudou) {
    if (pendente) {
      const p = pendente;
      pendente = null;
      enviarPedido(p);
    } else if (!activeId) {
      const retomavel = jobs.find((j) => j.estado === 'na-fila' || j.estado === 'renderizando');
      if (retomavel) {
        activeId = retomavel.id;
        startPolling(retomavel.id);
      }
    }
  }
}

function iniciarDescoberta() {
  cicloMotor();
  if (motorTimer) clearInterval(motorTimer);
  motorTimer = setInterval(cicloMotor, DESCOBERTA_MS);
}

/* ── imagem de referência ───────────────────────────────── */

function fileToDataUrl(file) {
  return new Promise((ok, fail) => {
    const reader = new FileReader();
    reader.onload = () => ok(String(reader.result));
    reader.onerror = () => fail(new Error('Não consegui ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('A imagem não pôde ser aberta.'));
    img.src = src;
  });
}

function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error('Use uma imagem JPG, PNG ou WebP.');
  }
  let dataUrl = await fileToDataUrl(file);
  if (dataUrlBytes(dataUrl) <= MAX_REF_BYTES) return { dataUrl, name: file.name };

  const img = await loadImage(dataUrl);
  const steps = [
    [1280, 0.85],
    [1024, 0.8],
    [854, 0.78],
    [640, 0.75],
  ];
  for (const [max, q] of steps) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', q);
    if (dataUrlBytes(out) <= MAX_REF_BYTES) return { dataUrl: out, name: file.name };
  }
  throw new Error('Essa imagem é pesada demais para uma referência.');
}

function setRef(data) {
  ref = data;
  if (!data) {
    $('ref').hidden = true;
    $('ref-img').removeAttribute('src');
    $('ref-name').textContent = '';
    return;
  }
  $('ref-img').src = data.dataUrl;
  $('ref-name').textContent = data.name;
  $('ref').hidden = false;
}

/* ── views ──────────────────────────────────────────────── */

function show(view) {
  const map = { welcome: $('view-welcome'), job: $('view-job'), library: $('view-library') };
  Object.entries(map).forEach(([k, el]) => {
    el.hidden = k !== view;
  });
}

function autoGrow() {
  const t = $('prompt');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 280) + 'px';
}

/* ── criação ────────────────────────────────────────────── */

function buildPayload(p) {
  const style = STYLES[p.estilo] || STYLES.realista;
  const montado = `${p.text}, ${style.suffix}`;
  const payload = {
    prompt: { montado: montado.slice(0, MAX_PROMPT), negativo: NEGATIVE },
    cena: { proporcao: p.proporcao, duracaoSegundos: p.duracao },
    qualidade: { steps: 30, pesoAtencao: 5.0 },
    referencias: { itens: [] },
  };
  if (ref) {
    payload.referenciaBase64 = ref.dataUrl;
    payload.referencias.itens.push({ papel: 'protagonista', ativa: true, url: '' });
  }
  return payload;
}

function coletarPedido() {
  const text = $('prompt').value.trim();
  if (text.length < 4) {
    toast('Conte um pouco mais da cena.');
    $('prompt').focus();
    return null;
  }
  return {
    text,
    estilo: $('style').value,
    proporcao: $('aspect').value,
    duracao: Number($('duration').value) || 5,
  };
}

function create() {
  const p = coletarPedido();
  if (!p) return;
  if (!motor) {
    pendente = p;
    statusMotor(false);
    toast('Aguardando inicialização do motor…');
    return;
  }
  enviarPedido(p);
}

async function enviarPedido(p) {
  const botao = $('btn-create');
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  showJobPlaceholder(p.text);

  try {
    const { ok, status, data } = await api('/api/render', {
      method: 'POST',
      body: JSON.stringify({ payload: buildPayload(p) }),
    });
    if (!ok || !data || !data.id) throw new Error(friendlyError(status, data));
    const entry = {
      id: data.id,
      titulo: p.text,
      estilo: p.estilo,
      proporcao: p.proporcao,
      duracao: p.duracao,
      criadoEm: new Date().toISOString(),
      estado: data.estado || 'na-fila',
      progresso: 0,
      etapa: 'Enviado ao motor',
      urlAbs: '',
      nome: '',
      erro: '',
    };
    jobs.unshift(entry);
    persistJobs();
    activeId = data.id;
    updateJobView(entry);
    startPolling(data.id);
  } catch (err) {
    pendente = p;
    statusMotor(false);
    show('welcome');
    toast('Aguardando inicialização do motor…');
  } finally {
    botao.disabled = false;
    botao.innerHTML = original;
  }
}

/* ── job / progresso ────────────────────────────────────── */

function showJobPlaceholder(text) {
  show('job');
  $('job-badge').textContent = 'Enviando';
  $('job-badge').className = 'badge ativo';
  $('job-title-text').textContent = 'Seu vídeo';
  $('job-prompt').textContent = text;
  $('job-progress').hidden = false;
  $('job-result').hidden = true;
  $('job-erro').hidden = true;
  $('job-cancel').hidden = true;
  $('progress-stage').textContent = 'Enviando o pedido…';
  $('progress-pct').textContent = '';
  $('progress-fill').style.width = '0%';
  $('progress-bar').classList.add('indeterminate');
  $('progress-meta').textContent = '';
}

function findJob(id) {
  return jobs.find((j) => j.id === id) || null;
}

function updateJobView(j) {
  show('job');
  $('job-badge').textContent = (ESTADOS[j.estado] || {}).badge || j.estado;
  $('job-badge').className = 'badge ' + ((ESTADOS[j.estado] || {}).cls || '');
  $('job-title-text').textContent = 'Seu vídeo';
  $('job-prompt').textContent = j.titulo || '';

  if (j.estado === 'concluido' && j.urlAbs) {
    $('job-progress').hidden = true;
    $('job-erro').hidden = true;
    $('job-result').hidden = false;
    const v = $('result-video');
    if (v.getAttribute('src') !== j.urlAbs) v.src = j.urlAbs;
    $('result-download').href = j.urlAbs;
    $('result-download').setAttribute('download', j.nome || 'estudio-reis.mp4');
    $('result-meta').textContent = [j.proporcao, j.duracao + 's', dataBr(j.criadoEm)].join(' · ');
    return;
  }

  $('job-result').hidden = true;
  $('job-progress').hidden = false;
  $('progress-bar').classList.remove('indeterminate');
  $('job-cancel').hidden = false;

  const final = j.estado === 'erro' || j.estado === 'cancelado';
  if (final) {
    $('progress-stage').textContent = (ESTADOS[j.estado] || {}).label || j.estado;
    $('progress-pct').textContent = '';
    $('progress-fill').style.width = j.estado === 'cancelado' ? '0%' : '100%';
    $('progress-meta').textContent = '';
    $('job-cancel').hidden = true;
    if (j.estado === 'erro') {
      $('job-erro').hidden = false;
      $('job-erro-text').textContent = j.erro || 'O motor não conseguiu concluir. Tente novamente.';
    } else {
      $('job-erro').hidden = true;
    }
    return;
  }

  $('job-erro').hidden = true;
  const pct = Math.max(0, Math.min(100, Number(j.progresso) || 0));
  $('progress-stage').textContent = j.etapa || (j.estado === 'na-fila' ? 'Na fila…' : 'Gerando…');
  $('progress-pct').textContent = j.estado === 'na-fila' ? 'na fila' : pct + '%';
  $('progress-fill').style.width = (j.estado === 'na-fila' ? 6 : pct) + '%';
  $('progress-meta').textContent = `Modelo Wan · ${j.proporcao} · ${j.duracao}s`;
}

function startPolling(id) {
  stopPolling();
  pollTimer = setInterval(() => poll(id), POLL_MS);
  poll(id);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function poll(id) {
  if (activeId && activeId !== id) return;
  const j = findJob(id);
  if (!j) return;
  try {
    const { ok, status, data } = await api(`/api/render/${encodeURIComponent(id)}`, { timeout: 15000 });
    if (!ok || !data) {
      if (status === 404) {
        j.estado = 'erro';
        j.erro = 'O pedido não existe mais no motor (sessão reiniciada?).';
        persistJobs();
        stopPolling();
        updateJobView(j);
      }
      return;
    }
    j.estado = data.estado || j.estado;
    j.progresso = data.progresso;
    j.etapa = data.etapa;
    if (data.saida) {
      j.urlAbs = apiBase() + data.saida.url;
      j.nome = data.saida.nome || '';
      j.largura = data.saida.largura;
      j.altura = data.saida.altura;
      j.duracaoReal = data.saida.duracaoSegundos;
    }
    if (data.erro) j.erro = data.erro;
    persistJobs();

    if (j.estado === 'concluido' || j.estado === 'erro' || j.estado === 'cancelado') {
      stopPolling();
      activeId = null;
    }
    updateJobView(j);
  } catch {
    j.etapa = 'Reconectando ao motor…';
    updateJobView(j);
  }
}

async function cancelJob() {
  if (!activeId) return;
  const id = activeId;
  stopPolling();
  $('job-cancel').disabled = true;
  try {
    await api(`/api/render/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    toast('Pedido cancelado.');
  } catch {
    toast('Não consegui cancelar agora.');
  }
  const j = findJob(id);
  if (j) {
    j.estado = 'cancelado';
    j.etapa = 'Cancelado';
    persistJobs();
    updateJobView(j);
  }
  activeId = null;
  $('job-cancel').disabled = false;
}

/* ── biblioteca ─────────────────────────────────────────── */

function dataBr(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function renderLibrary() {
  const grade = $('lib-grade');
  grade.replaceChildren();
  $('lib-count').textContent = jobs.length
    ? `${jobs.length} ${jobs.length === 1 ? 'criação' : 'criações'}`
    : '';

  if (!jobs.length) {
    const v = document.createElement('div');
    v.className = 'vazio';
    v.innerHTML =
      '<div class="big" aria-hidden="true">🎬</div>' +
      '<h3>Nada por aqui ainda</h3>' +
      '<p>Descreva uma cena e toque em “Criar Vídeo”. Suas criações ficam guardadas neste navegador.</p>';
    grade.append(v);
    return;
  }

  jobs.forEach((j) => {
    const card = document.createElement('article');
    card.className = 'card';

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3V9Z"/></svg>';
    const st = ESTADOS[j.estado] || { label: j.estado, cls: '' };
    const stateEl = document.createElement('span');
    stateEl.className = 'state ' + (st.cls || '');
    stateEl.textContent = st.label;
    thumb.append(stateEl);

    const body = document.createElement('div');
    body.className = 'body';

    const h3 = document.createElement('h3');
    h3.textContent = j.titulo || 'Sem título';
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [dataBr(j.criadoEm), j.proporcao, j.duracao + 's'].join(' · ');

    const acoes = document.createElement('div');
    acoes.className = 'acoes';

    if (j.estado === 'concluido' && j.urlAbs) {
      const play = document.createElement('button');
      play.className = 'btn primary';
      play.type = 'button';
      play.textContent = '▶ Assistir';
      play.onclick = () => openHistory(j);
      const dl = document.createElement('a');
      dl.className = 'btn';
      dl.href = j.urlAbs;
      dl.setAttribute('download', j.nome || 'estudio-reis.mp4');
      dl.textContent = '⬇ Baixar';
      acoes.append(play, dl);
    } else {
      const again = document.createElement('button');
      again.className = 'btn';
      again.type = 'button';
      again.textContent = '↻ Reenviar';
      again.onclick = () => {
        $('prompt').value = j.titulo || '';
        $('style').value = j.estilo || 'realista';
        $('aspect').value = j.proporcao || '16:9';
        $('duration').value = String(j.duracao || 5);
        autoGrow();
        show('welcome');
        $('prompt').focus();
      };
      acoes.append(again);
    }

    body.append(h3, meta, acoes);
    card.append(thumb, body);
    grade.append(card);
  });
}

function openHistory(j) {
  activeId = null;
  stopPolling();
  $('prompt').value = j.titulo || '';
  $('style').value = j.estilo || 'realista';
  $('aspect').value = j.proporcao || '16:9';
  $('duration').value = String(j.duracao || 5);
  autoGrow();
  updateJobView(j);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── login unificado ────────────────────────────────────── */

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function showLogin() {
  stopPolling();
  activeId = null;
  $('app-shell').hidden = true;
  $('login').hidden = false;
  $('login-erro').textContent = '';
  $('login-pass').value = '';
  setTimeout(() => $('login-email').focus(), 60);
}

function boot() {
  $('login').hidden = true;
  $('app-shell').hidden = false;
  autoGrow();
  show('welcome');
  statusMotor(false);
  iniciarDescoberta();
}

/* ── eventos ────────────────────────────────────────────── */

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  create();
});

$('prompt').addEventListener('input', autoGrow);
$('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('composer').requestSubmit();
  }
});

$('ref-add').addEventListener('click', () => $('ref-input').click());
$('ref-remove').addEventListener('click', () => {
  setRef(null);
  $('ref-input').value = '';
});
$('ref-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    setRef(await prepareImage(file));
  } catch (err) {
    toast(err.message || 'Não consegui usar essa imagem.');
  }
});

$('job-close').addEventListener('click', () => {
  stopPolling();
  activeId = null;
  show('welcome');
  $('prompt').focus();
});
$('job-cancel').addEventListener('click', cancelJob);
$('result-again').addEventListener('click', () => {
  show('welcome');
  $('prompt').focus();
});

$('btn-library').addEventListener('click', () => {
  renderLibrary();
  show('library');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('btn-logout').addEventListener('click', () => {
  localStorage.removeItem(KEY_SESSION);
  if (motorTimer) clearInterval(motorTimer);
  showLogin();
});

window.addEventListener('beforeunload', () => {
  persistJobs();
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim().toLowerCase();
  const pass = $('login-pass').value;
  if (email !== LOGIN_EMAIL) {
    $('login-erro').textContent = 'E-mail não autorizado.';
    return;
  }
  let hash = '';
  try {
    hash = await sha256(pass);
  } catch {
    $('login-erro').textContent = 'Este navegador não permite validar a sessão (use HTTPS).';
    return;
  }
  if (hash !== PASS_HASH) {
    $('login-erro').textContent = 'Senha incorreta.';
    return;
  }
  localStorage.setItem(KEY_SESSION, JSON.stringify({ email, em: new Date().toISOString() }));
  $('login-pass').value = '';
  boot();
});

if (localStorage.getItem(KEY_SESSION)) {
  boot();
} else {
  showLogin();
}