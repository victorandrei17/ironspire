# PROGRESS.md — Iron Spire

> Rastreamento vivo do desenvolvimento. **Atualize ao fim de cada tarefa**, não no fim do dia.
> Uma tarefa só é marcada `[x]` quando passa na *Definition of Done* (CLAUDE.md §7).

---

## Painel

| | |
|---|---|
| **Milestone atual** | M1 — Render e sprites |
| **Última atualização** | 2026-09-03 |
| **Build roda?** | ✅ `npm run build` limpo |
| **FPS medido (throttle 6×, wave 20)** | — (sem waves ainda) |
| **Cobertura `core/` + `data/`** | 40 testes verdes |
| **Bundle gzip** | 3,6 KB / meta 180 KB |
| **Testado em celular real** | ⬜ (validado headless em 412×915 @2x) |

### Legenda
`[ ]` a fazer · `[x]` feito e verificado · `[~]` em andamento · `[!]` bloqueado · `[-]` cancelado (com motivo)

---

## Roadmap

| Milestone | Objetivo | Entregável verificável | Status |
|-----------|----------|------------------------|--------|
| **M0** | Fundação | Canvas escalando, loop fixo, input, overlay de debug | ✅ |
| **M1** | Render + sprites | Torre e um inimigo desenhados **só com placeholders** | ⬜ |
| **M2** | Pools + colisão | 400 inimigos andando a 60 FPS, spatial hash testado | ⬜ |
| **M3** | Combate | Torre atira, acerta, mata, drops aparecem | ⬜ |
| **M4** | **VERTICAL SLICE** | Run completa: waves → upgrades → cartas → morte → resultado | ⬜ |
| **M5** | Meta + save | Núcleos, talentos, offline, save com migração | ⬜ |
| **M6** | Conteúdo | 9 inimigos, 3 bosses, elites, 18 cartas, balanceamento simulado | ⬜ |
| **M7** | Polimento | VFX, áudio, feedback, acessibilidade, degradação automática | ⬜ |
| **M8** | Mobile/loja | APK/IPA instalável, PWA, monetização, fichas de loja | ⬜ |

---

## M0 — Fundação

**Objetivo:** um canvas preto que escala certo em qualquer celular, com loop determinístico e ferramenta de debug. Sem isso, tudo depois é chute.

- [x] `npm create vite` com template `vanilla-ts`; limpar boilerplate
- [x] `tsconfig.json` com todas as flags de CLAUDE.md §4.1
- [x] ESLint + Prettier; script `lint` com `--max-warnings 0`
- [x] Vitest configurado (ambiente `node` para `core`/`data`, `jsdom` para `ui`)
- [x] `index.html`: viewport com `viewport-fit=cover`, `touch-action:none`, `overscroll-behavior:none`, tema escuro
- [x] `src/core/constants.ts` com as constantes canônicas (SPEC §22)
- [x] `src/core/math.ts`: `clamp`, `lerp`, `dist2`, `angleTo`, `approach`, `randRange` — **sem alocação**
- [x] `src/core/rng.ts`: mulberry32 semeado + `int`, `float`, `pick`, `weighted` — **+ teste de reprodutibilidade**
- [x] `src/core/format.ts`: `fmt()` com sufixos K…Dc e depois aa/ab — **+ teste em todas as faixas**
- [x] `src/core/events.ts`: event bus tipado, listeners pré-alocados, sem alocação no `emit`
- [x] `src/core/loop.ts`: timestep fixo com acumulador, `MAX_FRAME`, `MAX_CATCHUP`, alpha de interpolação, `timeScale`
- [x] `src/render/viewport.ts`: cálculo de escala/letterbox, `dpr` limitado a 2, recalculado em `resize`/`orientationchange`
- [x] `src/platform/input.ts`: Pointer Events → fila consumida no tick; suporte a tap, hold e multi-touch; conversão tela→mundo
- [x] `src/platform/lifecycle.ts`: `visibilitychange`, blur/focus → pausa + timestamp
- [x] `src/debug/overlay.ts`: FPS, ms sim, ms render, contagens; toggle por `F3` e por 4 toques
- [x] `src/main.ts`: bootstrap, canvas `{alpha:false}`, loop rodando, fundo com grid procedural
- [~] **Verificação:** abrir no celular via `--host`; girar; entrar/sair do app; nada quebra
      _(validado headless em viewport mobile 412×915 @2x; falta aparelho real)_
- [x] **Verificação:** 60 FPS estável com canvas vazio + overlay

**Critério de aceite:** tela com grid, torre marcada por um círculo, contador de FPS, toque imprime coordenadas de mundo corretas em qualquer resolução.

**Notas:**
```
- Stack instalada: Vite 6, TS 5.9, Vitest 2, ESLint 9 flat config + typescript-eslint
  type-checked. Zero dependências de runtime — package.json só tem devDependencies.
- Playwright entrou como devDependency para o smoke test headless (tools/smoke.mjs):
  sobe o dist, mede FPS, captura erro de console e tira screenshot. É a forma de
  cumprir "roda no navegador sem erro no console" da DoD sem aparelho na mão.
  Aponta para o Chromium pré-instalado do ambiente via CHROMIUM_PATH.
- fmt(): a primeira versão dividia por 1000 num laço e 1e33 saía como "1000No".
  Trocado por log10 + carry quando a mantissa arredonda para 1000. Sufixos pós-Dc
  são aa..zz e depois aaa..zzz (tier 12 = 'aa' = 1e36).
- EventBus é numérico (3 números por evento) de propósito: emit() roda dentro do
  tick e não pode alocar. Payload rico vive no GameState; o evento só avisa.
- off() durante dispatch é adiado — splice no meio da iteração pularia listeners.
- GameLoop não conhece DOM: recebe o timestamp. É o que o deixa testável (7 testes
  cobrindo catch-up, espiral da morte, timeScale e alpha).
- Input é fila SoA circular de 64 eventos: um burst de multi-touch não aloca.
  Overflow descarta o mais antigo (posição velha de ponteiro não vale nada).
- Favicon embutido como data-URI: evita o 404 de /favicon.ico no console.
- FPS medido: 60,2 (sem throttle, canvas com grid + overlay). Console limpo.
```

---

## M1 — Render e sistema de sprites

**Objetivo:** o contrato de sprites (SPEC §13) funcionando **antes** de existir qualquer arte. Este milestone é o que garante que arte entra depois sem retrabalho.

- [ ] `src/render/spriteKeys.manual.ts`: união de keys declaradas à mão
- [ ] `src/render/spriteKeys.gen.ts`: stub que reexporta a manual enquanto não há atlas
- [ ] `src/render/atlas.ts`: parse do JSON de atlas (frames, pivot, trim), seleção `@2x` por dpr
- [ ] `src/render/assetRegistry.ts`: manifest, `createImageBitmap` com fallback, progresso, **falha nunca quebra o jogo**
- [ ] `src/render/placeholders.ts`: `registerPlaceholder(pattern, fn)` com match por prefixo `*`; helpers `poly`, `tri`, `circle`, `rect`, `cross`
- [ ] Placeholders da torre (base, canhão, núcleo) e dos 9 arquétipos, com silhueta e cor de SPEC §5.1
- [ ] `src/render/drawSprite.ts`: resolução atlas → placeholder → magenta + warn único
- [ ] `src/render/digitAtlas.ts`: dígitos e sufixos pré-renderizados em canvas offscreen
- [ ] `src/render/layers.ts`: ordem chão → sombras → pickups → inimigos (sort por Y) → torre → projéteis → VFX → números
- [ ] `src/render/renderer.ts`: `render(alpha)` com interpolação `prev→cur`; `setTransform` em vez de `save/restore`
- [ ] Chão pré-renderizado uma vez em canvas offscreen (grid + vinheta) e blitado
- [ ] `tools/pack-atlas.mjs`: PNGs → atlas (maxrects, padding 2, trim) + `spriteKeys.gen.ts`
- [ ] **Verificação:** rodar com `assets/atlas/` ausente → tudo desenha via placeholder, sem erro
- [ ] **Verificação:** colocar 1 PNG de teste, rodar `npm run atlas`, ver o sprite substituir o placeholder **sem mudar código**

**Critério de aceite:** torre + 3 inimigos parados na tela, todos procedurais, distinguíveis à primeira vista. Um PNG solto na pasta substitui qualquer um deles.

**Notas:**
```
```

---

## M2 — Pools de entidades e colisão

- [ ] `src/core/pool.ts`: base SoA genérica com free-list e `gen` (Uint16Array) contra índice reciclado
- [ ] `src/entities/enemyPool.ts` (cap 400) — hot data em `Float32Array`
- [ ] `src/entities/projectilePool.ts` (cap 800)
- [ ] `src/entities/particlePool.ts` (cap 1200)
- [ ] `src/entities/pickupPool.ts` (cap 300)
- [ ] `src/entities/damageNumberPool.ts` (cap 120)
- [ ] `src/entities/tower.ts`: stats em camadas (base/flat/percent/mult) e recomputação sob demanda, não por frame
- [ ] `src/core/spatialHash.ts`: grid 64 u, counting sort com arrays pré-alocados, **zero alocação por rebuild**
- [ ] `src/systems/movement.ts`: integração + `prevX/prevY` para interpolação
- [ ] `src/systems/ai.ts`: seek ao centro + separação suave usando vizinhos do grid
- [ ] Spawner de teste: 400 inimigos no anel, convergindo
- [ ] **Teste:** fuzz do spatial hash contra força bruta (10⁴ casos)
- [ ] **Teste:** fuzz do pool — 10⁶ spawn/kill, free-list e `count` íntegros
- [ ] **Verificação de perf:** 400 inimigos andando, throttle 6×, FPS registrado abaixo
- [ ] **Verificação de GC:** heap plano por 5 min

**Critério de aceite:** 400 inimigos convergindo suavemente a 60 FPS sem serrilhado de GC.

**FPS medido:** `—`

**Notas:**
```
```

---

## M3 — Combate

- [ ] `src/data/enemies.ts`: os 9 `EnemyDef` de SPEC §5.1 (só dados)
- [ ] `src/systems/targeting.ts`: 5 políticas, 10 Hz, alvo pegajoso, consulta pelo grid
- [ ] `src/systems/weapons.ts`: cadência, leque de múltiplos projéteis, spawn de projétil
- [ ] `src/systems/projectiles.ts`: movimento, swept test segmento-círculo, pierce, despawn
- [ ] `src/systems/damage.ts`: **fila de dano** — crítico, camadas de stat, redução, lifesteal, morte
- [ ] Estados de inimigo: `SEEK → ATTACK` (melee) / `APPROACH → SHOOT` (ranged) com projétil inimigo
- [ ] Dano na torre + i-frames de 0,25 s + flash de tela + shake
- [ ] Morte: partículas, som enfileirado, drop de ouro/XP
- [ ] `src/systems/rewards.ts`: pickups com ímã (`pickupRadius`), auto-coleta
- [ ] `src/systems/status.ts`: slow, freeze, burn — como bitflags + timers em typed arrays
- [ ] Números de dano flutuantes via `digitAtlas`
- [ ] `src/systems/camera.ts`: trauma/shake com decaimento quadrático
- [ ] **Teste:** cálculo de dano — ordem de camadas, crít, cap de lifesteal, sem NaN
- [ ] **Teste:** projétil rápido não atravessa inimigo pequeno (swept test)
- [ ] **Verificação de perf:** 250 inimigos + 400 projéteis, throttle 6×

**Critério de aceite:** torre mata inimigos, ouro cai e é coletado, tomar dano é legível e sentido.

**FPS medido:** `—`

**Notas:**
```
```

---

## M4 — VERTICAL SLICE (run completa)

> 🎯 **Este é o marco que o cliente joga.** Ao fim dele, existe um jogo.

- [ ] `src/data/balance.ts`: objeto `BAL` completo de SPEC §6.2
- [ ] `src/data/waves.ts`: tabela de pesos por wave, interpolação entre âncoras, os 5 padrões (RING/ARC/PINCER/TRICKLE/RUSH)
- [ ] `src/systems/spawner.ts`: gera a composição da wave com PRNG semeado por `runSeed ^ wave`
- [ ] `src/systems/waves.ts`: início/fim de wave, gap de 2 s, botão "próxima wave" com +15% de ouro
- [ ] `src/data/upgrades.ts`: os 8 upgrades com base/growth
- [ ] `src/ui/upgradePanel.ts`: grid 4×2, tap + hold com auto-repeat (400 ms), botão MAX com **soma de PG fechada**, estados esmaecidos
- [ ] `src/systems/progression.ts`: XP, `xpToNext`, level-up, slow-mo de 0,35 s
- [ ] `src/data/cards.ts`: 7 comuns + 5 raras (o resto vai no M6); `apply` **pura**
- [ ] `src/ui/cardPicker.ts`: 3 opções, raridade por peso, sem repetição, 1 reroll grátis, sem timer
- [ ] `src/core/state.ts` + `SceneManager`: BOOT→LOADING→MENU→RUN→CARD_PICK/PAUSE→RESULT
- [ ] `src/ui/hud.ts`: barras de HP/XP, wave, ouro, nível, política de mira
- [ ] Tela de pausa (com opções) e tela de resultado (wave, kills, tempo, Núcleos ganhos)
- [ ] Menu inicial mínimo: JOGAR + opções
- [ ] `src/ui/styles.css`: safe-areas, alvos ≥48 dp, zona do polegar, tipografia
- [ ] Háptico + som em toda interação de UI
- [ ] **Teste:** custo MAX == soma da PG; nunca gasta mais que o ouro
- [ ] **Teste:** curvas de wave monotônicas e finitas até a wave 500
- [ ] **Teste:** `apply` de toda carta é pura e não gera NaN em nenhum nível
- [ ] **Verificação:** run completa de 15 min sem erro, no celular real
- [ ] **Verificação:** rodar sem atlas — ainda 100% jogável

**Critério de aceite:** um estranho pega o celular, entende o jogo sem tutorial e joga 10 minutos.

**FPS medido:** `—`

**Notas:**
```
```

---

## M5 — Meta-progressão, save e idle

- [ ] `src/save/schema.ts`: `SaveV1` (campos de SPEC §15.2, começando em v1)
- [ ] `src/save/migrations.ts`: cadeia `migrate()` + teste com save falso de versão antiga
- [ ] `src/platform/storage.ts`: localStorage ↔ Capacitor Preferences, **slot duplo a/b**
- [ ] `src/save/save.ts`: autosave debounced 10 s, em fim de wave, pause e `visibilitychange`
- [ ] Assinatura `sig` + modo somente-local quando inválida (nunca apagar o save)
- [ ] Exportar/Importar save em base64 nas opções
- [ ] `src/data/talents.ts`: 4 ramos × ~10 nós, custo `base * 1.28^rank`
- [ ] `src/ui/talentTree.ts`: navegável com o polegar, respec grátis
- [ ] Cálculo e concessão de Núcleos no fim da run
- [ ] Ganho offline: cálculo, cap de 8 h, tela de retorno, salvaguarda de relógio para trás
- [ ] Retomada de run interrompida (`RunSnapshot`)
- [ ] Prestige/Rebirth: gate na wave 100, cálculo de Éter, ramos desbloqueáveis
- [ ] **Teste:** relógio para trás → 0 ganho offline, flag registrada
- [ ] **Teste:** corromper `save_a` → carrega `save_b`
- [ ] **Verificação:** matar o app no meio da run → reabrir → estado preservado

**Critério de aceite:** fechar o app por 2 h e voltar entrega recompensa correta; talentos afetam a run seguinte.

**Notas:**
```
```

---

## M6 — Conteúdo e balanceamento

- [ ] Comportamentos dos 9 arquétipos completos (escudo do `warden`, cura do `mender`, split do `splitter`, fase do `wraith`)
- [ ] Sistema de elites: chance por wave, afixos, visual dourado
- [ ] `boss_colossus` — investida telegrafada
- [ ] `boss_hive` — invocação de enxame
- [ ] `boss_warlock` — teleporte, zonas de chão, escudo recarregável
- [ ] Barra de boss, nome, telegraph de 0,6 s em **todo** ataque especial
- [ ] Cartas restantes: 4 épicas + 2 lendárias
- [ ] Cartas evolutivas (fusão em nível máximo) — pelo menos 2 pares
- [ ] `src/data/abilities.ts` + `src/systems/abilities.ts`: `nova`, `fury`, `bulwark` + auto-cast por talento
- [ ] `tools/sim-balance.mjs`: simulação headless com 3 políticas de jogador
- [ ] Rodar a simulação, ajustar `BAL`, **registrar aqui os números antes/depois**
- [ ] Alvo: run 1 termina na wave 12–20; após 1 h de meta, wave 35–50; parede clara na 100
- [ ] Localização: `strings.pt.ts` + `strings.en.ts`, sem string solta no código

**Critério de aceite:** curva de progressão simulada dentro da faixa alvo; nenhuma carta obviamente dominante ou inútil.

**Log de balanceamento:**
```
data | mudança | wave média antes → depois
```

---

## M7 — Polimento

- [ ] VFX: impacto, morte, explosão, nova gélida, corrente, orbitais — todos em pool
- [ ] Feedback de acerto: hit-flash branco, micro-knockback, escala de impacto
- [ ] Juice: escala de botão, pop de moeda, número de dano com arco, tremor no level-up
- [ ] `src/platform/audio.ts`: WebAudio, desbloqueio no primeiro toque, dedupe (máx. 3/frame), pitch ±8%, barramentos
- [ ] Música: 1 loop de menu, 1 de run, 1 de boss + ducking
- [ ] `src/data/audio.ts`: mapa de sons; **ausência de áudio nunca quebra o jogo**
- [ ] Opções de acessibilidade: reduzir flash/shake/partículas, daltonismo, tamanho de UI, modo canhoto
- [ ] Degradação automática de qualidade abaixo de 50 FPS (média de 2 s)
- [ ] Tutorial contextual: 3 dicas na primeira run, nunca mais
- [ ] Transições de tela (fade 180 ms), tela de loading real
- [ ] Tratamento de erro global: overlay amigável + botão de copiar log, em vez de tela branca
- [ ] Ícone, splash, tema de cor do navegador

**Critério de aceite:** o jogo *parece* comercial. Cada toque responde em menos de 100 ms com visual + som + háptico.

**Notas:**
```
```

---

## M8 — Mobile, loja e monetização

- [ ] Capacitor instalado; `capacitor.config.ts` de SPEC §17.2
- [ ] Plugins: preferences, haptics, status-bar, splash-screen, app, keep-awake
- [ ] Android: `cap add android`, orientação travada, back button, ícone adaptativo, splash
- [ ] iOS: `cap add ios`, safe areas, `contentInset: never`, ícone, launch screen
- [ ] KeepAwake só durante a run
- [ ] PWA: manifest + service worker manual, instalável, funciona offline
- [ ] Stub de anúncios (`platform/ads.stub.ts`) com a interface final; integração real da rede
- [ ] Rewarded: ×2 offline, reroll, revive, ×2 recompensa de run — todos opt-in explícito
- [ ] IAP: remover anúncios, pacotes de gemas, ×2 offline permanente
- [ ] Consentimento de privacidade (GDPR/ATT), política de privacidade hospedada
- [ ] Build assinado: `.aab` (Play) e `.ipa` (TestFlight)
- [ ] Ficha da loja: descrição PT/EN, 6 capturas de tela, vídeo de 30 s, ícone 512
- [ ] Teste em ≥3 dispositivos reais distintos (Android baixo, Android alto, iPhone)
- [ ] Analytics mínimo: wave alcançada, duração da run, funil de retenção D1/D7

**Critério de aceite:** APK instalável em celular real, rodando a 60 FPS, com anúncio recompensado funcionando.

**Notas:**
```
```

---

## Riscos ativos

| # | Risco | Impacto | Mitigação | Status |
|---|-------|---------|-----------|--------|
| R1 | Canvas2D não aguentar 400+ inimigos em aparelho fraco | Alto | Orçamento e medição desde M2; plano B: renderer WebGL por trás da mesma API `drawSprite` | 🟡 monitorar |
| R2 | Curva de dificuldade errada afastar o jogador cedo | Alto | `sim-balance` no M6 + telemetria no M8 | 🟡 monitorar |
| R3 | Ouro estourando a precisão de float em jogo muito longo | Baixo | Só relevante acima de 1e250; medir na telemetria antes de complicar | 🟢 aceito |
| R4 | `localStorage` limpo pelo WebView do Android | Alto | Capacitor Preferences + slot duplo + export manual | 🟢 mitigado no plano |
| R5 | Escopo crescer (arenas, loot, multiplayer) | Alto | SPEC §21 é lei; ideias vão para a seção abaixo | 🟡 monitorar |
| R6 | Arte final não casar com as caixas de colisão dos placeholders | Médio | Grid de tamanhos fixado em SPEC §13.7 desde já | 🟢 mitigado |
| R7 | Políticas de loja (COPPA, ATT) travarem a publicação | Médio | Decidir faixa etária antes do M8; declarar corretamente | 🟡 monitorar |

---

## Log de decisões

| Data | Decisão | Por quê | Alternativa descartada |
|------|---------|---------|------------------------|
| — | Canvas2D com renderer próprio, sem engine | Bundle mínimo, controle total, sem custo de abstração num jogo de escopo estreito | PixiJS (peso), Phaser (peso + opinião demais), Unity (build de 20 MB) |
| — | Pools SoA em vez de ECS genérico | Cache-friendly, sem indireção, mais simples de depurar num escopo fechado | ECS completo (bitecs, etc.) |
| — | UI em DOM sobre o canvas | Acessibilidade, safe areas, iteração 10× mais rápida, frame budget livre | UI desenhada no canvas |
| — | `number` puro para moedas, sem Decimal | Cobre até 1e308; lib de decimal custa perf e peso | break_infinity.js |
| — | Sem scroll de câmera na v1 | Elimina culling, minimapa e ansiedade de "de onde veio o dano" | Arena maior com câmera seguindo |
| — | Sem timer na tela de cartas | Mobile é jogado em contexto interrompível; timer é hostil | Timer de 10 s como em roguelites de PC |
| — | Retirada voluntária dá 100% da recompensa | Punir saída faz o jogador deixar o app aberto no bolso, queimando bateria | Penalidade de 50% |

---

## Ideias (fora do escopo — NÃO implementar)

> Estacionamento. Nada daqui entra sem uma decisão explícita registrada acima.

- [ ] Segunda torre / posicionamento de torres auxiliares
- [ ] Equipamentos com atributos aleatórios (arco, armadura, anel)
- [ ] Pets/companheiros orbitando
- [ ] Modos alternativos: sobrevivência infinita, desafio diário com seed fixa
- [ ] Leaderboard semanal (exige backend)
- [ ] Cloud save com conta
- [ ] Arenas com bioma e modificadores ambientais
- [ ] Passe de batalha sazonal
- [ ] Editor de builds / compartilhamento por código
- [ ] Skins de torre

---

## Diário de sessão

> Uma entrada por sessão de trabalho. Curta. O "eu do futuro" agradece.

### AAAA-MM-DD — sessão N
**Feito:**
**Descoberto:**
**Bloqueado em:**
**Próximo passo:**
