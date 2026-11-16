# Changelog — Estúdio Reis Atualizado

Formato: Keep a Changelog · Versões seguem `version.json` (a build de número MAIOR é a soberana).

## [2.6.0] — build 260 — 2026-11-16

### Adicionado
- **Tela inicial pública (Landing & Preços)** antes do app:
  - Cabeçalho de boas-vindas + status do motor.
  - Hero “Vídeos com IA, do roteiro à tela” + CTAs.
  - Vitrine de estilos (Realista, 3D, Anime, Cyberpunk) com “Criar neste estilo”.
  - **Tabela dolarizada de 8 planos** (USD): Starter $6, Comerciante $16, Estúdio $35, Pro $60,
    Master Top $100, Business Elite $200, Anual Ilimitado Pro VIP $400, Platina Vitalício $999.
  - Destaques “Mais completo” (Anual) e “Vitalício” (Platina); botões “Comprar créditos”/
    “Assinar Plano”; link discreto de **WhatsApp** sem travar o fluxo.
  - “Como funciona” + CTA final.
- **Fluxo**: Landing → Login unificado → Chat (“Como posso ajudar?”) → Canvas.
  O botão do plano/showcase leva ao login e retoma a ação pendente.
- **Preços** no rodapé e no botão do plano (gateway a configurar).

### Alterado
- `version.json` → `v2.6.0` (build 260). Assets `?v=260`.
- Login overlay agora é sob demanda (a landing abre direto).

## [2.5.0] — build 250 — 2026-11-16

### Adicionado
- **Elenco 1–5 personagens** no Canvas: cards expansíveis com nome, papel (protagonista/antagonista/
  apoio), traços/roupa, consistência e **7 ângulos de referência** por personagem (frente, costas,
  perfil esquerdo/direito, cima, baixo e close nos olhos).
- **Voz / Narração**: painel com TTS de prévia (Web Speech API), seleção de voz e velocidade; a
  narração entra em `roteiro.narracao` e é enviada ao motor.
- **Descoberta multi-engine**: `motor.json` aceita `engines[]`; o front-end usa o primeiro motor
  disponível e mostra a contagem.
- **Status híbrido em tempo real**: “Modo híbrido · chat ativo · mm:ss” (sem mensagem estática).
- **Relatório de varredura** `docs/ECOSSISTEMA-MULTI-MOTOR.md` (vídeo, voz, imagem, consistência).

### Alterado
- Payload agora inclui `elenco[]`, `roteiro.narracao` e usa o 1º plano frontal do protagonista como
  referência I2V.
- `version.json` → `v2.5.0` (build 250). Assets `?v=250`.

## [2.4.0] — build 240 — 2026-11-16

### Adicionado
- **Cascata multi-motor (Chain of Responsibility)** na função `/.netlify/functions/chat`:
  - **Nível 1** (gratuito/rápido): **Groq** (Llama) → **OpenRouter** (modelos free).
  - **Nível 2** (apoio leve): **HuggingFace Router**.
  - **Nível 3** (premium): **OpenAI** (GPT) → **Gemini**.
  - Cada provedor tem `timeout` próprio; falhas/timeouts alternam automaticamente; a resposta
    informa `provedor`, `tier` e `tentativas`.
- **Status híbrido sem “lenga-lenga”**: com o motor offline, a barra mostra **“Modo híbrido ·
  chat ativo”** (o chat e os prompts continuam funcionando via cascata). “Criar Vídeo” coloca o
  pedido na fila e envia automaticamente quando o motor fica verde.
- **Refresh inteligente**: descoberta imediata ao voltar o foco/aba e ao abrir a janela; o status
  só é re-renderizado quando muda.
- Selo **IA · provedor** nas respostas (transparência do motor usado).

### Segurança
- Chaves apenas no ambiente do Netlify (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HF_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`); nenhuma chave no front-end.

### Corrigido
- **Cache busting**: `styles.css`/`app.js` agora usam `?v=240` (builds 230/240 mantinham `?v=220`
  e o navegador servia o app antigo). O usuário passa a receber o chat com IA e a cascata.

### Alterado
- `version.json` → `v2.4.0` (build 240).

## [2.3.0] — build 230 — 2026-11-16

### Adicionado
- **Chat com IA real** via **Netlify Function** `/.netlify/functions/chat` (serverless): a chave
  fica protegida no servidor (`AI_API_KEY`, ou `GROQ_API_KEY`/`LLAMA_API_KEY`), nunca no front-end.
  - `AI_BASE_URL` (padrão Groq, compatível OpenAI) e `AI_MODEL` configuráveis.
  - A função pede ao modelo um JSON `{reply, roteiro}`; o chat mantém contexto da conversa.
- **Fallback gracioso**: sem chave, timeout ou indisponibilidade → assistente local estruturado
  (o usuário nunca fica sem resposta).
- **“Levar ao Canvas” inteligente**: usa o `roteiro` extraído pela IA (cena, protagonista,
  antagonista, estilo) e preenche os nós automaticamente.
- Selo **IA** nas respostas geradas por modelo.

### Segurança
- Nenhuma chave no bundle do front-end (verificado). A credencial vive só no ambiente do Netlify.
- `netlify.toml` declara `functions.directory`; headers de segurança mantidos.

### Alterado
- `version.json` → `v2.3.0` (build 230).

## [2.2.0] — build 220 — 2026-11-16

### Adicionado
- **Interface dual-mode** com transição fluida: **Chat/Assistente** (estilo Qwen) ↔ **Canvas de
  produção** (nós). Alternador no cabeçalho.
- **Assistente local** no chat: estrutura a ideia em roteiro, explica o Wan2.1, dá dicas de prompt
  e envia a cena para o Canvas com um clique (“Levar ao Canvas”).
- **Canvas enriquecido**: nó Roteiro com subpainéis **Protagonista** (nome, traços, vestimenta,
  consistência), **Antagonista** e **Cena** (descrição, prompt positivo, negativo, estilo,
  modificadores e LoRA); nó Parâmetros com frames calculados (16 fps × s + 1) e resolução.
- **Biblioteca** com reenvio que restaura todos os campos do roteiro.

### Mantido
- Login unificado, sessão persistente, descoberta automática por `motor.json`, status
  verde/âmbar, polling e S3 24h. Nenhum modal de URL/token.

### Alterado
- `version.json` → `v2.2.0` (build 220).

## [2.1.0] — build 210 — 2026-11-16

### Adicionado
- **Workspace em nós (Canvas)** estilo ComfyUI: Roteiro → Parâmetros → Motor Wan2.1 → Preview,
  com conexões SVG animadas e grade de fundo.
- **Nó Roteiro**: protagonista, antagonista, descrição da cena, estilo visual e modificadores/LoRA.
- **Nó Parâmetros**: modo T2V/I2V, proporção (16:9 / 9:16 / 1:1), duração 1–5 s, steps
  (4–20), seed, resolução/quadros calculados e upload de referência (I2V).
- **Nó Motor**: status dinâmico (verde = pronto; âmbar pulsante = aguardando) alimentado por
  `motor.json`; botão **Criar Vídeo** gerencia fila/polling.
- **Nó Preview**: player, progresso, cancelamento, download e metadados.
- **Seed** propagado ao motor (`qualidade.seed`) no `estudio-reis-motor-wan`.

### Corrigido
- Nenhum modal de URL/token — descoberta 100% automática; fallback “Aguardando inicialização do
  motor…” sem bloquear o fluxo.
- Assets versionados `?v=210`.

### Alterado
- `version.json` → `v2.1.0` (build 210).

## [2.0.2] — build 202 — 2026-11-16

### Corrigido
- **Login unificado**: validação direta e sem dependência de `crypto.subtle` (que falhava em
  alguns navegadores/webviews e prendia o usuário na tela de login). Credenciais aceitas:
  `renato.sf.contador@gmail.com` / `Admin@123`.
- E-mail **pré-preenchido** e senha com `trim` (evita falha por espaço acidental).
- **Persistência de sessão** em `localStorage` **e** `sessionStorage` (fallback), liberando a
  interface após o login e mantendo a sessão entre reloads.
- Mensagens de erro mais claras (e-mail não autorizado / senha incorreta).

### Alterado
- `version.json` → `v2.0.2` (build 202).

## [2.0.1] — build 201 — 2026-11-16

### Corrigido
- **Removido o modal de infraestrutura** (URL/token do motor). O usuário final e o Gestor
  nunca veem configuração de túnel, endereço do Kaggle ou token.
- **Descoberta automática do motor (zero fricção)**: o notebook registra o endpoint ativo no
  serviço `estudio-reis-descoberta` (JSON público, renovado a cada 5 min). O front-end lê em
  segundo plano e conecta sozinho.
- **Fallback elegante**: motor offline/iniciando → apenas “Aguardando inicialização do
  motor…”. “Criar Vídeo” fica pendente e é enviado automaticamente quando o motor aparece.
- **Logout** passou para o botão **Sair** no cabeçalho (o modal de configurações foi excluído).

### Alterado
- `version.json` → `v2.0.1` (build 201).

## [2.0.0] — build 200 — 2026-11-16

### Adicionado
- **Base unificada** `estudio-reis-atualizacao` (era um repositório vazio), consolidando o
  `studio-reis-canvas` (marca) e o `estudio-reis-motor-wan` (motor de renderização).
- **Interface sóbria estilo Qwen**: tema neutro claro/escuro automático, tipografia limpa,
  sem cores fluorescentes; marca **Estúdio Reis**.
- **Compositor central "Criar Vídeo"**: campo de prompt fluido, referência de imagem (I2V),
  proporção (16:9 / 9:16 / 1:1), duração (5 s / 10 s) e estilo.
- **Fila e polling** contra o motor Wan: `POST /api/render` → `GET /api/render/{id}` →
  `/files/{nome}.mp4`, com progresso em tempo real, cancelamento e download.
- **Configurações do motor** (URL + token) com teste de conexão (`/healthz`); token só no navegador.
- **Login unificado** do Grupo Reis (`renato.sf.contador@gmail.com`), com sessão persistida e
  encerramento de sessão.
- **Publicação Netlify**: `netlify.toml` + `_redirects` (fallback SPA) e headers de segurança
  (`nosniff`, `SAMEORIGIN`, `no-referrer`, `Permissions-Policy`, `COOP`).
- **Retenção de 24 h** alinhada ao motor (`MOTOR_RETENCAO_HORAS=24`): o MP4 gerado é expirado
  24 h após a conclusão; o front-end guarda apenas metadados no `localStorage`.
- `version.json` e este `CHANGELOG.md`.

### Uni­ficação de marca
- Importado o diretório `brand/` oficial do `studio-reis-canvas` (logos, isotipo 3D, banners,
  ícones, manifesto) para `estudio-reis-atualizacao/brand/`.
- Cabeçalho e login passam a usar o **isotipo oficial**; favicon e manifesto apontam para
  `brand/icons/` e `brand/manifest.webmanifest`.

### Segurança
- Nenhuma chave de provedor no cliente; o navegador fala apenas com o motor configurado.
- Token do motor e sessão apenas em `localStorage`, nunca versionados.

### Observações
- A interface é 100% estática (sem build). O render e os pesos ficam no motor (Kaggle/ComfyUI).
- O login é um portão do lado do cliente (padrão Grupo Reis); a autoridade real deve ser
  exercida pelo motor/engine em produção.