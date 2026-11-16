'use strict';

// Estúdio Reis · chat com cascata multi-motor (Netlify Function).
//
// Estratégia Chain of Responsibility: tenta provedores em ordem, do mais barato/rápido
// ao premium, e devolve o primeiro que responder. A chave NUNCA vai para o front-end.
//
// Variáveis de ambiente (todas opcionais; sem chave, o provedor é pulado):
//   Nível 1 (gratuitos/rápidos)
//     GROQ_API_KEY          + AI_GROQ_MODEL          (padrão llama-3.3-70b-versatile)
//     OPENROUTER_API_KEY    + AI_OPENROUTER_MODEL    (padrão meta-llama/llama-3.3-70b-instruct:free)
//     AI_API_KEY            (alias genérico de GROQ_API_KEY)
//   Nível 2 (apoio leve)
//     HF_API_KEY            + AI_HF_MODEL            (padrão meta-llama/Llama-3.3-70B-Instruct)
//   Nível 3 (premium)
//     OPENAI_API_KEY        + AI_OPENAI_MODEL        (padrão gpt-4o-mini)
//     GEMINI_API_KEY        + AI_GEMINI_MODEL        (padrão gemini-2.0-flash)
//
// Bases configuráveis: AI_GROQ_BASE_URL, AI_OPENROUTER_BASE_URL, AI_HF_BASE_URL,
//                      AI_OPENAI_BASE_URL, AI_GEMINI_BASE_URL.

const env = (k, d) => (process.env[k] ? String(process.env[k]) : d);

const PROVIDERS = [
  {
    name: 'groq',
    tier: 1,
    baseUrl: env('AI_GROQ_BASE_URL', 'https://api.groq.com/openai/v1'),
    key: env('GROQ_API_KEY', env('AI_API_KEY', '')),
    model: env('AI_GROQ_MODEL', 'llama-3.3-70b-versatile'),
    timeout: 18000,
  },
  {
    name: 'openrouter',
    tier: 1,
    baseUrl: env('AI_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
    key: env('OPENROUTER_API_KEY', ''),
    model: env('AI_OPENROUTER_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'),
    timeout: 20000,
  },
  {
    name: 'huggingface',
    tier: 2,
    baseUrl: env('AI_HF_BASE_URL', 'https://router.huggingface.co/v1'),
    key: env('HF_API_KEY', env('HUGGINGFACE_API_KEY', '')),
    model: env('AI_HF_MODEL', 'meta-llama/Llama-3.3-70B-Instruct'),
    timeout: 22000,
  },
  {
    name: 'openai',
    tier: 3,
    baseUrl: env('AI_OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    key: env('OPENAI_API_KEY', ''),
    model: env('AI_OPENAI_MODEL', 'gpt-4o-mini'),
    timeout: 20000,
  },
  {
    name: 'gemini',
    tier: 3,
    baseUrl: env('AI_GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta/openai'),
    key: env('GEMINI_API_KEY', env('GOOGLE_API_KEY', '')),
    model: env('AI_GEMINI_MODEL', 'gemini-2.0-flash'),
    timeout: 20000,
  },
];

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = [
  'Você é o assistente do Estúdio Reis (Grupo Reis), especialista em roteiro e geração de vídeo com Wan2.1.',
  'Responda SEMPRE em português do Brasil, com tom consultivo profissional, claro e objetivo.',
  'Ajude a estruturar a ideia, tire dúvidas e crie prompts ricos. Use linhas curtas e marcadores • quando ajudar.',
  'Responda APENAS um JSON válido, sem markdown, neste formato:',
  '{"reply":"resposta ao usuário","roteiro":{"cena":"descrição da cena em uma frase rica","protagonista":"nome ou vazio","antagonista":"nome ou vazio","estilo":"realista|cinematografico|animacao_3d|anime|cyberpunk"}}',
  'Se a mensagem não for um pedido de vídeo, mantenha os campos de "roteiro" vazios e responda normalmente.',
  'Não invente dados técnicos nem parâmetros que não existam.',
].join(' ');

const json = (statusCode, body) => ({ statusCode, headers: HEADERS, body: JSON.stringify(body) });

function normalizarRoteiro(r) {
  const o = r && typeof r === 'object' ? r : {};
  const estilo = typeof o.estilo === 'string' ? o.estilo : '';
  const validos = ['realista', 'cinematografico', 'animacao_3d', 'anime', 'cyberpunk'];
  return {
    cena: typeof o.cena === 'string' ? o.cena.slice(0, 1200) : '',
    protagonista: typeof o.protagonista === 'string' ? o.protagonista.slice(0, 120) : '',
    antagonista: typeof o.antagonista === 'string' ? o.antagonista.slice(0, 120) : '',
    estilo: validos.includes(estilo) ? estilo : 'realista',
  };
}

async function chamarProvedor(p, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), p.timeout || 20000);
  try {
    const res = await fetch(`${p.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 160)}`);
    }
    const data = await res.json();
    const raw = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
      return { reply: parsed.reply.slice(0, 4000), roteiro: normalizarRoteiro(parsed.roteiro) };
    }
    if (raw && String(raw).trim()) {
      return { reply: String(raw).slice(0, 4000), roteiro: null };
    }
    throw new Error('resposta vazia');
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, reason: 'method' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, reason: 'json' });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return json(400, { ok: false, reason: 'empty' });
  }

  const tentativas = [];
  const provedoresAtivos = PROVIDERS.filter((p) => p.key);

  if (!provedoresAtivos.length) {
    return json(200, { ok: false, reason: 'no_key', provedores: PROVIDERS.map((p) => p.name) });
  }

  for (const p of provedoresAtivos) {
    const inicio = Date.now();
    try {
      const r = await chamarProvedor(p, messages);
      const ms = Date.now() - inicio;
      console.log(`[chat] provedor=${p.name} tier=${p.tier} ${ms}ms`);
      tentativas.push({ provedor: p.name, tier: p.tier, status: 'ok', ms });
      return json(200, {
        ok: true,
        reply: r.reply,
        roteiro: r.roteiro,
        provedor: p.name,
        tier: p.tier,
        tentativas,
      });
    } catch (err) {
      const ms = Date.now() - inicio;
      const motivo = String((err && err.message) || err).slice(0, 200);
      console.log(`[chat] provedor=${p.name} tier=${p.tier} falhou ${ms}ms: ${motivo}`);
      tentativas.push({ provedor: p.name, tier: p.tier, status: 'erro', ms, motivo });
    }
  }

  return json(200, { ok: false, reason: 'all_failed', tentativas });
};