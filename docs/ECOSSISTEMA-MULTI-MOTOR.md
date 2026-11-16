# Estúdio Reis — Relatório de Varredura Multi-Motor (GitHub)

**Data:** 2026-11-16 · **Build alvo:** v2.5.0 (250)
**Método:** varredura com `gh search repos` (GitHub CLI, conta `renatosfcontador-ops`) nas
categorias Vídeo, Voz/Áudio, Imagem/Render e Consistência de Personagens. Abaixo, o que cada
repositório entrega e **o que absorver** no Estúdio Reis. Licenças mudam: **confira o LICENSE de
cada repositório antes de incorporar código/pesos**.

---

## 1. Vídeo (motor de renderização)

| Repositório | URL | O que absorver |
|---|---|---|
| **Wan-Video/Wan2.1** | https://github.com/Wan-Video/Wan2.1 | Base já integrada (T2V/I2V, 1.3B/14B). Fonte dos parâmetros (frames 4k+1, steps, CFG). |
| **Comfy-Org/ComfyUI** | https://github.com/Comfy-Org/ComfyUI | Grafo de nós e backend que o `estudio-reis-motor-wan` já fala via HTTP. |
| **comfyanonymous/ComfyUI_examples** | https://github.com/comfyanonymous/ComfyUI_examples | Workflows de referência (Wan, AnimateDiff, upscale). |
| **ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO** | https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO | Biblioteca de grafos prontos para novos nós. |
| **wlfeng0509/Q-VDiT** | https://github.com/wlfeng0509/Q-VDiT | Quantização/distilação de DiT de vídeo (custo/latência em GPU). |
| **lusinlu/Video-Generation-for-Human-Avatars** | https://github.com/lusinlu/Video-Generation-for-Human-Avatars | Avatares falantes (base para locução/animação de personagem). |

## 2. Voz / Áudio (TTS e clonagem)

| Repositório | URL | O que absorver |
|---|---|---|
| **myshell-ai/OpenVoice** | https://github.com/myshell-ai/OpenVoice | Clonagem instantânea de voz + conversão de timbre. |
| **RVC-Boss/GPT-SoVITS** | https://github.com/RVC-Boss/GPT-SoVITS | Few-shot voice cloning (poucos minutos de áudio). |
| **k2-fsa/OmniVoice** | https://github.com/k2-fsa/OmniVoice | TTS de alta qualidade para 600+ idiomas. |
| **index-tts/index-tts** | https://github.com/index-tts/index-tts | Zero-shot TTS controlável (tom/velocidade). |
| **rhasspy/piper** | https://github.com/rhasspy/piper | TTS neural local, rápido e leve (bom para preview). |
| **OHF-Voice/piper1-gpl** | https://github.com/OHF-Voice/piper1-gpl | Fork ativo do Piper. |
| **k2-fsa/sherpa-onnx** | https://github.com/k2-fsa/sherpa-onnx | TTS/ASR com ONNX Runtime, offline, multiplataforma. |
| **CorentinJ/Real-Time-Voice-Cloning** | https://github.com/CorentinJ/Real-Time-Voice-Cloning | Clonagem em tempo real (referência de latência). |
| **KoljaB/RealtimeTTS** | https://github.com/KoljaB/RealtimeTTS | Camada unificada de TTS em tempo real. |

> **No Estúdio Reis v2.5.0:** o nó **Voz / Narração** já usa a **Web Speech API** do navegador
> (preview local, zero backend) e inclui a narração no roteiro (`roteiro.narracao`) para o motor.
> A clonagem real (OpenVoice/GPT-SoVITS) entra como worker opcional na GPU.

## 3. Imagem / Render

| Repositório | URL | O que absorver |
|---|---|---|
| **Comfy-Org/ComfyUI** | https://github.com/Comfy-Org/ComfyUI | Mesmo backend para imagem (SDXL/Flux/Wan T2I). |
| **AUTOMATIC1111/stable-diffusion-webui** | https://github.com/AUTOMATIC1111/stable-diffusion-webui | UI/pipelines de imagem e inpainting. |
| **lllyasviel/stable-diffusion-webui-forge** | https://github.com/lllyasviel/stable-diffusion-webui-forge | Otimizações de VRAM/qualidade para webui. |
| **CompVis/stable-diffusion** | https://github.com/CompVis/stable-diffusion | Modelo base de difusão latente. |
| **tencent-ailab/IP-Adapter** | https://github.com/tencent-ailab/IP-Adapter | Adapter de prompt por imagem (referência visual). |
| **atfortes/Awesome-Controllable-Diffusion** | https://github.com/atfortes/Awesome-Controllable-Diffusion | Catálogo de controle (ControlNet, IP-Adapter, DreamBooth). |

## 4. Consistência de Personagem (multi-ângulo, Face LoRA prep)

| Repositório | URL | O que absorver |
|---|---|---|
| **18yz153/ComfyUI-Persona-Director** | https://github.com/18yz153/ComfyUI-Persona-Director | Agente de consistência de personagem em workflows SD. |
| **wonderstone843/character-consistency-ai** | https://github.com/wonderstone843/character-consistency-ai | Geração por referência (consistência entre 100+ imagens). |
| **Comic-AI/Character-Consistency** | https://github.com/Comic-AI/Character-Consistency | Pipeline de consistência para quadrinhos/HQs. |
| **tencent-ailab/IP-Adapter** | https://github.com/tencent-ailab/IP-Adapter | Referência de identidade/estilo. |
| **lucataco/cog-IP-Adapter-FaceID** | https://github.com/lucataco/cog-IP-Adapter-FaceID | Wrapper FaceID (rosto consistente). |
| **MarekKowalski/FaceSwap** | https://github.com/MarekKowalski/FaceSwap | Face swap 3D (supressão/consistência facial). |
| **YouMind-OpenLab/awesome-seedance-2-prompts** | https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts | Prompts e dicas de consistência/continuidade. |

> **No Estúdio Reis v2.5.0:** o **Elenco** do Canvas já implementa **1–5 personagens** com
> **7 ângulos** por personagem (frente, costas, perfil esq./dir., cima, baixo e close nos olhos).
> As imagens ficam no navegador; o **primeiro plano frontal do protagonista** vira a referência
> I2V (`referenciaBase64`) automaticamente.

---

## 5. O que foi incorporado nesta build

1. **Elenco 1–5** com cards expansíveis e slots multi-ângulo (7 por personagem).
2. **Voz / Narração** com preview TTS local (Web Speech) e envio do roteiro ao motor.
3. **Descoberta multi-engine**: `motor.json` passa a aceitar `engines[]` (fallback entre motores).
4. **Status híbrido em tempo real**: “Modo híbrido · chat ativo · mm:ss”, sem travar o chat.
5. **Chat em cascata** (Groq → OpenRouter → HuggingFace → OpenAI → Gemini), já entregue.

## 6. Próximos passos sugeridos

- **Voz real (serverless)**: função `/.netlify/functions/tts` com Piper/OpenVoice na GPU.
- **Consistência**: worker de Image-to-Image com IP-Adapter/FaceID a partir dos 7 ângulos.
- **Múltiplos motores em paralelo**: registro de `engines[]` no `motor.json` pelo notebook.
- **Licenças**: revisar Apache-2.0 / MIT / GPL-3.0 de cada repositório antes de bundlar.