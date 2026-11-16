# Changelog — Estúdio Reis Atualizado

Formato: Keep a Changelog · Versões seguem `version.json` (a build de número MAIOR é a soberana).

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