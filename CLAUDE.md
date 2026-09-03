# CLAUDE.md — Iron Spire

> Instruções operacionais para o agente que desenvolve este projeto.
> **Leia este arquivo inteiro antes de escrever qualquer linha de código, em toda sessão.**

---

## 0. TL;DR — as 10 regras que não se quebram

1. **`SPEC.md` é a fonte da verdade.** Divergiu do spec? O código está errado — ou o spec muda primeiro, com justificativa registrada.
2. **Zero alocação no loop quente.** Nada de `new`, `{}`, `[]`, closures, `.map/.filter/.forEach` dentro de update/render.
3. **Zero dependências de runtime.** `package.json` só tem `devDependencies` (+ plugins Capacitor). Quer uma lib? Justifique no PROGRESS.md e peça aprovação.
4. **Todo número de balanceamento vive em `src/data/`.** Número mágico em `systems/` ou `render/` = bug.
5. **Nada de gameplay lê pixels.** Entidades guardam `spriteKey`; o render resolve. O jogo roda sem nenhum asset.
6. **`core/` e `data/` são puros:** sem `document`, sem `window`, sem `CanvasRenderingContext2D`. Se importar DOM ali, está errado.
7. **Timestep fixo, PRNG semeado.** A simulação é determinística. Sempre.
8. **Atualize o `PROGRESS.md` ao fim de toda tarefa.** Marque o checkbox, anote decisões e surpresas.
9. **`npm run typecheck && npm run lint && npm run test` passa antes de considerar qualquer coisa pronta.**
10. **Não implemente nada da lista "Fora do V1"** (SPEC §21). Ideia nova vai para a seção Ideias do PROGRESS.md.

---

## 1. Contexto do projeto

**Iron Spire** — jogo mobile de *Idle Defense* top-down. Torre no centro, inimigos convergindo de 360°, tiro automático, upgrades in-run, cartas roguelite, meta-progressão persistente e ganho offline.

**Stack:** TypeScript strict · Vite · Canvas2D com renderer próprio · Capacitor (Android/iOS) · Vitest.
**Alvo de performance:** 60 FPS num Android de baixo custo de 2021 com 250 inimigos em tela.
**Idioma:** documentação e strings de jogo em **PT-BR**; identificadores, comentários de código, nomes de arquivo e mensagens de commit em **inglês**.

---

## 2. Comandos

```bash
npm run dev          # servidor de desenvolvimento (Vite)
npm run dev -- --host  # expõe na rede local → testar no celular real
npm run typecheck    # tsc --noEmit — DEVE passar
npm run lint         # eslint --max-warnings 0 — DEVE passar
npm run test         # vitest run — DEVE passar
npm run build        # typecheck + build de produção
npm run atlas        # empacota assets/src/**.png → atlas + spriteKeys.gen.ts
npm run balance      # simulação headless de balanceamento
npm run cap:sync     # build + sincroniza com projetos nativos
npm run android      # abre no Android Studio
```

**Fluxo de teste no celular (use sempre que mexer em input, layout ou performance):**
`npm run dev -- --host` → abrir `http://<ip-da-máquina>:5173` no celular na mesma rede.

---

## 3. Arquitetura — direção de dependência

```
data  →  core  →  entities  →  systems  →  render  →  ui
                                    ↘  platform  ↗
```

**Regra:** a seta só aponta para a direita. `core` nunca importa de `systems`. `systems` nunca importa de `render`. Se você precisa que um sistema "avise" a UI, use o **event bus** (`core/events.ts`), nunca uma chamada direta.

| Pasta | Pode importar | Nunca importa |
|-------|---------------|---------------|
| `core/` | nada do projeto (só tipos) | DOM, Canvas, dados de jogo |
| `data/` | `core/` (tipos e math) | qualquer coisa com lógica |
| `entities/` | `core`, `data` | `render`, `ui`, `systems` |
| `systems/` | `core`, `data`, `entities` | `render`, `ui`, DOM |
| `render/` | `core`, `data`, `entities` | `ui`, `systems` (lê estado, não chama) |
| `ui/` | tudo (é a ponta) | — |
| `platform/` | `core` | lógica de jogo |

**Teste rápido de sanidade:** `src/core/` e `src/data/` devem rodar no Node sem nenhum shim de DOM. Os testes do Vitest para essas pastas rodam em ambiente `node`, não `jsdom`. Se precisar de jsdom para testar `core/`, você acoplou errado.

---

## 4. Padrões de código

### 4.1 TypeScript

```jsonc
// tsconfig.json — não afrouxar nenhuma destas
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "verbatimModuleSyntax": true,
  "target": "ES2022",
  "moduleResolution": "bundler"
}
```

- **`any` é proibido.** Se realmente precisar, use `unknown` + narrowing. Um `any` com comentário `// TODO` também é proibido.
- Use `as const` em todas as tabelas de dados. Derive tipos delas: `type EnemyId = keyof typeof ENEMIES`.
- Prefira `type` a `interface`, exceto para contratos extensíveis.
- Enums: use **union de string literais** ou `const` objects com `as const`. Nunca `enum` do TS (gera runtime desnecessário).
- Nomes: `camelCase` para valores, `PascalCase` para tipos, `SCREAMING_SNAKE` para constantes de módulo.

### 4.2 Loop quente — o que é proibido

Considere "loop quente" tudo dentro de `systems/*.update()`, `render/*`, e qualquer coisa chamada por eles a 60 Hz.

```ts
// ❌ NUNCA no loop quente
const near = enemies.filter(e => e.alive);         // aloca array
for (const e of list) { }                          // aloca iterador em alguns engines
arr.forEach(e => update(e));                       // closure por chamada
const { x, y } = enemy;                            // ok para primitivos, mas não desestruture objetos temporários
const d = Math.hypot(dx, dy);                      // sqrt caro; compare quadrados
if (e instanceof Boss) { }                         // use flags/bitmask
`${dmg} dano`                                       // concat de string por frame
JSON.parse / JSON.stringify
try { } catch { }                                   // desotimiza o hot path em alguns motores

// ✅ SEMPRE
for (let i = 0; i < pool.count; i++) {
  if (pool.alive[i] === 0) continue;
  const dx = pool.x[i] - tx, dy = pool.y[i] - ty;
  if (dx * dx + dy * dy <= r2) { /* ... */ }
}
```

**Vetores:** não existe classe `Vec2` no loop. Use pares de `number` locais, ou escreva em `out` pré-alocados. Alocar 400 `Vec2` por frame é 24.000 objetos por segundo.

### 4.3 Pools

Todo tipo de entidade dinâmica usa **struct-of-arrays com free-list** (SPEC §12.4).

- Nunca crescer o pool durante uma run. Cheio = descarta (partículas) ou pula o spawn (inimigos), e incrementa um contador de diagnóstico.
- `kill(i)` marca `alive[i]=0` e devolve `i` à free-list. **Nunca compacte arrays** — os índices são referências.
- Se uma entidade guarda o índice de outra (ex.: alvo da torre), guarde também uma **geração** (`gen: Uint16Array`) para detectar índice reciclado. Sem isso, você vai atirar em um inimigo que já morreu e outro nasceu no lugar.

### 4.4 Estado

- Um único objeto `GameState` na raiz, serializável.
- Nada de `let` de módulo guardando estado de jogo. Módulo tem função pura ou classe instanciada uma vez a partir do estado.
- Mutação de estado acontece nos sistemas, na ordem definida em SPEC §12.3. Não invente ordem nova sem atualizar o spec.

### 4.5 Dano

**Nenhum sistema aplica dano diretamente.** Empurra na `damageQueue` (array pré-alocado de structs paralelas) e `systems/damage.ts` resolve. Um único lugar aplica crítico, redução, lifesteal, morte e drop. Isso é inegociável — dano espalhado é a origem de metade dos bugs de jogo desse gênero.

### 4.6 Comentários

Comente **por quê**, não **o quê**. Comentário obrigatório em:
- Toda constante de balanceamento com número não óbvio (a intenção por trás).
- Todo truque de performance (senão alguém "limpa" e derruba o FPS).
- Toda ordem de operação que importa.

---

## 5. Sistema de sprites — contrato inviolável

Ver SPEC §13. Resumo operacional:

```ts
// A ÚNICA forma de desenhar algo no mundo:
drawSprite(ctx, key, x, y, rot, scale, alpha, tint?)
```

**Ao adicionar qualquer coisa visual nova, na mesma tarefa você:**
1. Declara a key em `src/render/spriteKeys.manual.ts`.
2. Registra um placeholder procedural em `src/render/placeholders.ts` com a **silhueta e a cor corretas** (SPEC §5.1) — não um retângulo cinza.
3. Referencia a key no arquivo de dados da entidade.

**Nunca:**
- `ctx.drawImage` fora de `drawSprite.ts` / `vfx.ts`.
- `if (spriteExists) ... else ...` espalhado por gameplay. O fallback vive num lugar só.
- Path vetorial de arte dentro de `systems/` ou `entities/`.

**Verificação obrigatória a cada milestone:** delete/renomeie a pasta `assets/atlas/` e rode o jogo. Deve ficar 100% jogável e legível. Se quebrar, o contrato foi violado.

---

## 6. Performance — como trabalhar

1. **Meça antes de otimizar, mas projete dentro do orçamento** (SPEC §16.2).
2. Toda tarefa de milestone termina com um teste de FPS: DevTools → Performance → CPU throttle **6×**, 60 s de gameplay na wave 20+. Anote o FPS médio no PROGRESS.md.
3. Overlay de debug (tecla `F3` / 4-dedos): FPS, ms de sim, ms de render, contagem de entidades por pool, allocs estimadas.
4. Se um recurso não cabe no orçamento, **corte o recurso**, não o framerate.
5. Verificação de GC: DevTools → Memory → gravar 5 min. Gráfico de heap deve ser **plano**. Dente de serra = alocação no loop = conserte antes de seguir.

---

## 7. Testes

- Vitest. Ambiente `node` para `core/` e `data/`; `jsdom` só para `ui/`.
- **Escreva o teste na mesma tarefa que a feature.** Não existe "testes depois".
- Áreas obrigatórias: SPEC §19.1.
- Teste de fuzz para `spatialHash` (compare com força bruta) e para o pool (10⁶ spawn/kill aleatórios, free-list íntegra).
- Nenhum teste pode depender de `Math.random` — injete o PRNG semeado.

**Definition of Done de qualquer tarefa:**
- [ ] `npm run typecheck` limpo
- [ ] `npm run lint` limpo (0 warnings)
- [ ] `npm run test` verde
- [ ] Rodou no navegador sem erro/aviso no console
- [ ] Roda com `assets/atlas/` ausente
- [ ] Checkbox marcado no PROGRESS.md + nota do que foi decidido

---

## 8. Fluxo de trabalho por tarefa

```
1. Ler PROGRESS.md → identificar a próxima tarefa não marcada do milestone atual
2. Reler a seção correspondente do SPEC.md
3. Se algo estiver ambíguo ou o spec parecer errado: PERGUNTE. Não invente mecânica.
4. Implementar em passos pequenos e verificáveis
5. Escrever/atualizar testes
6. typecheck + lint + test
7. Rodar no navegador; se tocou em input/layout/perf, testar no celular
8. Atualizar PROGRESS.md (checkbox + nota + FPS medido se aplicável)
9. Commit
```

### Commits

Conventional Commits, em inglês, escopo = pasta.

```
feat(systems): add chain lightning projectile behavior
fix(render): stop allocating Vec2 in particle draw loop
perf(core): replace Math.hypot with squared distance in targeting
data(balance): retune hp growth 1.15 → 1.145 after sim run
docs(progress): close M3, log FPS results
```

Commits pequenos e frequentes. Um commit por tarefa do PROGRESS.md, idealmente.

---

## 9. Erros comuns neste projeto (não repita)

| ❌ Erro | ✅ Correto |
|--------|-----------|
| Criar objetos `Vec2` no update | Pares de `number` locais / arrays `out` |
| `Math.sqrt` para comparar distância | Comparar `dx*dx+dy*dy` com `r*r` |
| Aplicar dano dentro de `projectiles.ts` | Enfileirar em `damageQueue` |
| Hardcodar `1.145` num sistema | Ler de `BAL.wave.hpGrowth` |
| `ctx.shadowBlur` para brilho | Sprite aditivo pré-renderizado / gradiente em canvas offscreen |
| `fillText` para números de dano | Atlas de dígitos |
| UI desenhada no canvas | DOM por cima, `pointer-events` seletivo |
| `localStorage` no build nativo | `platform/storage.ts` → Capacitor Preferences |
| Adicionar campo no save sem migração | Bump de versão + função de migração + teste |
| `setInterval` para lógica de jogo | Timestep fixo no loop |
| Ler `offsetWidth` durante o frame | Cachear em resize |
| Escalar canvas por CSS | `canvas.width = css * min(dpr,2)` + `setTransform` |
| Assumir que o asset existe | Placeholder sempre registrado |

---

## 10. Como pedir ajuda / quando parar

**Pare e pergunte** quando:
- O SPEC estiver ambíguo ou autocontraditório sobre uma mecânica.
- Uma decisão de balanceamento não tiver dado que a sustente (sugira rodar `npm run balance`).
- Uma tarefa exigir uma dependência nova.
- Uma solução exigir violar uma regra da seção 0.
- Você estiver há 3 tentativas no mesmo bug sem progresso.

**Não pare para:** escolher nome de variável, decidir formatação, ou pedir permissão para escrever teste. Só faça.

---

## 11. Ordem de construção

Sempre nesta sequência. Não pule para o brilho antes do fundamento.

```
M0 Fundação (loop, canvas, escala, input, debug)
M1 Render + sistema de sprites com placeholders
M2 Entidades e pools + spatial hash
M3 Combate (mira, tiro, colisão, dano, morte)
M4 Waves + economia in-run + cartas   ← VERTICAL SLICE JOGÁVEL
M5 Meta-progressão, save, offline
M6 Conteúdo (bosses, elites, cartas restantes, balanceamento)
M7 Polimento (VFX, áudio, feedback, acessibilidade)
M8 Mobile/Capacitor, monetização, lojas
```

Ao fim de **cada** milestone: build de produção, teste no celular real, medir FPS, atualizar PROGRESS.md, commit com tag.

---

## 12. Referência rápida de arquivos

| Preciso mexer em… | Vá para |
|-------------------|---------|
| Um número de balanceamento | `src/data/balance.ts` |
| Um inimigo novo | `src/data/enemies.ts` + placeholder em `render/placeholders.ts` |
| Uma carta nova | `src/data/cards.ts` (a `apply` é pura!) |
| Como a torre escolhe alvo | `src/systems/targeting.ts` |
| Como o dano é aplicado | `src/systems/damage.ts` — o **único** lugar |
| Como uma sprite é desenhada | `src/render/drawSprite.ts` |
| O que acontece sem arte | `src/render/placeholders.ts` |
| Formato do save | `src/save/schema.ts` + `migrations.ts` |
| Layout do HUD | `src/ui/hud.ts` + `src/ui/styles.css` |
| Constantes de mundo | `src/core/constants.ts` |
