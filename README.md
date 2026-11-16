# Estúdio Reis — interface (Wan2.1)

Interface web do **Estúdio Reis**, sóbria e minimalista (inspirada na clareza do Qwen):
descreva a cena, toque em **Criar Vídeo** e acompanhe o render na nuvem em tempo real.

Esta pasta é **só o front-end estático**. A GPU, os pesos e a fila ficam no
[`estudio-reis-motor-wan`](https://github.com/renatosfcontador-ops/estudio-reis-motor-wan)
(serviço Wan + ComfyUI), que expõe o contrato `POST /api/render` → `GET /api/render/{id}`
→ `/files/{nome}.mp4`.

## Rodar localmente

Não há build. Basta servir a pasta com qualquer servidor estático:

```bash
npx serve .
# ou: python -m http.server 8080
```

Abra a URL e, em **Configurações**, informe o endereço do motor (ex.: o túnel
`trycloudflare` do Kaggle). O token é opcional e fica só no navegador.

## Publicar no Netlify

- **Arrastar e soltar**: `netlify deploy --prod --dir .` (netlify-cli), ou
  arraste a pasta no painel do Netlify.
- Build: nenhum. Publish directory: `.`.
- O `netlify.toml` já traz o fallback SPA (`_redirects`) e os headers de segurança.

## Como o pedido vira vídeo

1. O navegador monta o `payload` (prompt + estilo, proporção, duração, referência).
2. `POST /api/render` → `202 { id }`.
3. `GET /api/render/{id}` a cada 2 s → `progresso` e `etapa`.
4. Ao concluir, o player aponta para `/files/{id}.mp4` (com download).

## Referência (imagem → vídeo)

A imagem anexada é reduzida no navegador (JPEG, até ~650 KB) e enviada em
`referenciaBase64` (`data:image/...;base64,...`). O motor faz o upload para o
ComfyUI e usa como quadro inicial (I2V). Modelos sem suporte a referência
(ex.: Wan2.1 T2V 1.3B) simplesmente a ignoram.

## Retenção de 24 h

O motor aplica `MOTOR_RETENCAO_HORAS=24` por padrão: o MP4 gerado é apagado 24 h
após a conclusão (“quem salvou, salvou; quem não salvou, apaga”). O front-end
guarda apenas o **histórico de metadados** no `localStorage` do navegador — nunca
os arquivos de vídeo.

## Estrutura

```
estudio-reis-atualizacao/
├── index.html          # login, marca, compositor e vistas (boas-vindas, job, biblioteca)
├── assets/
│   ├── styles.css      # tema neutro claro/escuro, sem neon
│   └── app.js          # login, fila/polling, referência, biblioteca, configurações
├── brand/              # enxoval de marca oficial (importado do studio-reis-canvas)
│   ├── logo/  isotipo/  icons/  banners/ 3d/
│   ├── css/studio-reis-theme.css
│   └── manifest.webmanifest
├── version.json        # build soberana (BUILD_NUMBER)
├── CHANGELOG.md
├── netlify.toml        # publish, redirects e headers
├── _redirects
└── README.md
```

## Marca e login

- **Marca**: o diretório `brand/` oficial do `studio-reis-canvas` foi unificado aqui
  (logos, isotipo 3D, banners, ícones e manifesto). O cabeçalho e o login usam o isotipo
  oficial; favicon e manifesto apontam para `brand/`.
- **Login unificado** (padrão Grupo Reis): `renato.sf.contador@gmail.com` + a senha do
  ecossistema. A sessão fica no `localStorage` e pode ser encerrada em **Configurações**.
  O login é um portão do lado do cliente — a autoridade real deve ser exercida pelo motor/engine.

## Build

- `version.json` — a build de número **MAIOR** é a soberana. Consolidação atual: `v2.0.0`
  (build 200). Histórico em `CHANGELOG.md`.

## Segurança

- Token do motor apenas em `localStorage`; nunca versionado.
- Nenhuma chave de provedor no cliente — o navegador fala só com o seu motor.
- Headers `nosniff`, `SAMEORIGIN`, `no-referrer` e `Permissions-Policy` no Netlify.

## Licença

Código: Apache-2.0. Pesos Wan2.1/Wan2.2: Apache-2.0 (© Alibaba Wan Team).