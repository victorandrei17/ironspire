# SPEC.md — IRON SPIRE
### Idle Defense top-down para mobile — Especificação de Design e Técnica

> **Status:** v1.0 — documento fonte da verdade.
> **Codinome do projeto:** `iron-spire`
> **Gênero:** Idle Defense / Roguelite incremental (referências: *Evil Tower – Idle Defense TD*, *Arrow Quest: Idle Defense RPG*, *Tower Defense: Idle*, *Survivor.io*).
> **Plataforma alvo:** Android + iOS via **Capacitor**, empacotando um build web (HTML+JS). O mesmo build roda em navegador mobile (PWA) para testes rápidos.
> **Stack:** TypeScript (strict) + Vite + Canvas2D com renderer próprio. **Zero dependências de runtime.**

---

## Índice

1. [Pilares de design](#1-pilares-de-design)
2. [Loop de jogo](#2-loop-de-jogo)
3. [Câmera, arena e resolução](#3-câmera-arena-e-resolução)
4. [A Torre (player)](#4-a-torre-player)
5. [Inimigos](#5-inimigos)
6. [Waves e dificuldade](#6-waves-e-dificuldade)
7. [Economia e progressão in-run](#7-economia-e-progressão-in-run)
8. [Cartas roguelite](#8-cartas-roguelite)
9. [Habilidades ativas](#9-habilidades-ativas)
10. [Meta-progressão, prestige e idle offline](#10-meta-progressão-prestige-e-idle-offline)
11. [UI/UX mobile](#11-uiux-mobile)
12. [Arquitetura técnica](#12-arquitetura-técnica)
13. [Sistema de sprites e assets](#13-sistema-de-sprites-e-assets) ⭐
14. [Áudio](#14-áudio)
15. [Save, migrações e anti-cheat leve](#15-save-migrações-e-anti-cheat-leve)
16. [Performance: orçamento e regras](#16-performance-orçamento-e-regras)
17. [Build, Capacitor e distribuição](#17-build-capacitor-e-distribuição)
18. [Monetização](#18-monetização)
19. [Testes e qualidade](#19-testes-e-qualidade)
20. [Estrutura de pastas](#20-estrutura-de-pastas)
21. [Escopo: dentro / fora](#21-escopo-dentro--fora)
22. [Glossário e constantes canônicas](#22-glossário-e-constantes-canônicas)

---

## 1. Pilares de design

| # | Pilar | O que significa na prática |
|---|-------|----------------------------|
| P1 | **Uma mão, retrato, 30 segundos** | Jogável com o polegar, em pé, no ônibus. Nenhuma interação exige precisão. Nenhum gesto de duas mãos. |
| P2 | **O jogo joga sozinho, o jogador decide** | A torre mira e atira sozinha. A skill do jogador é *decisão econômica* (o que upar, qual carta pegar, quando gastar habilidade), não mira. |
| P3 | **Sempre progredindo** | Toda run, mesmo uma run ruim, gera moeda meta. Fechar o app gera ganho offline. O jogador nunca "perde tempo". |
| P4 | **Números crescendo, sempre** | Feedback numérico constante: dano flutuante, moedas voando, barras enchendo, level-ups. É o hook do gênero. |
| P5 | **Leitura instantânea** | Silhuetas distintas por arquétipo de inimigo, cores consistentes por função. O jogador entende a ameaça em 0,2 s olhando de relance. |
| P6 | **60 FPS num Android de R$ 900** | Performance é requisito de design, não otimização posterior. Se um recurso não cabe no orçamento de frame, ele não entra. |

**Fantasia central:** você é o núcleo de uma torre arcano-industrial cravada no centro de uma clareira. Ondas de criaturas convergem de todas as direções. Você não corre, não desvia — você *fica* e fica mais forte que elas.

---

## 2. Loop de jogo

### 2.1 Loop macro (sessão)

```
ABRIR APP
   ↓
[Recompensa offline]  ← ganho acumulado desde o último fechamento
   ↓
[Base / Menu] — gastar Núcleos em talentos permanentes, equipar cartas iniciais
   ↓
[RUN]  ←──────────────────────────────┐
   ↓                                  │
[Derrota / Retirada voluntária]       │
   ↓                                  │
[Resultado: Núcleos ganhos]  ─────────┘
   ↓
(a cada N prestígios) [Rebirth] — reset com multiplicador permanente
```

### 2.2 Loop micro (dentro da run, ciclo de ~20 s)

```
Wave começa
  → inimigos spawnam no anel externo e convergem para o centro
  → torre auto-ataca o alvo escolhido pela política de mira
  → inimigos morrem e o Ouro entra na conta na hora (número dourado flutuante)
  → jogador toca em upgrades no painel inferior (dano/cadência/…)
  → a cada 5 waves limpas → jogo entra em slow-motion e oferece 3 CARTAS
  → jogador escolhe 1 → build da run muda
  → a cada 10 waves: BOSS (barra de vida no topo, padrão de ataque próprio)
Wave termina → 2 s de respiro → próxima wave, mais forte
```

**Ritmo alvo:** wave curta (12–25 s). Level-up a cada ~1,5 wave no começo, desacelerando. Boss a cada 10 waves (~3–4 min). Run típica: 8–20 min. Run de veterano com build boa: até fechar por *wall* de dificuldade.

### 2.3 Fim de run

- **Derrota:** HP da torre chega a 0. Tela de resultado.
- **Retirada:** botão disponível entre waves. Dá 100% da recompensa — não punimos quem sai. (Punir saída faz o jogador deixar o app aberto no bolso, o que queima bateria e piora as métricas.)
- **Recompensa:** Núcleos = `floor((waveMax / 4) ^ 1.6 * metaCoreMult)`.

---

## 3. Câmera, arena e resolução

### 3.1 Câmera

- **Top-down puro, ortogonal, sem rotação.** A torre fica travada no centro geométrico da área jogável.
- **Sem scroll na v1.** A arena inteira cabe na tela. Isso elimina culling complexo, minimapa e a confusão de "de onde veio esse dano?".
- Câmera tem **shake** (trauma-based, decai quadraticamente) e **zoom-punch** sutil em boss kill. Ambos desativáveis nas opções (acessibilidade).
- `Camera { x, y, zoom, trauma }` já existe na v1 mesmo sem scroll, para não reescrever tudo se a v2 tiver arenas maiores.

### 3.2 Resolução virtual e escala

- Espaço de mundo em **unidades virtuais**: `VW = 720`, `VH = 1280` (retrato 9:16).
- Toda a lógica de jogo opera nessas unidades. **Nada de lógica em pixels de tela.**
- Escala: `scale = min(screenW / VW, screenH / VH)` → *letterbox* (barras pretas), garantindo que a arena nunca corte.
- HUD é ancorado nas bordas **reais** da tela (não do letterbox), respeitando `env(safe-area-inset-*)` para notch e barra de gestos.
- `devicePixelRatio` limitado a **2.0** (`Math.min(dpr, 2)`) — acima disso o custo de fill rate não compensa visualmente em telas pequenas.

### 3.3 Geometria da arena

```
       ┌──────── VW=720 ────────┐
       │        SPAWN RING      │   ← R_spawn = 560 (fora da tela nos cantos)
       │   ┌────────────────┐   │
       │   │   ARENA VISÍVEL │   │
       │   │       ███       │   │   ← Torre em (360, 620)
       │   │      TORRE      │   │
       │   └────────────────┘   │
       └────────────────────────┘
```

| Constante | Valor | Nota |
|-----------|-------|------|
| `TOWER_POS` | `(360, 620)` | Levemente acima do centro geométrico, para o HUD inferior não competir com a ação |
| `R_SPAWN` | `560` | Raio do anel de spawn. Inimigos nascem em ângulo aleatório |
| `R_DESPAWN` | `700` | Além disso, entidade é reciclada |
| `R_TOWER_BODY` | `34` | Raio de colisão da torre |
| `ARENA_TINT_R` | `520` | Raio do gradiente/vinheta do chão |

Direção de spawn: ângulo uniformemente aleatório em `[0, 2π)`, **exceto** em waves com padrão dirigido (ver §6.4).

---

## 4. A Torre (player)

### 4.1 Atributos

| Atributo | Símbolo | Base | Efeito |
|----------|---------|------|--------|
| Dano | `dmg` | 10 | Dano por projétil |
| Cadência | `fireRate` | 1.20 /s | Tiros por segundo |
| Alcance | `range` | 300 | Raio de aquisição de alvo (unidades virtuais) |
| Vida | `hpMax` | 100 | Vida da torre |
| Regeneração | `hpRegen` | 0.0 /s | Vida por segundo |
| Crítico (chance) | `critChance` | 0.05 | Probabilidade |
| Crítico (multi) | `critMult` | 2.00 | Multiplicador de dano |
| Projéteis | `projectiles` | 1 | Tiros simultâneos por disparo (leque de 12° cada) |
| Perfuração | `pierce` | 0 | Inimigos extras atravessados |
| Velocidade proj. | `projSpeed` | 900 | Unidades/s |
| Bônus de ouro | `goldMult` | 1.00 | Multiplicador |

**DPS efetivo** = `dmg * fireRate * projectiles * (1 + critChance * (critMult - 1)) * (1 + pierceAvgHit)`

Stats são calculados em **camadas**, sempre nesta ordem (importa!):

```
final = ((base + flatMeta + flatRun + flatCard) * (1 + sumPercentMeta + sumPercentRun + sumPercentCard)) * prodMultCards
```

> Regra: bônus percentuais **somam** entre si; multiplicadores de carta rara **multiplicam**. Isso mantém o balanceamento previsível e evita explosões acidentais.

### 4.2 Política de mira (targeting)

Enum `TargetPolicy`, alternável pelo jogador num botão do HUD (ícone cíclico):

| Política | Regra | Default |
|----------|-------|---------|
| `CLOSEST` | Menor distância ao centro | ✅ |
| `STRONGEST` | Maior HP atual |  |
| `WEAKEST` | Menor HP atual (finaliza) |  |
| `FASTEST` | Maior velocidade |  |
| `BOSS_FIRST` | Boss/elite > resto, depois CLOSEST |  |

Aquisição roda no máximo a **10 Hz** (não a cada frame) e usa o spatial hash. O alvo é mantido até morrer ou sair do alcance (evita "gaguejar" entre alvos).

### 4.3 Dano recebido

- Inimigo *melee* que encosta na torre entra em modo `ATTACKING`: para de andar e aplica `enemy.dmg` a cada `enemy.attackInterval`.
- Inimigo *ranged* para a `enemy.preferredRange` e dispara projéteis inimigos.
- Não há colisão inimigo-inimigo (empurrão): usamos **separação suave** (steering) para evitar empilhamento visual, com custo O(vizinhos do grid).
- **i-frames:** a torre tem 0,25 s de invulnerabilidade após tomar dano, para evitar melt instantâneo por swarm.

---

## 5. Inimigos

### 5.1 Arquétipos (v1)

Todo inimigo é um `EnemyDef` puro-dado em `src/data/enemies.ts`.

| id | Nome | Silhueta / cor | HP× | Vel | Dano | Comportamento |
|----|------|----------------|-----|-----|------|---------------|
| `grunt` | Lacaio | círculo, verde-musgo | 1.0 | 55 | 4 | Anda reto. O tijolo básico |
| `runner` | Corredor | triângulo, amarelo | 0.5 | 105 | 3 | Rápido, frágil. Pune cadência baixa |
| `brute` | Bruto | hexágono grande, vermelho-tijolo | 4.5 | 34 | 14 | Tanque lento. Pune dano baixo |
| `swarmling` | Enxame | círculo pequeno, cinza-claro | 0.25 | 80 | 2 | Spawna em grupos de 8–14. Pune single-target |
| `spitter` | Cuspidor | losango, roxo | 1.2 | 45 | 6 (proj.) | Para a 260 u e cospe projétil lento |
| `warden` | Guardião | quadrado com barra, azul-aço | 2.5 | 40 | 8 | Escudo frontal: −60% de dano vindo do cone de 100° à frente |
| `mender` | Curandeiro | cruz, verde-claro | 1.5 | 42 | 0 | Cura 3%/s dos aliados num raio de 120. **Prioridade de morte** |
| `splitter` | Cindido | losango duplo, laranja | 2.0 | 48 | 6 | Ao morrer gera 3 `swarmling` |
| `wraith` | Espectro | fantasma, ciano translúcido | 1.0 | 70 | 7 | Imune a dano de projétil por 1 s a cada 4 s (fase). Pune build 100% projétil |

**Multiplicador HP×** é relativo à curva base da wave (§6.2).

### 5.2 Bosses (v1: 3, ciclando)

| id | Wave | Mecânica |
|----|------|----------|
| `boss_colossus` | 10, 40, 70… | Alto HP, investida periódica (dash) em direção à torre |
| `boss_hive` | 20, 50, 80… | Invoca `swarmling` a cada 6 s; morre rápido se focado |
| `boss_warlock` | 30, 60, 90… | Teleporta, cria zonas de dano no chão, escudo recarregável |

Boss tem barra de vida no topo da tela, nome, e um *telegraph* visual de 0,6 s antes de cada ataque especial (círculo/cone vermelho no chão). **Todo ataque de boss é telegrafado.** Sem exceção.

### 5.3 Elites

A partir da wave 8, `eliteChance = min(0.02 * (wave - 7), 0.25)`. Um inimigo elite recebe:
- `hp × 6`, `gold × 8`, contorno dourado pulsante, escala 1.35×
- 1 afixo aleatório: `Blindado` (−40% dano), `Veloz` (+60% vel), `Vampírico` (cura ao atacar), `Explosivo` (dano em área ao morrer).

---

## 6. Waves e dificuldade

### 6.1 Estrutura

- Wave `n` = lista de *spawn groups*. Cada grupo: `{ enemyId, count, delay, spread }`.
- **Janela de spawn:** toda wave tem uma janela autorada — do primeiro monstro ao último ser invocado. É `spawnWindow(n, padrão) = min(cap, spawnBase + spawnPerEnemy · enemyCount(n)) · mult(padrão)`. O intervalo entre grupos é DERIVADO dela (`janela / (grupos − 1)`), nunca o contrário: sem isso a duração da wave era um efeito colateral de quantos grupos o padrão usava, e a wave 40 despejava quarenta monstros nos mesmos sete segundos que a wave 1 usava para sete.
- A composição vem de um **sistema de pesos por tabela**, não de listas escritas à mão — 200 waves à mão é insustentável.
- Wave termina quando todos os inimigos dela morrem **ou** saem da arena. Depois, 2 s de intervalo (`WAVE_GAP`).
- A wave seguinte pode começar antes se o jogador tocar em "Próxima wave" → dá **+15% de ouro** naquela wave (recompensa por risco). Esse é o botão que separa jogador casual de jogador otimizador.
- O botão é **fixo**, acima do MAX, e tem um temporizador que o preenche ao longo de `earlyCallAt` (80%) do cronograma de spawn da wave. Ou seja: ele fica disponível **antes** de a wave acabar, e chamar nesse ponto sobrepõe a cauda de uma wave com a cabeça da seguinte — os inimigos vivos continuam vivos, e o que não foi liberado nunca spawna. A wave abandonada conta como avançada (as cartas dependem desse contador).

### 6.2 Curvas canônicas

```ts
// src/data/balance.ts — FONTE DA VERDADE. Nenhum destes números pode aparecer solto no código.
export const BAL = {
  wave: {
    countBase: 6,       countPerWave: 1.35,   countCap: 90,
    hpBase: 12,         hpGrowth: 1.145,
    hpSoftCapWave: 60,  hpGrowthLate: 1.105,   // curva quebra para não estourar float cedo demais
    speedBase: 1.0,     speedGrowth: 1.004,    speedCap: 1.6,
    goldBase: 7,        goldGrowth: 1.09,
    gap: 2.0,
    spawnBase: 6,       spawnPerEnemy: 0.03,   spawnWindowCap: 20,
    earlyCallAt: 0.8,
  },
  run:  { startGold: 160 },
  boss: { every: 10, hpMult: 14, hpMultGrowth: 1.22, goldMult: 25 },
  elite:{ startWave: 8, chancePerWave: 0.02, chanceCap: 0.25, hpMult: 6, goldMult: 8 },
} as const;
```

```
enemyCount(n)  = min(countCap, floor(countBase + n * countPerWave))
enemyHp(n)     = hpBase * (n <= 60 ? hpGrowth^(n-1)
                                   : hpGrowth^59 * hpGrowthLate^(n-60))
enemySpeed(n)  = min(speedCap, speedBase * speedGrowth^(n-1))   // multiplicador da vel. base do arquétipo
goldDrop(n)    = goldBase * goldGrowth^(n-1)
bossHpMult(n)  = hpMult * hpMultGrowth^(floor(n/10) - 1)
```

> **Sobre estes números.** Todos foram re-tunados contra `npm run balance` e contra o build real; os valores originais do spec estão registrados no PROGRESS.md com o antes/depois. Duas inversões merecem destaque, porque contrariam o texto original:
>
> - **`hpGrowthLate` agora é MAIOR que `hpGrowth`.** Renda e custo são geométricos, então o número de níveis comprados cresce linearmente e o upgrade de dano (multiplicativo) vira uma exponencial em waves. Uma curva tardia mais suave significava *nenhuma* parede depois da wave 60 — o simulador levava o jogador otimizador até o horizonte sem morrer.
> - **Só o dano é multiplicativo.** Cada upgrade `mult` soma um expoente à curva de poder; com dano, cadência e dano crítico compondo juntos, o DPS crescia ~18%/wave contra HP a 9,5%/wave. Cadência e dano crítico voltaram a ser aditivos.

### 6.3 Tabela de pesos de composição

```ts
// Peso 0 = não aparece ainda. Interpolação linear entre âncoras de wave.
grunt:      w1:100  w10:70  w25:45  w50:30
runner:     w3:0    w4:25   w15:45  w40:55
swarmling:  w6:0    w7:30   w20:50  w45:60
brute:      w8:0    w9:20   w25:40  w50:50
spitter:    w12:0   w13:20  w30:40
warden:     w16:0   w17:18  w35:35
mender:     w20:0   w21:12  w40:22
splitter:   w24:0   w25:15  w45:30
wraith:     w30:0   w31:15  w55:30
```

O gerador sorteia `enemyCount(n)` inimigos usando roleta ponderada com o PRNG semeado (`seed = runSeed ^ waveNumber`), depois agrupa em 2–8 *spawn groups* distribuídos **dentro da janela de spawn** da wave (§6.1) e no ângulo. O último grupo cai exatamente no fim da janela.

> **Por que a janela cresce pouco.** Com i-frames, o dano que a torre recebe é função do TEMPO em contato, não de quantos inimigos encostam. Alongar a janela alonga a wave e, portanto, o dano recebido: `npm run balance` mostrou que `spawnPerEnemy` a 0.5 (janela de 6 s → 12 s na wave 10) derruba a run 1 da onda 14 para a 8. A janela cresce, mas devagar — e cada segundo a mais precisa ser pago em outro lugar da curva.

### 6.4 Padrões de wave (variedade)

Sorteado a cada wave a partir da 5, com peso:

| Padrão | Peso | Descrição |
|--------|------|-----------|
| `RING` | 50 | Uniforme em todas as direções (padrão) |
| `ARC` | 20 | Todos vêm de um arco de 90° — recompensa cartas de leque |
| `PINCER` | 15 | Dois arcos opostos |
| `TRICKLE` | 10 | Mesmo total, spawn contínuo lento — testa DPS sustentado |
| `RUSH` | 5 | 70% da wave de uma vez — testa burst e habilidades |

Cada padrão estica a janela de spawn da wave por um multiplicador próprio (`PATTERN_WINDOW_MUL`): TRICKLE 1.6, PINCER 1.15, RING/ARC 1.0, RUSH 0.5. O comprimento vem da wave; o multiplicador só mantém o padrão reconhecível dentro dela.

O padrão é anunciado por um ícone + texto de 1 s antes da wave ("⟡ INVESTIDA").

---

## 7. Economia e progressão in-run

### 7.1 Moedas

| Moeda | Escopo | Fonte | Gasta em |
|-------|--------|-------|----------|
| **Ouro** 🪙 | Run (zera ao fim) | Inimigos mortos | Upgrades in-run |
| **Núcleo** ◈ | Permanente | Fim de run | Árvore de talentos |
| **Gema** ♦ | Permanente | Bosses, missões, IAP | Continues, slots, cosméticos |
| **Éter** ✵ | Permanente (pós-rebirth) | Rebirth | Multiplicadores globais |

### 7.2 Upgrades in-run (painel inferior)

8 upgrades, sempre visíveis, com **compra por toque e por hold (auto-repeat após 400 ms)**.

| Upgrade | Efeito por nível | Custo base | Crescimento |
|---------|------------------|-----------|-------------|
| Dano | +12% do base (aditivo) | 20 | 1.115 |
| Cadência | +7% do base | 25 | 1.125 |
| Alcance | +8 unidades | 30 | 1.10 |
| Vida Máx. | +18 HP | 35 | 1.12 |
| Regeneração | +0.25 HP/s | 60 | 1.16 |
| Chance Crít. | +1.2% (cap 60%) | 55 | 1.14 |
| Dano Crít. | +0.07x | 70 | 1.15 |
| Ouro | +5% por morte | 60 | 1.16 |

```
cost(level) = floor(base * growth^level * metaCostMult)
```

**Regras de UX obrigatórias:**
- Botão fica *esmaecido* mas **nunca desaparece** quando não há ouro.
- Mostra `Lv.12` e o custo abreviado (`1.2K`).
- Botão "MAX" compra o máximo possível numa transação (fórmula de soma de PG fechada, não loop).
- Feedback: número flutuante `+12% DANO`, tick de áudio com pitch subindo por compra em sequência.

### 7.3 Cartas: cadência por wave

```
uma carta a cada BAL.progression.cardEveryWaves waves LIMPAS (5)
```

**Não há XP.** Com todos os inimigos de uma wave morrendo de qualquer forma, o XP só media waves decorridas com um passo a mais no meio — duas moedas para a mesma coisa. As cartas são um bônus leve sobre os upgrades de ouro, não o motor da run, e é por isso que a cadência é esparsa: uma run até a wave 20 oferece quatro.

Ofertas são **acumuladas**, não perdidas: se duas waves fecharem enquanto a tela está aberta, o jogador recebe as duas escolhas.

Ao ganhar uma carta: `timeScale` cai para 0.15 durante 0,35 s (efeito "impacto"), a wave **pausa** e aparece a tela de 3 cartas. Não há timer — o jogador escolhe no seu tempo. (Timer em tela de escolha é hostil no mobile: o jogador pode estar atravessando a rua.)

---

## 8. Cartas roguelite

O coração da rejogabilidade. Definidas em `src/data/cards.ts`.

### 8.1 Raridade e oferta

| Raridade | Peso base | Cor | Impacto |
|----------|-----------|-----|---------|
| Comum | 60 | cinza | Stat direto, forte |
| Rara | 28 | azul | Stat grande ou mecânica pequena |
| Épica | 10 | roxo | Nova mecânica |
| Lendária | 2 | dourado | Muda a build inteira |

- Sempre 3 opções, sem repetir na mesma oferta.
- Carta já no nível máximo não é oferecida.
- Botão **Reroll** (1 grátis por run + talentos meta + gemas).
- Cartas *evolutivas*: certas duplas se fundem ao atingir nível máximo (ex.: `Multishot Lv.5` + `Ricochete Lv.5` → **Tempestade de Flechas**). Isso dá o momento "descobri um combo" que segura o jogador.

### 8.2 Catálogo v1 (18 cartas)

**Comuns (níveis 1–5)**
1. `dmg_up` — Lâminas Afiadas: +18% dano
2. `rate_up` — Mecanismo Oleado: +12% cadência
3. `hp_up` — Muralha Reforçada: +15% vida máx. e cura o equivalente
4. `crit_up` — Ponto Fraco: +4% crít
5. `range_up` — Mira Longa: +12% alcance
6. `gold_up` — Ganância: +15% ouro
7. `speed_up` — Balística: +20% velocidade de projétil

**Raras (1–4)**
8. `multishot` — Tiro Múltiplo: +1 projétil (leque 12°), −8% dano/projétil
9. `pierce` — Perfurante: +1 perfuração
10. `slow_aura` — Aura Gélida: inimigos a <180 u ficam 22% mais lentos
11. `thorns` — Espinhos: reflete 35% do dano melee recebido
12. `lifesteal` — Sanguessuga: 1.5% do dano vira cura (cap 3 HP/hit)

**Épicas (1–3)**
13. `chain` — Corrente Arcana: projétil salta para +2 alvos a 140 u (60% dano por salto)
14. `orbital` — Sentinelas: 2 orbes giram a 90 u causando dano por contato
15. `explosive` — Carga Oca: projétil explode em raio 60 (50% do dano)
16. `frost_nova` — Nova Gélida: a cada 8 s, congela por 1,2 s tudo a <200 u

**Lendárias (1–2)**
17. `overcharge` — Sobrecarga: +100% cadência, mas a torre perde 1% da vida máx./s
18. `deathmark` — Marca Mortal: a cada 12º tiro, mata instantaneamente não-boss abaixo de 15% de HP; em boss, 4× dano

### 8.3 Contrato de dados

```ts
export interface CardDef {
  id: CardId;
  name: string;
  desc: (lvl: number) => string;      // texto localizável, gerado por nível
  rarity: Rarity;
  maxLevel: number;
  icon: SpriteKey;                     // resolve para placeholder até existir arte
  tags: CardTag[];                     // 'offense' | 'defense' | 'economy' | 'utility'
  apply: (s: RunStats, lvl: number) => void;   // PURA. Sem side-effects, sem RNG.
  requires?: CardId[];                 // gating de oferta
  evolvesWith?: { partner: CardId; into: CardId };
}
```

> **Regra dura:** `apply` é uma função pura sobre um objeto de stats. Cartas com comportamento (orbital, nova) registram uma *flag* em `RunStats` que um sistema dedicado lê. Nunca há gameplay dentro do arquivo de dados.

---

## 9. Habilidades ativas

3 slots, botões grandes no canto inferior direito, com anel de cooldown.

| id | Nome | CD | Efeito |
|----|------|----|--------|
| `nova` | Pulso de Choque | 20 s | 400% do dano num raio de 240, empurra 120 u |
| `fury` | Fúria | 35 s | +150% cadência e +40% dano por 8 s |
| `bulwark` | Baluarte | 45 s | Escudo absorvendo 25% da vida máx. por 10 s; reflete 100% |

Desbloqueadas na árvore meta. Melhoráveis (CD, potência). Com o talento "Automação", disparam sozinhas quando a condição é atendida — **o jogo precisa ser jogável com a tela desligada**, essa é a promessa do gênero idle.

---

## 10. Meta-progressão, prestige e idle offline

### 10.1 Núcleos e a árvore de talentos

```
Núcleos ganhos = floor((waveMax / 4)^1.6 * (1 + etherBonus))
```
Exemplos (sem bônus meta): wave 12 → 5 ◈ | wave 25 → 18 ◈ | wave 50 → 56 ◈ | wave 100 → 172 ◈ | wave 200 → 522 ◈

**Árvore** (`src/data/talents.ts`) — 4 ramos, ~10 nós cada, custo `base * 1.28^rank`:

| Ramo | Nós de exemplo |
|------|----------------|
| ⚔️ **Guerra** | Dano base, cadência base, crít, projétil inicial, dano vs boss |
| 🛡️ **Fortaleza** | Vida base, regen, redução de dano, i-frames, revive 1×/run |
| 💰 **Fortuna** | Ouro+, custo de upgrade−, ouro inicial, taxa offline |
| ✦ **Arcano** | Slot de habilidade, rerolls, chance de rara/épica, sorte de carta |

Cada nó tem 5–10 ranks. Respec grátis e ilimitado (nada de punir experimentação).

### 10.2 Ganhos offline

```
offlineRate   = bestGoldPerMin * 0.55 * (1 + talentOfflineBonus)
offlineCap    = 8h (base) → até 24h por talentos
offlineNucleos = floor(offlineMinutes * bestNucleosPerMin * 0.35)
```
- Tela de retorno: "Você esteve fora 6h 12min → +12.4K 🪙 · +48 ◈", com botão **×2 assistindo anúncio**.
- Baseado no relógio do dispositivo, com salvaguarda: se `now < lastSave`, considera 0 (usuário voltou o relógio) e registra flag.

### 10.3 Prestige / Rebirth

Desbloqueia ao atingir wave 100. Reseta Núcleos e talentos; concede **Éter**:
```
ether = floor((waveMax - 60) ^ 0.9 / 3)
```
Éter dá multiplicadores globais permanentes (+dano, +ouro, +offline) e abre novos ramos da árvore. Ciclo alvo de rebirth: 2–4 dias de jogo por rebirth nos primeiros; depois acelera.

---

## 11. UI/UX mobile

### 11.1 Layout (retrato)

```
┌─────────────────────────────┐
│ ◈ 1.2K  ♦ 45      ⚙  ⏸     │  ← barra superior (safe-area top)
│  ▓▓▓▓▓▓▓▓░░ BOSS: COLOSSO   │  ← barra de boss (condicional)
│                             │
│                             │
│           ARENA             │  ← área de jogo
│            ███              │
│                             │
│                             │
│                        [⚡] │  ← habilidades (lado do polegar)
│  🪙 4.7K            [PERTO] │  ← ouro + política de mira
│  CARTA EM 3                 │
│  ▓▓ 219/240 ▓░░             │  ← HP: 1/4 da largura, número dentro
│ ┌────┬────┬────┬────┐ ┌──┐  │
│ │DANO│CAD │ALC │VIDA│ │ON│  │  ← grid 4×2 + trilho: ONDA (timer) …
│ ├────┼────┼────┼────┤ ├──┤  │
│ │REG │CRIT│DCRT│OURO│ │MX│  │  … e MAX
│ └────┴────┴────┴────┘ └──┘  │
└─────────────────────────────┘  ← safe-area bottom
```

### 11.2 Regras não negociáveis

1. **Alvo de toque ≥ 48×48 dp** e ≥ 8 dp de espaçamento entre alvos.
2. **Zona do polegar:** tudo que é tocado com frequência fica nos 35% inferiores da tela.
3. **Nenhuma UI cobre a torre.** A torre nunca é obstruída — o jogador precisa ver seu HP e o cerco.
4. **Toda ação tem resposta em <100 ms:** visual (escala/flash), áudio e háptico (`Haptics.impact` leve).
5. **Sem texto abaixo de 14 dp.**
6. **Números sempre abreviados**: `1.2K`, `45.8M`, `3.1aa` (ver §22).
7. **Uma tela modal por vez.** Nunca empilhar diálogos.
8. **Botão físico "voltar" (Android)** fecha modal; na tela raiz, pede confirmação para sair.

### 11.3 Camada de UI

DOM/HTML+CSS **por cima** do canvas, não desenhado no canvas.
**Motivo:** acessibilidade nativa, escala de fonte do sistema, safe areas, tempo de iteração 10× menor, e o canvas fica livre para gastar seus 16 ms com o jogo. Apenas elementos *diegéticos* (números de dano flutuantes, barras de vida sobre inimigos, telegraphs) são desenhados no canvas.

Regras: `pointer-events: none` no container de UI, `auto` só nos elementos interativos. `will-change: transform` apenas em elementos animados. Nunca ler layout (`offsetWidth`) dentro do loop.

### 11.4 Acessibilidade

- Opções: reduzir flash, reduzir shake, reduzir partículas, daltonismo (paleta alternativa), tamanho da UI (S/M/G), canhoto (espelha os botões de habilidade).
- Contraste WCAG AA em todo texto de HUD.

---

## 12. Arquitetura técnica

### 12.1 Princípios

1. **Dados fora do código.** Todo número de balanceamento vive em `src/data/`. Um designer (ou você daqui a 3 meses) muda balanceamento sem tocar em lógica.
2. **Zero alocação no loop quente.** Nada de `new`, `{}`, `[]`, `.map`, `.filter`, closures ou `Array.from` dentro de update/render. GC pause = frame drop = review 1 estrela.
3. **Pools tipados, não ECS genérico.** ECS de propósito geral custa indireção. Usamos *struct-of-arrays* com free-list por tipo de entidade: cache-friendly, simples de depurar, rápido.
4. **Simulação determinística.** PRNG semeado, timestep fixo. Bug reproduzível = bug consertável.
5. **Renderer burro.** O render lê estado e desenha. Não decide nada, não muta nada.
6. **Uma direção de dependência:** `data → core → systems → render → ui`. Nunca o contrário. `core` não sabe que Canvas existe.

### 12.2 Game loop

```ts
const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;        // trava a espiral da morte
let acc = 0, prev = performance.now();

function frame(now: number) {
  requestAnimationFrame(frame);
  let delta = Math.min((now - prev) / 1000, MAX_FRAME);
  prev = now;
  acc += delta * game.timeScale;          // timeScale: slow-mo, pausa, 2× (idle)

  let steps = 0;
  while (acc >= FIXED_DT && steps++ < 5) { // no máx. 5 catch-ups por frame
    simulate(FIXED_DT);
    acc -= FIXED_DT;
  }
  render(acc / FIXED_DT);                  // alpha de interpolação
}
```

- **Update e render desacoplados.** Posições são interpoladas entre `prevX/prevY` e `x/y` no render → movimento suave mesmo com jitter de rAF.
- `visibilitychange` → pausa e grava o timestamp para o cálculo offline.
- Aba em background não simula (o navegador estrangula o rAF de qualquer forma).

### 12.3 Ordem dos sistemas (por tick)

```
1.  input.flush()            → consome eventos enfileirados
2.  spawner.update()         → cria inimigos da wave
3.  ai.update()              → steering, separação, decisão de estado
4.  movement.integrate()     → aplica velocidade, salva prev*
5.  spatialHash.rebuild()    → grid de 64 u
6.  targeting.update()       → 10 Hz, escolhe alvo da torre
7.  weapons.update()         → cadência, spawna projéteis
8.  projectiles.update()     → move, colide (broad-phase no grid), pierce/chain
9.  abilities.update()       → cooldowns, efeitos ativos
10. auras.update()           → 10 Hz: slow, cura de mender, orbitais
11. damage.resolve()         → fila de dano → HP, crit, morte
12. rewards.update()         → publica o ouro creditado no tick (um evento)
13. status.update()          → burn/slow/freeze, ticks
14. waves.update()           → checa fim de wave, avança
15. progression.update()     → conta waves limpas, dispara tela de cartas
16. particles.update()       → VFX, números de dano
17. camera.update()          → trauma/shake
18. audio.flush()            → toca a fila de sons deduplicada
19. save.maybeAutosave()     → debounce de 10 s
```

**Fila de dano:** nenhum sistema aplica dano direto. Todos empurram em `damageQueue` (array pré-alocado de structs) e `damage.resolve()` processa. Isso mata bugs de ordem e torna trivial logar/testar.

### 12.4 Pools de entidades (SoA)

```ts
// Exemplo: EnemyPool. O mesmo padrão para Projectile, Particle, DamageNumber.
class EnemyPool {
  cap: number;
  // hot data (tocado todo tick) — Float32Array
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  prevX: Float32Array; prevY: Float32Array;
  hp: Float32Array;  hpMax: Float32Array; radius: Float32Array; speed: Float32Array;
  // cold data / enums — tipados menores
  defIdx: Uint8Array; state: Uint8Array; flags: Uint16Array; animFrame: Uint8Array;
  animT: Float32Array; hitFlash: Float32Array;
  alive: Uint8Array;
  freeList: Int32Array; freeCount: number;
  count: number;             // high-water mark para iteração
  spawn(defIdx, x, y, hpMul): number;  // retorna índice, -1 se cheio
  kill(i: number): void;
}
```

- Capacidades: `ENEMY_CAP = 400`, `PROJ_CAP = 800`, `PARTICLE_CAP = 1200`, `DMGNUM_CAP = 120`.
- **Pool cheio nunca cresce** — descarta o mais antigo/menos importante (partículas) ou pula o spawn (inimigos). Crescer no meio da run causa stall.
- Iteração: `for (let i = 0; i < pool.count; i++) if (pool.alive[i]) {...}` — sem iteradores, sem callbacks.

### 12.5 Colisão

- **Spatial hash** uniforme, célula 64 u, reconstruído por tick com arrays pré-alocados (`cellStart: Int32Array`, `cellItems: Int32Array` — counting sort, zero alocação).
- Broad-phase: projétil consulta as 9 células vizinhas. Narrow-phase: círculo-círculo com distância ao quadrado (`dx*dx+dy*dy <= r*r`, nunca `Math.sqrt`).
- Projéteis rápidos usam **swept test** (segmento-círculo) para não atravessar inimigo entre frames.

### 12.6 Estado e máquina de telas

```
BOOT → LOADING → MENU ⇄ TALENTS
                  ↓
                 RUN ⇄ CARD_PICK ⇄ PAUSE
                  ↓
               RESULT → MENU
```
`SceneManager` com `enter/exit/update/render`. Um único `GameState` serializável na raiz. Nada de estado global espalhado em módulos.

### 12.7 Números grandes

`number` (float64) cobre até ~1.8e308, muito além do necessário. **Não** vamos usar biblioteca de decimal. Regras:
- Comparações de ouro sempre com tolerância nas somas de PG.
- Formatação via `fmt(n)`: `K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc`, depois `aa, ab, ac…`.
- Se a telemetria mostrar ouro passando de 1e250, aí sim consideramos mantissa+expoente. Registrado como risco em PROGRESS.md.

---

## 13. Sistema de sprites e assets

> ⭐ **Este é um requisito explícito do projeto: o jogo deve ser inteiramente jogável e bonito ANTES de existir qualquer arte, e a arte deve entrar depois sem tocar em uma única linha de gameplay.**

### 13.1 O contrato

Nenhum sistema de jogo conhece imagens. Uma entidade guarda apenas:

```ts
spriteKey: SpriteKey      // string tipada, ex.: 'enemy/grunt/walk_00'
animId:   AnimId | 0      // 0 = estático
```

Todo desenho passa por **uma** função:

```ts
drawSprite(ctx, key: SpriteKey, x, y, rot, scale, alpha, tint?)
```

Que resolve nesta ordem:
1. Frame existe no atlas carregado → `ctx.drawImage(atlasImage, sx,sy,sw,sh, dx,dy,dw,dh)` (9 argumentos, sempre).
2. Não existe → chama o **placeholder procedural** registrado para essa key.
3. Não há placeholder → desenha um quadrado magenta 16×16 e loga o aviso **uma única vez** por key.

**Consequência:** trocar placeholder por arte final = soltar o PNG na pasta e rodar `npm run atlas`. Zero mudança de código.

### 13.2 Placeholders procedurais

`src/render/placeholders.ts` mapeia key → função de desenho vetorial. Não são retângulos feios: são formas com a silhueta e a cor corretas do arquétipo (§5.1), o que já entrega o pilar P5 (leitura instantânea) sem nenhum artista.

```ts
registerPlaceholder('enemy/grunt/*',  (c,s) => poly(c, 6, s*0.5, '#5c8a3a', '#2e4a1c'));
registerPlaceholder('enemy/runner/*', (c,s) => tri(c, s*0.55, '#d9c33a', '#7a6c10'));
registerPlaceholder('tower/base',     drawTowerBase);
```

Padrões com `*` casam por prefixo. O placeholder recebe o contexto já transladado/rotacionado/escalado — ele desenha em espaço local centrado na origem.

### 13.3 Formato do atlas

`assets/atlas/<name>.json` + `<name>.png` (também `<name>@2x.png`).

```json
{
  "meta": { "image": "game.png", "size": {"w":2048,"h":2048}, "scale": 1, "version": 1 },
  "frames": {
    "enemy/grunt/walk_00": { "frame": {"x":2,"y":2,"w":48,"h":48},
                             "pivot": {"x":0.5,"y":0.5},
                             "trimmed": false,
                             "spriteSourceSize": {"x":0,"y":0,"w":48,"h":48},
                             "sourceSize": {"w":48,"h":48} }
  }
}
```

- Suporta **trim** (bordas transparentes removidas) e **pivot** por frame.
- Padding de 2 px entre frames (evita sangramento em escala não inteira).
- `@2x` escolhido quando `dpr >= 1.5`.

### 13.4 Pipeline de arte

```
assets/src/**/*.png          ← PNGs individuais, o nome da pasta+arquivo VIRA a key
        │                       assets/src/enemy/grunt/walk_00.png → 'enemy/grunt/walk_00'
        ▼  npm run atlas  (tools/pack-atlas.mjs — maxrects + sharp)
assets/atlas/game.json + game.png (+ @2x)
        │
        ▼  gera também
src/render/spriteKeys.gen.ts  ← `export type SpriteKey = 'enemy/grunt/walk_00' | ...`
```

O tipo gerado faz o **TypeScript quebrar o build** se alguém referenciar uma sprite inexistente. Enquanto não há arte, o arquivo gerado contém as keys declaradas manualmente em `src/render/spriteKeys.manual.ts` — as mesmas que os placeholders registram. Uma fonte, dois consumidores.

### 13.5 Animação

```ts
// src/data/anims.ts
export const ANIMS = {
  grunt_walk:  { frames: ['enemy/grunt/walk_00','enemy/grunt/walk_01','enemy/grunt/walk_02','enemy/grunt/walk_03'], fps: 8,  loop: true },
  grunt_death: { frames: [...],                                     fps: 14, loop: false, onEnd: 'kill' },
} as const;
```
- `animT` e `animFrame` vivem no pool (typed arrays). O avanço de frame é uma soma e um módulo — sem objetos por entidade.
- Se um frame não existir, o resolver cai no placeholder: **a animação nunca quebra o jogo**.

### 13.6 Carregamento

- `AssetRegistry.loadManifest()` no estado `LOADING`, com barra de progresso real.
- Imagens via `createImageBitmap` (decodifica fora da main thread) com fallback para `Image()`.
- **O jogo é jogável mesmo com falha total de carregamento** — todos os placeholders funcionam. Isso não é um detalhe: é a garantia de que nunca teremos uma tela branca em produção.

### 13.7 Diretrizes de arte (para quando entrar)

| Item | Especificação |
|------|---------------|
| Perspectiva | Top-down direto (90°) ou 3/4 leve. Consistente em tudo |
| Grid | Inimigo comum: 48×48 · Brute: 80×80 · Boss: 192×192 · Torre: 128×160 · Projétil: 24×24 |
| Direção | Sprites desenhados **apontando para a DIREITA** (0 rad). O renderer rotaciona |
| Contorno | Outline escuro de 2 px em toda unidade — legibilidade sobre qualquer chão |
| Cor | Cada arquétipo tem um matiz travado (§5.1). Elite = overlay dourado, não recolorir |
| Frames | Walk: 4–6 · Attack: 3–4 · Death: 5–6 |
| Formato | PNG-24 com alpha premultiplicado desligado; sem embutir perfil de cor |

---

## 14. Áudio

- **WebAudio API**, não `<audio>`. Um `AudioContext` desbloqueado no primeiro `pointerdown` (obrigatório em iOS).
- Buffers pré-decodificados; formato `.webm/opus` com fallback `.m4a` para Safari antigo.
- **Deduplicação:** no máximo 3 instâncias do mesmo SFX por frame; acima disso, sobe o ganho em vez de empilhar vozes. Sem isso, 40 inimigos morrendo viram um estouro.
- Variação de pitch aleatória ±8% em sons repetitivos (tiro, hit) para não fatigar.
- Ducking da música em boss spawn.
- Barramentos separados `music` / `sfx` / `ui`, sliders nas opções, mudo automático ao perder o foco.
- **Fallback silencioso:** áudio ausente nunca quebra o jogo (mesmo contrato dos sprites).

---

## 15. Save, migrações e anti-cheat leve

### 15.1 Armazenamento

- Web: `localStorage` (síncrono, suficiente para <100 KB).
- Nativo: **`@capacitor/preferences`** (sobrevive à limpeza de dados do WebView — o `localStorage` do WebView *não* é confiável no Android).
- Uma camada `Storage` abstrai os dois. `save.ts` não sabe onde está rodando.

### 15.2 Formato

O save nasce em `v: 1`. O exemplo abaixo é a forma da v1; toda alteração de campo **incrementa a versão e ganha uma função de migração** (`v1→v2→v3…`).

```ts
interface SaveV1 {
  v: 1;
  meta:  { nucleos, gemas, ether, talents: Record<TalentId, number>, unlocks: string[] };
  stats: { totalRuns, bestWave, bestWaveEver, totalKills, playTimeSec, firstSeenAt };
  prefs: { sfx, music, haptics, reduceFlash, reduceShake, particleLevel, lefty, lang };
  idle:  { lastSeenAt, bestGoldPerMin, bestNucleosPerMin };
  run?:  RunSnapshot;             // run em andamento — permite fechar o app no meio
  sig:   string;                  // hash simples do payload
}
```

### 15.3 Regras

- **Autosave** a cada 10 s (debounced), no fim de wave, ao pausar e em `visibilitychange`.
- **Migrações versionadas** obrigatórias: `migrate(save)` roda a cadeia `v1→v2→v3…` até a versão atual. Nunca descartar save do jogador. Isso é o item nº 1 de "coisas que geram avaliação 1 estrela".
- **Escrever em slot duplo** (`save_a` / `save_b` alternando) + carregar o mais novo válido. Protege contra corrupção por matar o app durante a escrita.
- **`sig`**: hash não-criptográfico do payload com um salt. Não impede cheat determinado (é client-side, nada impede), mas barra o edit trivial de `localStorage`. Save com assinatura inválida carrega em **modo somente-local** (sem leaderboard). Não deletamos o save do jogador por isso.
- **Botão Exportar/Importar save** (base64) nas opções — barato de fazer e salva o suporte ao cliente.

---

## 16. Performance: orçamento e regras

### 16.1 Dispositivo de referência

**Android de baixo custo ~2021** (Snapdragon 665 / Helio G35, 3 GB RAM, 720×1600). Se roda liso ali, roda em tudo.

### 16.2 Orçamento por frame (16,6 ms)

| Fase | Orçamento |
|------|-----------|
| Simulação (todos os sistemas) | 5,0 ms |
| Render (canvas) | 7,0 ms |
| UI (DOM) | 1,5 ms |
| Folga / navegador | 3,1 ms |

### 16.3 Metas de carga

- 250 inimigos + 400 projéteis + 800 partículas simultâneos a 60 FPS.
- Tempo até interativo < 2,5 s em 4G.
- Bundle inicial (JS+CSS gzip) **< 180 KB**. Atlas carregado em paralelo.
- Zero GC major durante uma run de 10 min (verificar no perfil de memória do DevTools: serrilhado plano, sem dentes de serra).

### 16.4 Regras de render

1. **Um único canvas** para o jogo. (Camadas extras só se o perfil provar necessidade — cada canvas é uma composição a mais.)
2. `ctx.getContext('2d', { alpha: false })` no canvas principal → o navegador pula a composição de transparência.
3. **Ordenar por textura, depois por Y** para minimizar troca de estado; `save()/restore()` são caros — use `setTransform` direto.
4. Chão estático (grid, vinheta) **pré-renderizado uma vez** em um canvas offscreen e blitado.
5. Sombras (`ctx.shadowBlur`) e `filter` são **proibidos** no loop. Custam 10–50× um drawImage.
6. Texto no canvas é caro: números de dano usam um **atlas de dígitos pré-renderizado**, não `fillText`.
7. Partículas: sem rotação individual quando possível; `globalAlpha` agrupado por lote.
8. **Degradação automática:** um monitor de FPS reduz `particleLevel` (Alto→Médio→Baixo) se a média de 2 s cair abaixo de 50 FPS, e avisa discretamente. O jogo se auto-preserva.

### 16.5 Proibido no loop quente

```
new / {} / [] / => (closure criada por frame) / .map .filter .forEach .reduce
Math.sqrt (use quadrado) / Math.hypot / string concat / JSON / try-catch em hot path
Object.keys / spread / destructuring de objeto temporário / instanceof
```

---

## 17. Build, Capacitor e distribuição

### 17.1 Scripts

```jsonc
{
  "dev":       "vite",
  "build":     "tsc --noEmit && vite build",
  "preview":   "vite preview --host",
  "atlas":     "node tools/pack-atlas.mjs",
  "test":      "vitest run",
  "test:watch":"vitest",
  "lint":      "eslint src --max-warnings 0",
  "typecheck": "tsc --noEmit",
  "balance":   "node tools/sim-balance.mjs",   // simulação headless de curvas
  "cap:sync":  "npm run build && npx cap sync",
  "android":   "npm run cap:sync && npx cap open android",
  "ios":       "npm run cap:sync && npx cap open ios"
}
```

### 17.2 Configuração Capacitor

```ts
// capacitor.config.ts
{
  appId: 'com.ironspire.game',
  appName: 'Iron Spire',
  webDir: 'dist',
  android: { backgroundColor: '#0b0d12', allowMixedContent: false },
  ios:     { contentInset: 'never', backgroundColor: '#0b0d12' },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0b0d12' },
    StatusBar:    { style: 'DARK', overlaysWebView: true },
  }
}
```

**Plugins:** `@capacitor/preferences`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/app` (back button + lifecycle), `@capacitor/keep-awake`.

### 17.3 Regras mobile obrigatórias

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1,
      user-scalable=no, viewport-fit=cover">
```
```css
html, body { overscroll-behavior: none; touch-action: none;
             -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
```
- `app.addListener('backButton')` tratado explicitamente (Android).
- `pause`/`resume` do Capacitor → salvar e registrar timestamp offline.
- `KeepAwake` ativo somente durante a run.
- Orientação travada em **portrait** no manifesto/Info.plist.

### 17.4 PWA

`manifest.webmanifest` + service worker de cache (Workbox opcional, ou SW manual de ~40 linhas — prefira o manual, é menos dependência). Permite testar em celular real sem build nativo: `npm run preview -- --host` e abrir o IP na rede local.

---

## 18. Monetização

Desenhada agora, **implementada no M8**. O design precisa conhecê-la desde já para não virar remendo.

| Produto | Tipo | Preço alvo |
|---------|------|-----------|
| Remover anúncios forçados | IAP não-consumível | US$ 2,99 |
| Pacotes de gemas | IAP consumível | US$ 0,99 – 19,99 |
| Passe de temporada | Assinatura | US$ 4,99/mês |
| ×2 ganho offline permanente | IAP não-consumível | US$ 4,99 |
| Anúncio recompensado | Rewarded | ×2 offline, reroll, revive, ×2 recompensa de run |

**Princípios:**
- **Nunca** anúncio intersticial no meio de uma run. Só entre telas, e no máximo 1 a cada 4 min.
- Anúncio recompensado é sempre **opt-in explícito** e o botão nunca fica onde estava outro botão (nada de tap acidental).
- Nada de *pay-to-skip-wall* agressivo. O funil é: retenção → hábito → conversão.
- **Compliance:** COPPA/GDPR-K, política de família da Play Store, `AppTrackingTransparency` no iOS. Se mirarmos 13+, declarar corretamente na ficha da loja.

---

## 19. Testes e qualidade

### 19.1 Testes automatizados (Vitest)

| Área | O que testar |
|------|--------------|
| `balance` | Curvas monotônicas, sem NaN/Infinity até a wave 500, custo MAX == soma de PG |
| `save` | Migração v1→v2→v3, save corrompido, slot duplo, relógio para trás |
| `spatialHash` | Consulta retorna exatamente os vizinhos corretos (fuzz vs. força bruta) |
| `damage` | Ordem de camadas de stat, crít, redução, cap de lifesteal |
| `pools` | Spawn/kill/reuso, pool cheio não corrompe, free-list íntegra após 10⁶ ops |
| `cards` | `apply` é pura e idempotente por nível; nenhuma carta gera NaN |
| `rng` | Mulberry32 reprodutível a partir do seed |
| `format` | `fmt()` em todas as faixas, incluindo negativos e 0 |

**Meta:** ≥80% de cobertura em `src/core/` e `src/data/`. Render e UI não são testados por unidade.

### 19.2 Verificação manual (checklist por milestone)

- [ ] 60 FPS estável no dispositivo de referência (ou throttle 6× no DevTools) por 5 min
- [ ] Nenhum erro/aviso no console
- [ ] Sem vazamento de memória (heap plano após 10 min)
- [ ] Funciona com o atlas **removido** (todos os placeholders)
- [ ] Funciona offline (após primeiro load)
- [ ] Save sobrevive a kill do app no meio da run
- [ ] Toques funcionam com o notch/safe-area (testar em iPhone com Dynamic Island)

### 19.3 Simulação de balanceamento

`tools/sim-balance.mjs`: roda o núcleo do jogo headless, com N políticas de jogador (gastar tudo em dano / espalhado / ótimo guloso), e imprime a wave alcançada, ouro/min e curva de poder. **Balanceamento por simulação, não por achismo.** Roda em CI e falha se a wave média sair da faixa alvo.

---

## 20. Estrutura de pastas

```
iron-spire/
├── CLAUDE.md
├── SPEC.md
├── PROGRESS.md
├── index.html
├── package.json  tsconfig.json  vite.config.ts  capacitor.config.ts
├── tools/
│   ├── pack-atlas.mjs          # PNGs → atlas + spriteKeys.gen.ts
│   └── sim-balance.mjs         # simulação headless
├── assets/
│   ├── src/                    # PNGs individuais (fonte da arte)
│   ├── atlas/                  # gerado — não editar à mão
│   └── audio/
├── public/                     # manifest, ícones, SW
└── src/
    ├── main.ts                 # bootstrap, canvas, loop
    ├── core/                   # PURO. Sem DOM, sem Canvas. Testável.
    │   ├── loop.ts  time.ts  rng.ts  math.ts  pool.ts  spatialHash.ts
    │   ├── events.ts  state.ts  format.ts
    ├── data/                   # SÓ DADOS. Sem lógica.
    │   ├── balance.ts  enemies.ts  waves.ts  upgrades.ts  cards.ts
    │   ├── talents.ts  abilities.ts  anims.ts  audio.ts  strings.pt.ts
    ├── entities/
    │   ├── enemyPool.ts  projectilePool.ts  particlePool.ts
    │   ├── damageNumberPool.ts  tower.ts
    ├── systems/
    │   ├── spawner.ts  ai.ts  movement.ts  targeting.ts  weapons.ts
    │   ├── projectiles.ts  damage.ts  auras.ts  abilities.ts  status.ts
    │   ├── rewards.ts  waves.ts  progression.ts  camera.ts
    ├── render/
    │   ├── renderer.ts  drawSprite.ts  assetRegistry.ts  atlas.ts
    │   ├── placeholders.ts  spriteKeys.manual.ts  spriteKeys.gen.ts
    │   ├── layers.ts  vfx.ts  digitAtlas.ts
    ├── ui/                     # DOM
    │   ├── hud.ts  upgradePanel.ts  cardPicker.ts  talentTree.ts
    │   ├── menus.ts  modals.ts  toast.ts  styles.css
    ├── platform/
    │   ├── storage.ts  haptics.ts  lifecycle.ts  audio.ts  ads.stub.ts
    └── save/
        ├── save.ts  migrations.ts  schema.ts
```

---

## 21. Escopo: dentro / fora

### ✅ Dentro do V1 (vertical slice → jogo completo)

Torre central auto-atacante · 9 arquétipos de inimigo · 3 bosses · elites com afixos · 8 upgrades in-run · 18 cartas · 3 habilidades · árvore de 4 ramos · ganho offline · prestige · save robusto · PT-BR + EN · build Android/iOS via Capacitor · placeholders procedurais completos.

### ❌ Fora do V1 (registrar como ideia, não implementar)

Multiplayer · leaderboard online · contas/cloud save · múltiplas torres ou posicionamento · construção de mapa · equipamentos com loot aleatório · guildas/clãs · eventos ao vivo · gacha · scroll de câmera / arenas grandes · 3D · editor de níveis.

> **Regra:** qualquer item desta lista que apareça durante o desenvolvimento vai para a seção "Ideias" do PROGRESS.md. Não se implementa. Escopo é o que mata projeto de jogo.

---

## 22. Glossário e constantes canônicas

| Termo | Significado |
|-------|-------------|
| **u** | Unidade virtual (1/720 da largura de design) |
| **tick** | Um passo de simulação de 1/60 s |
| **run** | Uma partida, do início até a morte/retirada |
| **meta** | Progressão que persiste entre runs |
| **pool** | Array pré-alocado de entidades com free-list |
| **SoA** | Struct-of-Arrays: um array por campo, não um array de objetos |
| **placeholder** | Desenho vetorial procedural que substitui um sprite ausente |

### Constantes globais (`src/core/constants.ts`)

```ts
export const VW = 720, VH = 1280;
export const TOWER_X = 360, TOWER_Y = 620;
export const R_SPAWN = 560, R_DESPAWN = 700, R_TOWER_BODY = 34;
export const FIXED_DT = 1 / 60, MAX_FRAME = 0.25, MAX_CATCHUP = 5;
export const CELL_SIZE = 64;
export const ENEMY_CAP = 400, PROJ_CAP = 800, PARTICLE_CAP = 1200,
             DMGNUM_CAP = 120;
export const TARGETING_HZ = 10, AURA_HZ = 10;
export const AUTOSAVE_SEC = 10, WAVE_GAP = 2.0;
export const IFRAME_SEC = 0.25;
export const MAX_DPR = 2;
```

### Sufixos de formatação (`fmt`)

`'', K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc` → depois `aa, ab, ac, …, az, ba, …`

---

## Referências consultadas

- [Evil Tower – Idle Defense TD (Google Play)](https://play.google.com/store/apps/details?id=com.aurecas.eviltower) — loop de wave, progressão contínua, ganho offline
- [Evil Tower – guia de mecânicas](https://www.cityparkgames.com/games/evil-tower-idle-defense-td) — estrutura de upgrades roguelike por batalha
- [Arrow Quest: Idle defense RPG (Google Play)](https://play.google.com/store/apps/details?id=com.Wispwood.ArrowQuest) — torre única, AFK, bosses com padrão, sistema de pesquisa
- [HTML5 Canvas Performance and Optimization](https://gist.github.com/jaredwilli/5469626) — regras de batching e estado de contexto
- [Optimizing HTML5 Canvas for game performance](https://codetheory.in/optimizing-html5-canvas-to-improve-your-game-performance/) — pré-render offscreen, evitar shadow/filter
- [Game Dev Without An Engine: The 2025/2026 Renaissance](https://www.sitepoint.com/game-dev-without-an-engine-the-2025-2026-renaissance/) — justificativa da stack sem engine
