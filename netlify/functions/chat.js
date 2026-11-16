'use strict';

// Estúdio Reis · proxy de IA conversacional (Netlify Function).
//
// A chave NUNCA vai para o front-end. Ela vive nas variáveis de ambiente do site:
//   AI_API_KEY     (ou GROQ_API_KEY / LLAMA_API_KEY)
//   AI_BASE_URL    padrão: https://api.groq.com/openai/v1
//   AI_MODEL       padrão: llama-3.3-70b-versatile
//
// O front-end chama POST /.netlify/functions/chat com { messages: [...] }.
// Resposta: { ok:true, reply, roteiro } ou { ok:false, reason }.

const DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

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

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, reason: 'method' });
  }

  const key = process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (!key) {
    return json(200, { ok: false, reason: 'no_key' });
  }

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

  const base = (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.7,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json(200, { ok: false, reason: 'upstream', status: res.status, detail: detail.slice(0, 200) });
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
      const r = parsed.roteiro && typeof parsed.roteiro === 'object' ? parsed.roteiro : {};
      return json(200, {
        ok: true,
        reply: parsed.reply.slice(0, 4000),
        roteiro: {
          cena: typeof r.cena === 'string' ? r.cena.slice(0, 1200) : '',
          protagonista: typeof r.protagonista === 'string' ? r.protagonista.slice(0, 120) : '',
          antagonista: typeof r.antagonista === 'string' ? r.antagonista.slice(0, 120) : '',
          estilo: typeof r.estilo === 'string' ? r.estilo : '',
        },
      });
    }

    return json(200, { ok: true, reply: String(raw).slice(0, 4000), roteiro: null });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err && err.name === 'AbortError';
    return json(200, { ok: false, reason: aborted ? 'timeout' : 'network' });
  }
};