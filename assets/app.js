const $ = (id) => document.getElementById(id);

const KEY_JOBS = 'er.jobs.v1';
const KEY_SESSION = 'er.session.v1';
const LOGIN_EMAIL = 'renato.sf.contador@gmail.com';
const LOGIN_PASSWORD = 'Admin@123';
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

const DIMS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960] };

let jobs = loadJobs();
let activeId = null;
let pollTimer = null;
let ref = null;
let motor = null;
let motorTimer = null;
let pendente = null;
let modo = 't2v';
let aspect = '16:9';
let modoAtual = 'chat';
let chatHistory = [];
let offlineDesde = null;
let hybridTimer = null;

const ANGLES = [
  ['frente', 'Frente'],
  ['costas', 'Costas'],
  ['esq', 'Esg'],
  ['dir', 'Dir'],
  ['cima', 'Cima'],
  ['baixo', 'Baixo'],
  ['olhos', 'Olhos'],
];
const charState = Array.from({ length: 5 }, (_, i) => ({
  nome: '',
  papel: i === 0 ? 'protagonista' : i === 1 ? 'antagonista' : 'apoio',
  desc: '',
  consistencia: 'consistente',
  angles: {},
}));

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
    /* cota cheia */
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
    throw new Error(aborted ? 'O motor demorou demais.' : 'Sem conexão com o motor.');
  } finally {
    clearTimeout(timer);
  }
}

function friendlyError(status, data) {
  const detail = (data && (data.detail || data.erro || data.error)) || '';
  if (status === 401) return 'O motor recusou a sessão.';
  if (status === 404) return 'Pedido não encontrado no motor.';
  if (status === 400) return detail || 'Pedido recusado pelo motor.';
  if (status >= 500) return detail || 'Falha interna do motor.';
  return detail || `Falha inesperada (HTTP ${status}).`;
}

/* ── descoberta automática ──────────────────────────────── */

let lastMotorOk = null;
function statusMotor(ok) {
  if (ok === lastMotorOk && $('motor-state')) return;
  lastMotorOk = ok;
  if (ok) {
    offlineDesde = null;
    stopHybridTimer();
  } else if (!offlineDesde) {
    offlineDesde = Date.now();
  }
  const pill = $('motor-pill');
  if (pill) {
    pill.className = 'status-pill ' + (ok ? 'ok' : 'hybrid');
    $('motor-pill-text').textContent = ok ? 'Motor pronto para renderizar' : 'Modo híbrido · chat ativo';
  }
  const pillL = $('motor-pill-landing');
  if (pillL) {
    pillL.className = 'status-pill ' + (ok ? 'ok' : 'hybrid');
    $('motor-pill-text-landing').textContent = ok ? 'Motor pronto para renderizar' : 'Modo híbrido · chat ativo';
  }
  const st = $('motor-state');
  if (st) {
    st.className = 'motor-state ' + (ok ? 'ok' : 'hybrid');
    $('motor-state-text').textContent = ok ? 'Pronto para renderizar' : 'Motor em inicialização';
    if (ok) {
      const extra = motor && motor.total > 1 ? `${motor.total} motores · ` : '';
      $('motor-sub').textContent = `${extra}${motor && motor.modelo ? motor.modelo : 'wan2.1'} · S3 24h`;
    } else {
      $('motor-sub').textContent = 'Modo híbrido · chat ativo';
    }
  }
  if (!ok) startHybridTimer();
}

function startHybridTimer() {
  if (hybridTimer) return;
  const tick = () => {
    if (!offlineDesde || !$('motor-sub')) return;
    const s = Math.floor((Date.now() - offlineDesde) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('motor-sub').textContent = `Modo híbrido · chat ativo · ${mm}:${ss}`;
  };
  tick();
  hybridTimer = setInterval(tick, 1000);
}

function stopHybridTimer() {
  if (hybridTimer) {
    clearInterval(hybridTimer);
    hybridTimer = null;
  }
}

async function descobrirMotor() {
  try {
    const res = await fetch(`${DESCOBERTA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j) return null;
    const atualizado = Number(j.atualizadoEm) || 0;
    if (atualizado && Date.now() - atualizado > FRESCOR_MS) return null;
    let lista = [];
    if (Array.isArray(j.engines) && j.engines.length) {
      lista = j.engines.filter((e) => e && e.url).map((e) => ({ url: String(e.url), token: String(e.token || '') }));
    } else if (j.url) {
      lista = [{ url: String(j.url), token: String(j.token || '') }];
    }
    if (!lista.length) return null;
    return { url: lista[0].url, token: lista[0].token, total: lista.length, modelo: j.modelo || '' };
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
    if (novo && $('motor-hint')) $('motor-hint').textContent = 'O botão gerencia a fila e o polling sozinho.';
    if (pendente) {
      const p = pendente;
      pendente = null;
      enviarPedido(p);
    } else if (!activeId) {
      const ret = jobs.find((j) => j.estado === 'na-fila' || j.estado === 'renderizando');
      if (ret) {
        activeId = ret.id;
        startPolling(ret.id);
      }
    }
  }
}

function iniciarDescoberta() {
  cicloMotor();
  if (motorTimer) clearInterval(motorTimer);
  motorTimer = setInterval(cicloMotor, DESCOBERTA_MS);
}

/* ── modos (chat / canvas) ──────────────────────────────── */

function setMode(mode) {
  const chat = $('view-chat');
  const canvas = $('view-canvas');
  const alvo = mode === 'canvas' ? canvas : chat;
  const outro = mode === 'canvas' ? chat : canvas;
  modoAtual = mode;

  document.querySelectorAll('#mode-toggle button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));

  const aplicar = () => {
    outro.hidden = true;
    outro.classList.remove('leaving');
    alvo.hidden = false;
    alvo.classList.add('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => alvo.classList.remove('entering')));
    if (mode === 'canvas') {
      requestAnimationFrame(desenharConexoes);
      setTimeout(desenharConexoes, 320);
    }
  };

  if (outro.hidden) {
    aplicar();
    return;
  }
  outro.classList.add('leaving');
  setTimeout(aplicar, 180);
}

/* ── conexões do canvas ─────────────────────────────────── */

function desenharConexoes() {
  const svg = $('wires');
  const canvas = $('canvas');
  if (!svg || !canvas) return;
  if (window.matchMedia('(max-width: 1180px)').matches) {
    svg.innerHTML = '';
    return;
  }
  const cr = canvas.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${cr.width} ${cr.height}`);
  svg.innerHTML = '';

  const pares = [
    ['port-script', 'port-params-in'],
    ['port-params-out', 'port-motor-in'],
    ['port-motor-out', 'port-out-in'],
  ];
  for (const [a, b] of pares) {
    const pa = $(a);
    const pb = $(b);
    if (!pa || !pb) continue;
    const ra = pa.getBoundingClientRect();
    const rb = pb.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2 - cr.left;
    const y1 = ra.top + ra.height / 2 - cr.top;
    const x2 = rb.left + rb.width / 2 - cr.left;
    const y2 = rb.top + rb.height / 2 - cr.top;
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.5);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', 'wire');
    svg.appendChild(path);
  }
}

/* ── assistente (chat) ──────────────────────────────────── */

function detectarEstilo(t) {
  if (/anime|mang[aá]|anima[cç][aã]o japonesa/.test(t)) return 'anime';
  if (/cyberpunk|neon|tecnol[oó]gico|futurista/.test(t)) return 'cyberpunk';
  if (/3d|pixar|desenho animado|cartoon|infantil/.test(t)) return 'animacao_3d';
  if (/cinema|filme|dram[aá]tico|cinematogr[aá]fico/.test(t)) return 'cinematografico';
  return 'realista';
}

function responder(texto) {
  const t = texto.toLowerCase();

  if (/(wan|motor|como funciona|gpu|kaggle|s3)/.test(t)) {
    return {
      texto:
        'O **Wan2.1** roda na GPU (Kaggle/ComfyUI) e fica desacoplado do site. O Estúdio descobre o motor sozinho por um registro público (motor.json) — você nunca digita URL nem token.\n\n' +
        'O fluxo é: Roteiro → Parâmetros → Motor → Preview. Ao concluir, o vídeo vai para a AWS S3 e expira em 24 h.',
    };
  }
  if (/(melhor|dica|prompt|qualidade)/.test(t)) {
    return {
      texto:
        'Para um bom prompt:\n\n' +
        '• Descreva **sujeito + ação + cenário + câmera** (ex.: “menino 3D corre na chuva, câmera lenta, luz neon”).\n' +
        '• Diga o **estilo** (realista, cinema, anime, 3D) e a **proporção**.\n' +
        '• Use **steps 8–12** para equilíbrio; 4 é rascunho rápido.\n' +
        '• Fixe a **seed** quando quiser repetir o resultado.',
    };
  }
  if (/(vertical|9:16|reels|tiktok|stories)/.test(t)) {
    return {
      texto:
        'Para vertical **9:16** (720×1280), escolha a proporção 9:16 no nó Parâmetros. Duração de 3–5 s e steps 8 costumam render bem. Levo você ao Canvas para ajustar?',
      acao: { tipo: 'canvas', cena: texto, estilo: 'realista' },
    };
  }
  if (/(roteiro|cena|criar|ideia|v[ií]deo|hist[oó]ria|personagem)/.test(t) || texto.length > 34) {
    const estilo = detectarEstilo(t);
    const rotulo = (STYLES[estilo] || STYLES.realista).label;
    return {
      texto:
        'Boa! Estruturei sua ideia:\n\n' +
        `• **Cena**: ${texto}\n` +
        `• **Estilo sugerido**: ${rotulo}\n` +
        '• **Faltam**: protagonista/antagonista e o enquadramento (se quiser detalhar).\n\n' +
        'Posso levar isso para o Canvas — lá você ajusta personagens, prompt e parâmetros e clica em **Criar Vídeo**.',
      acao: { tipo: 'canvas', cena: texto, estilo },
    };
  }
  if (/(ol[aá]|oi\b|bom dia|boa tarde|boa noite)/.test(t)) {
    return { texto: 'Olá! Sou o assistente do Estúdio Reis. Posso estruturar um roteiro, explicar o Wan2.1 ou melhorar seu prompt. O que vamos criar?' };
  }
  return {
    texto:
      'Posso ajudar a transformar sua ideia em um roteiro de vídeo. Descreva a cena com uma frase (ex.: “um astronauta caminha em Marte ao pôr do sol”) e eu estruturo para o Canvas.',
  };
}

const AI_ENDPOINTS = [
  '/.netlify/functions/chat',
  'https://estudio-reis.netlify.app/.netlify/functions/chat',
];

async function askAI(messages) {
  for (const endpoint of AI_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-10) }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) continue;
      const data = await res.json();
      if (data && data.ok && typeof data.reply === 'string' && data.reply.trim()) return data;
    } catch {
      /* tenta o próximo endpoint */
    }
  }
  return null;
}

function addMsg(autor, texto, acao, origem, provedor) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + autor;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (autor === 'assistant') {
    const img = document.createElement('img');
    img.src = 'brand/isotipo/studio-reis-isotipo.svg';
    img.alt = '';
    avatar.append(img);
  } else {
    avatar.textContent = 'R';
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (origem === 'ia') {
    const tag = document.createElement('span');
    tag.className = 'src-tag';
    tag.textContent = provedor ? `IA · ${provedor}` : 'IA';
    if (provedor) tag.title = 'Gerado por ' + provedor;
    bubble.append(tag, document.createElement('br'));
  }
  bubble.append(document.createTextNode(texto));

  if (acao && acao.tipo === 'canvas') {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.type = 'button';
    b.textContent = 'Levar ao Canvas';
    b.onclick = () => levarAoCanvas(acao);
    actions.append(b);
    bubble.append(actions);
  }

  wrap.append(avatar, bubble);
  $('messages').append(wrap);
  $('chat-hero').hidden = true;
  const sc = $('chat-scroll');
  sc.scrollTop = sc.scrollHeight;
}

function levarAoCanvas(a) {
  const cena = (a && a.cena) || '';
  const prot = (a && a.protagonista) || '';
  const ant = (a && a.antagonista) || '';
  const estilo = (a && a.estilo) || 'realista';

  if (cena) $('cena').value = cena;
  if (prot) charState[0].nome = prot;
  if (ant) charState[1].nome = ant;
  if (prot || ant) montarElenco();
  if (estilo in STYLES) $('estilo').value = estilo;
  if (!$('negativo').value.trim()) $('negativo').value = NEGATIVE;

  setMode('canvas');
  setTimeout(() => $('cena').focus(), 420);
  toast('Roteiro levado ao Canvas.');
}

async function enviarChat(texto) {
  const t = texto.trim();
  if (!t) return;
  addMsg('user', t);
  $('chat-text').value = '';
  autoGrowChat();
  chatHistory.push({ role: 'user', content: t });

  const ai = await askAI(chatHistory);
  let reply;
  let acao = null;
  let origem = 'local';

  if (ai) {
    reply = ai.reply;
    origem = 'ia';
    const r = ai.roteiro;
    if (r && (r.cena || r.protagonista || r.antagonista)) {
      acao = {
        tipo: 'canvas',
        cena: r.cena || t,
        protagonista: r.protagonista || '',
        antagonista: r.antagonista || '',
        estilo: r.estilo || 'realista',
      };
    }
  } else {
    const local = responder(t);
    reply = local.texto;
    acao = local.acao;
  }

  chatHistory.push({ role: 'assistant', content: reply });
  addMsg('assistant', reply, acao, origem, ai ? ai.provedor : '');
}

function autoGrowChat() {
  const t = $('chat-text');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 160) + 'px';
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
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use JPG, PNG ou WebP.');
  let dataUrl = await fileToDataUrl(file);
  if (dataUrlBytes(dataUrl) <= MAX_REF_BYTES) return { dataUrl, name: file.name };
  const img = await loadImage(dataUrl);
  for (const [max, q] of [[1280, 0.85], [1024, 0.8], [854, 0.78], [640, 0.75]]) {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', q);
    if (dataUrlBytes(out) <= MAX_REF_BYTES) return { dataUrl: out, name: file.name };
  }
  throw new Error('Imagem pesada demais para referência.');
}
function setRef(data) {
  ref = data;
  const prev = $('ref-prev');
  if (!prev) return;
  if (!data) {
    prev.hidden = true;
    $('ref-img').removeAttribute('src');
    return;
  }
  $('ref-img').src = data.dataUrl;
  prev.hidden = false;
  $('ref-status').textContent = 'Referência anexada (I2V).';
}

/* ── elenco (1–5 personagens × 7 ângulos) ───────────────── */

function montarElenco() {
  const cont = $('elenco');
  if (!cont) return;
  cont.replaceChildren();

  const nomes = ['Protagonista', 'Antagonista', 'Apoio 1', 'Apoio 2', 'Apoio 3'];
  const cores = ['#8a6b24', '#7a4b3a', '#4a6b5a', '#3a5a7a', '#6a4a7a'];

  charState.forEach((c, i) => {
    const det = document.createElement('details');
    det.className = 'char';
    if (i === 0) det.open = true;

    const sum = document.createElement('summary');
    const cn = document.createElement('span');
    cn.className = 'cn';
    cn.textContent = String(i + 1);
    cn.style.background = cores[i];
    cn.style.color = '#fff';
    const name = document.createElement('span');
    name.className = 'cname';
    name.textContent = c.nome || nomes[i];
    const role = document.createElement('span');
    role.className = 'crole';
    role.textContent = c.papel;
    const tog = document.createElement('span');
    tog.className = 'ctoggle';
    tog.textContent = '▾';
    sum.append(cn, name, role, tog);

    const body = document.createElement('div');
    body.className = 'char-body';

    const row = document.createElement('div');
    row.className = 'fld-row';

    const wrapNome = document.createElement('label');
    wrapNome.className = 'fld';
    const spanNome = document.createElement('span');
    spanNome.textContent = 'Nome';
    const inNome = document.createElement('input');
    inNome.type = 'text';
    inNome.maxLength = 80;
    inNome.placeholder = 'Nome do personagem';
    inNome.value = c.nome;
    inNome.addEventListener('input', () => {
      c.nome = inNome.value;
      name.textContent = inNome.value || nomes[i];
    });
    wrapNome.append(spanNome, inNome);

    const wrapPapel = document.createElement('label');
    wrapPapel.className = 'fld';
    const spanPapel = document.createElement('span');
    spanPapel.textContent = 'Papel';
    const selPapel = document.createElement('select');
    [['protagonista', 'Protagonista'], ['antagonista', 'Antagonista'], ['apoio', 'Apoio']].forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      selPapel.append(o);
    });
    selPapel.value = c.papel;
    selPapel.addEventListener('change', () => {
      c.papel = selPapel.value;
      role.textContent = c.papel;
    });
    wrapPapel.append(spanPapel, selPapel);
    row.append(wrapNome, wrapPapel);

    const wrapDesc = document.createElement('label');
    wrapDesc.className = 'fld';
    const spanDesc = document.createElement('span');
    spanDesc.textContent = 'Traços / roupa';
    const inDesc = document.createElement('input');
    inDesc.type = 'text';
    inDesc.maxLength = 200;
    inDesc.placeholder = 'Ex.: menino 3D, óculos, moletom amarelo';
    inDesc.value = c.desc;
    inDesc.addEventListener('input', () => {
      c.desc = inDesc.value;
    });
    wrapDesc.append(spanDesc, inDesc);

    const wrapCons = document.createElement('label');
    wrapCons.className = 'fld';
    const spanCons = document.createElement('span');
    spanCons.textContent = 'Consistência';
    const selCons = document.createElement('select');
    [['consistente', 'Manter consistente'], ['livre', 'Variação livre']].forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      selCons.append(o);
    });
    selCons.value = c.consistencia || 'consistente';
    selCons.addEventListener('change', () => {
      c.consistencia = selCons.value;
    });
    wrapCons.append(spanCons, selCons);

    const angles = document.createElement('div');
    angles.className = 'angles';
    ANGLES.forEach(([slot, rot]) => {
      const lab = document.createElement('label');
      lab.className = 'angle';
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.hidden = true;
      const img = document.createElement('img');
      img.alt = rot;
      const sp = document.createElement('span');
      sp.textContent = rot;
      lab.append(inp, img, sp);

      if (c.angles[slot]) {
        img.src = c.angles[slot].dataUrl;
        lab.classList.add('tem');
      }
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        inp.value = '';
        if (!f) return;
        try {
          const prep = await prepareImage(f);
          c.angles[slot] = { dataUrl: prep.dataUrl, name: f.name };
          img.src = prep.dataUrl;
          lab.classList.add('tem');
        } catch (err) {
          toast(err.message || 'Não consegui usar a imagem.');
        }
      });
      angles.append(lab);
    });

    body.append(row, wrapDesc, wrapCons, angles);
    det.append(sum, body);
    cont.append(det);
  });
}

/* ── leitura dos nós ────────────────────────────────────── */

function coletarPedido() {
  const cena = $('cena').value.trim();
  if (cena.length < 4) {
    toast('Descreva a cena no nó Roteiro.');
    setMode('canvas');
    setTimeout(() => $('cena').focus(), 350);
    return null;
  }

  const elenco = charState
    .filter((c) => c.nome || c.desc || Object.keys(c.angles || {}).length)
    .map((c) => ({
      nome: c.nome || '',
      papel: c.papel || 'apoio',
      desc: c.desc || '',
      consistencia: c.consistencia || 'consistente',
      angulos: Object.keys(c.angles || {}),
    }));

  const prot = charState.find((c) => c.papel === 'protagonista' && c.angles && c.angles.frente);
  const referencia = prot ? { dataUrl: prot.angles.frente.dataUrl, name: 'protagonista-frente' } : ref;

  return {
    elenco,
    referencia,
    cena,
    estilo: $('estilo').value,
    positivo: $('positivo').value.trim(),
    negativo: $('negativo').value.trim(),
    lora: $('lora').value.trim(),
    loraNome: $('lora-nome').value.trim(),
    narracao: $('narracao').value.trim(),
    modo,
    aspect,
    duration: Number($('duration').value) || 5,
    steps: Number($('steps').value) || 8,
    seed: $('seed').value.trim() ? Number($('seed').value) : 0,
  };
}

function buildPayload(p) {
  const estilo = STYLES[p.estilo] || STYLES.realista;
  const partes = [];

  (p.elenco || []).forEach((c) => {
    const d = [c.nome, c.desc].filter(Boolean).join(' - ');
    if (d) {
      const cons = c.consistencia === 'consistente' ? ', aparência consistente' : '';
      partes.push(`Personagem (${c.papel}): ${d}${cons}`);
    }
  });

  partes.push(p.cena);
  if (p.positivo) partes.push(p.positivo);
  const mods = [p.lora, p.loraNome ? `LoRA ${p.loraNome}` : ''].filter(Boolean).join(', ');
  if (mods) partes.push(mods);
  partes.push(estilo.suffix);

  const payload = {
    prompt: {
      montado: partes.join('. ').slice(0, MAX_PROMPT),
      negativo: (p.negativo || NEGATIVE).slice(0, 600),
    },
    cena: { proporcao: p.aspect, duracaoSegundos: p.duration },
    qualidade: { steps: p.steps, pesoAtencao: 5.0, seed: p.seed || 0 },
    roteiro: { narracao: p.narracao || '' },
    elenco: p.elenco || [],
    referencias: { itens: [] },
  };

  if (p.modo === 'i2v' && p.referencia) {
    payload.referenciaBase64 = p.referencia.dataUrl;
    payload.referencias.itens.push({ papel: 'protagonista', ativa: true, url: '' });
  }
  return payload;
}

function atualizarReadout() {
  const d = Number($('duration').value) || 5;
  const [w, h] = DIMS[aspect] || DIMS['16:9'];
  const frames = Math.round((d * 16) / 4) * 4 + 1;
  $('frames-readout').textContent = String(frames);
  $('res-hint').textContent = `${aspect} · ${w}×${h}`;
}

/* ── voz / narração (Web Speech) ────────────────────────── */

function montarVozes() {
  const sel = $('voz');
  if (!sel) return;
  sel.replaceChildren();
  if (!('speechSynthesis' in window)) {
    const o = document.createElement('option');
    o.textContent = 'Sem suporte';
    sel.append(o);
    return;
  }
  const vozes = window.speechSynthesis.getVoices();
  const pref = vozes.filter((v) => /^pt/i.test(v.lang));
  const lista = pref.length ? pref : vozes;
  if (!lista.length) {
    const o = document.createElement('option');
    o.textContent = 'Voz padrão';
    sel.append(o);
    return;
  }
  lista.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.append(o);
  });
}

function ouvirNarracao() {
  if (!('speechSynthesis' in window)) {
    toast('Este navegador não tem síntese de voz.');
    return;
  }
  const texto = $('narracao').value.trim();
  if (!texto) {
    toast('Escreva a narração.');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const nome = $('voz').value;
  const v = window.speechSynthesis.getVoices().find((x) => x.name === nome);
  if (v) u.voice = v;
  u.rate = Number($('voz-rate').value) || 1;
  u.lang = (v && v.lang) || 'pt-BR';
  u.onend = () => {
    $('voz-parar').hidden = true;
  };
  u.onerror = () => {
    $('voz-parar').hidden = true;
  };
  $('voz-parar').hidden = false;
  $('voz-status').textContent = 'Reproduzindo…';
  window.speechSynthesis.speak(u);
}

function pararNarracao() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  $('voz-parar').hidden = true;
  $('voz-status').textContent = 'prévia local (Web Speech)';
}

/* ── criação ────────────────────────────────────────────── */

function create() {
  const p = coletarPedido();
  if (!p) return;
  if (!motor) {
    const primeiro = !pendente;
    pendente = p;
    statusMotor(false);
    $('motor-hint').textContent = 'Pedido na fila · envio automático assim que o motor subir.';
    if (primeiro) toast('Modo híbrido: pedido na fila. O chat continua ativo.');
    return;
  }
  enviarPedido(p);
}

async function enviarPedido(p) {
  const botao = $('btn-create');
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  $('result-video').hidden = true;
  $('result-video').removeAttribute('src');
  $('preview-empty').hidden = false;
  $('out-actions').hidden = true;
  $('out-erro').hidden = true;
  $('job-progress').hidden = false;
  $('progress-bar').classList.add('indeterminate');
  $('progress-stage').textContent = 'Enviando o pedido…';
  $('progress-pct').textContent = '';
  $('progress-fill').style.width = '0%';
  $('progress-meta').textContent = '';

  try {
    const { ok, status, data } = await api('/api/render', {
      method: 'POST',
      body: JSON.stringify({ payload: buildPayload(p) }),
    });
    if (!ok || !data || !data.id) throw new Error(friendlyError(status, data));
    const entry = {
      id: data.id,
      titulo: p.cena,
      elenco: p.elenco,
      narracao: p.narracao,
      estilo: p.estilo,
      positivo: p.positivo,
      negativo: p.negativo,
      lora: p.lora,
      loraNome: p.loraNome,
      modo: p.modo,
      proporcao: p.aspect,
      duracao: p.duration,
      steps: p.steps,
      seed: p.seed,
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
    updateOut(entry);
    startPolling(data.id);
  } catch (err) {
    pendente = p;
    statusMotor(false);
    $('job-progress').hidden = true;
    $('out-erro').hidden = false;
    $('out-erro').textContent = 'Aguardando inicialização do motor…';
    toast('Aguardando inicialização do motor…');
  } finally {
    botao.disabled = false;
    botao.innerHTML = original;
  }
}

/* ── polling / saída ────────────────────────────────────── */

function findJob(id) {
  return jobs.find((j) => j.id === id) || null;
}

function updateOut(j) {
  if (j.estado === 'concluido' && j.urlAbs) {
    $('job-progress').hidden = true;
    $('out-erro').hidden = true;
    $('preview-empty').hidden = true;
    $('result-video').hidden = false;
    $('result-video').src = j.urlAbs;
    $('out-actions').hidden = false;
    $('result-download').href = j.urlAbs;
    $('result-download').setAttribute('download', j.nome || 'estudio-reis.mp4');
    $('result-meta').textContent = [j.proporcao, j.duracao + 's', `steps ${j.steps || ''}`, dataBr(j.criadoEm)].join(' · ');
    return;
  }

  $('result-video').hidden = true;
  $('preview-empty').hidden = false;
  $('out-actions').hidden = true;
  $('out-erro').hidden = true;
  $('job-progress').hidden = false;
  $('progress-bar').classList.remove('indeterminate');

  const final = j.estado === 'erro' || j.estado === 'cancelado';
  if (final) {
    $('progress-stage').textContent = (ESTADOS[j.estado] || {}).label || j.estado;
    $('progress-pct').textContent = '';
    $('progress-fill').style.width = j.estado === 'cancelado' ? '0%' : '100%';
    $('progress-meta').textContent = '';
    if (j.estado === 'erro') {
      $('out-erro').hidden = false;
      $('out-erro').textContent = j.erro || 'O motor não concluiu. Tente novamente.';
    }
    return;
  }

  const pct = Math.max(0, Math.min(100, Number(j.progresso) || 0));
  $('progress-stage').textContent = j.etapa || (j.estado === 'na-fila' ? 'Na fila…' : 'Gerando…');
  $('progress-pct').textContent = j.estado === 'na-fila' ? 'na fila' : pct + '%';
  $('progress-fill').style.width = (j.estado === 'na-fila' ? 6 : pct) + '%';
  $('progress-meta').textContent = `${j.proporcao} · ${j.duracao}s · steps ${j.steps || ''}`;
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
        updateOut(j);
      }
      return;
    }
    j.estado = data.estado || j.estado;
    j.progresso = data.progresso;
    j.etapa = data.etapa;
    if (data.saida) {
      j.urlAbs = apiBase() + data.saida.url;
      j.nome = data.saida.nome || '';
    }
    if (data.erro) j.erro = data.erro;
    persistJobs();
    if (j.estado === 'concluido' || j.estado === 'erro' || j.estado === 'cancelado') {
      stopPolling();
      activeId = null;
    }
    updateOut(j);
  } catch {
    j.etapa = 'Reconectando ao motor…';
    updateOut(j);
  }
}

async function cancelJob() {
  if (!activeId) return;
  const id = activeId;
  stopPolling();
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
    updateOut(j);
  }
  activeId = null;
}

/* ── biblioteca ─────────────────────────────────────────── */

function dataBr(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderLibrary() {
  const grade = $('lib-grade');
  grade.replaceChildren();
  $('lib-count').textContent = jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'criação' : 'criações'}` : '';

  if (!jobs.length) {
    const v = document.createElement('div');
    v.className = 'vazio';
    v.innerHTML =
      '<div class="big" aria-hidden="true">🎬</div><h3>Nada por aqui ainda</h3>' +
      '<p>Monte o roteiro, ajuste os parâmetros e toque em “Criar Vídeo”.</p>';
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
        $('cena').value = j.titulo || '';
        if (Array.isArray(j.elenco)) {
          j.elenco.forEach((e, i) => {
            if (!charState[i]) return;
            charState[i].nome = e.nome || '';
            charState[i].papel = e.papel || charState[i].papel;
            charState[i].desc = e.desc || '';
            charState[i].consistencia = e.consistencia || 'consistente';
          });
          montarElenco();
        }
        $('narracao').value = j.narracao || '';
        $('estilo').value = j.estilo || 'realista';
        $('positivo').value = j.positivo || '';
        $('negativo').value = j.negativo || NEGATIVE;
        $('lora').value = j.lora || '';
        $('lora-nome').value = j.loraNome || '';
        setAspect(j.proporcao || '16:9');
        $('duration').value = String(j.duracao || 5);
        $('steps').value = String(j.steps || 8);
        $('seed').value = j.seed ? String(j.seed) : '';
        atualizarReadout();
        setMode('canvas');
        window.scrollTo({ top: 0 });
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
  updateOut(j);
  setMode('canvas');
  window.scrollTo({ top: 0 });
}

/* ── login unificado ────────────────────────────────────── */

function showLogin() {
  stopPolling();
  activeId = null;
  $('login').hidden = false;
  $('login-erro').textContent = '';
  $('login-pass').value = '';
  if (!$('login-email').value) $('login-email').value = LOGIN_EMAIL;
  setTimeout(() => $('login-pass').focus(), 60);
}

function showLanding() {
  stopPolling();
  activeId = null;
  $('login').hidden = true;
  $('app-shell').hidden = true;
  $('view-landing').hidden = false;
  statusMotor(Boolean(motor));
  window.scrollTo(0, 0);
}

function boot() {
  $('login').hidden = true;
  $('view-landing').hidden = true;
  $('app-shell').hidden = false;
  if (!$('negativo').value.trim()) $('negativo').value = NEGATIVE;
  montarElenco();
  montarVozes();
  setMode('chat');
  statusMotor(Boolean(motor));
  atualizarReadout();
  renderLibrary();

  const plano = sessionStorage.getItem('er.plano.pendente');
  if (plano) {
    sessionStorage.removeItem('er.plano.pendente');
    setTimeout(() => toast(`Plano ${plano} selecionado. Finalize no gateway.`), 600);
  }
  const estilo = sessionStorage.getItem('er.estilo.pendente');
  if (estilo) {
    sessionStorage.removeItem('er.estilo.pendente');
    $('estilo').value = estilo;
    setMode('canvas');
  }
}

function gravarSessao(email) {
  const dados = JSON.stringify({ email, em: new Date().toISOString() });
  try { localStorage.setItem(KEY_SESSION, dados); } catch {}
  try { sessionStorage.setItem(KEY_SESSION, dados); } catch {}
}
function lerSessao() {
  try {
    return localStorage.getItem(KEY_SESSION) || sessionStorage.getItem(KEY_SESSION);
  } catch {
    return null;
  }
}

/* ── eventos ────────────────────────────────────────────── */

$('mode-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) setMode(b.dataset.mode);
});

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  enviarChat($('chat-text').value);
});
$('chat-text').addEventListener('input', autoGrowChat);
$('chat-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviarChat($('chat-text').value);
  }
});
$('chat-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-prompt]');
  if (b) enviarChat(b.dataset.prompt.trim());
});

$('btn-create').addEventListener('click', create);
$('job-cancel').addEventListener('click', cancelJob);
$('result-again').addEventListener('click', () => {
  $('result-video').pause();
  $('result-video').hidden = true;
  $('result-video').removeAttribute('src');
  $('preview-empty').hidden = false;
  $('out-actions').hidden = true;
  $('out-erro').hidden = true;
  $('job-progress').hidden = true;
  $('cena').focus();
});

$('btn-library').addEventListener('click', () => {
  if ($('view-canvas').hidden) setMode('canvas');
  setTimeout(() => {
    renderLibrary();
    $('library').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 320);
});

$('btn-logout').addEventListener('click', () => {
  try { localStorage.removeItem(KEY_SESSION); } catch {}
  try { sessionStorage.removeItem(KEY_SESSION); } catch {}
  if (motorTimer) clearInterval(motorTimer);
  showLanding();
});

$('ref-add').addEventListener('click', () => $('ref-input').click());
$('ref-remove').addEventListener('click', () => {
  setRef(null);
  $('ref-input').value = '';
  $('ref-status').textContent = '';
});
$('ref-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('ref-status').textContent = 'Preparando…';
  try {
    setRef(await prepareImage(file));
  } catch (err) {
    $('ref-status').textContent = err.message || 'Não consegui usar a imagem.';
  }
});

$('modo').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-modo]');
  if (!b) return;
  modo = b.dataset.modo;
  [...$('modo').children].forEach((x) => x.classList.toggle('on', x === b));
  $('ref-drop').hidden = modo !== 'i2v';
  setTimeout(desenharConexoes, 50);
});

$('aspect').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-val]');
  if (b) setAspect(b.dataset.val);
});
function setAspect(v) {
  aspect = v;
  [...$('aspect').children].forEach((x) => x.classList.toggle('on', x.dataset.val === v));
  atualizarReadout();
}

$('duration').addEventListener('change', atualizarReadout);
$('steps').addEventListener('change', atualizarReadout);
$('voz-ouvir').addEventListener('click', ouvirNarracao);
$('voz-parar').addEventListener('click', pararNarracao);
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = montarVozes;
}

window.addEventListener('resize', () => {
  clearTimeout(window.__erResize);
  window.__erResize = setTimeout(desenharConexoes, 120);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) cicloMotor();
});
window.addEventListener('focus', cicloMotor);
window.addEventListener('beforeunload', persistJobs);

/* ── landing / preços ───────────────────────────────────── */

$('btn-login-top').addEventListener('click', showLogin);
$('btn-start').addEventListener('click', () => (lerSessao() ? boot() : showLogin()));
$('btn-start-2').addEventListener('click', () => (lerSessao() ? boot() : showLogin()));

document.querySelectorAll('[data-estilo]').forEach((b) => {
  b.addEventListener('click', () => {
    const estilo = b.dataset.estilo;
    if (!lerSessao()) {
      sessionStorage.setItem('er.estilo.pendente', estilo);
      showLogin();
      return;
    }
    $('estilo').value = estilo;
    setMode('canvas');
    setTimeout(() => $('cena').focus(), 400);
  });
});

document.querySelectorAll('[data-plano]').forEach((b) => {
  b.addEventListener('click', () => {
    const plano = b.dataset.plano;
    if (!lerSessao()) {
      sessionStorage.setItem('er.plano.pendente', plano);
      showLogin();
      return;
    }
    toast(`Plano ${plano} selecionado. Finalize no gateway.`);
  });
});

const brandApp = document.querySelector('#app-shell .brand');
if (brandApp) brandApp.addEventListener('click', (e) => { e.preventDefault(); showLanding(); });

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim().toLowerCase();
  const pass = $('login-pass').value.trim();
  if (email !== LOGIN_EMAIL) {
    $('login-erro').textContent = 'E-mail não autorizado. Use a conta unificada do Grupo Reis.';
    return;
  }
  if (pass !== LOGIN_PASSWORD) {
    $('login-erro').textContent = 'Senha incorreta. Confira e tente novamente.';
    return;
  }
  gravarSessao(email);
  $('login-pass').value = '';
  $('login-erro').textContent = '';
  boot();
});

iniciarDescoberta();
if (lerSessao()) {
  boot();
} else {
  showLanding();
}