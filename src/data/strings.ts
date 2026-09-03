/**
 * UI strings (SPEC §21: PT-BR and EN in V1).
 *
 * Keys are grouped by screen. `t()` falls back to Portuguese for any key a
 * translation has not caught up with, so a missing string is a slightly wrong
 * language, never an empty button.
 */
export const STRINGS_PT = {
  'menu.play': 'JOGAR',
  'menu.resume': 'CONTINUAR RUN',
  'menu.talents': 'TALENTOS',
  'menu.options': 'OPÇÕES',
  'menu.tagline': 'Fique. Fique mais forte que elas.',

  'hud.wave': 'ONDA',
  'hud.level': 'Nv.',
  'hud.nextWave': 'PRÓXIMA ONDA',

  'policy.closest': 'PERTO',
  'policy.strongest': 'FORTE',
  'policy.weakest': 'FRACO',
  'policy.fastest': 'RÁPIDO',
  'policy.bossFirst': 'CHEFE',

  'pause.title': 'PAUSA',
  'pause.resume': 'CONTINUAR',
  'pause.retreat': 'RETIRAR-SE (100% da recompensa)',

  'result.died': 'A TORRE CAIU',
  'result.retreat': 'RETIRADA',
  'result.wave': 'Onda alcançada',
  'result.kills': 'Abates',
  'result.time': 'Tempo',
  'result.gold': 'Ouro ganho',
  'result.cores': 'Núcleos ◈',
  'result.again': 'JOGAR DE NOVO',
  'result.menu': 'MENU',

  'cards.title': 'NÍVEL',
  'cards.new': 'NOVA',
  'cards.reroll': 'RESORTEAR',

  'talents.title': 'TALENTOS',
  'talents.respec': 'RESPEC GRÁTIS',
  'talents.back': 'VOLTAR',
  'talents.rebirth': 'RENASCER',
  'talents.rebirthConfirm': 'CONFIRMAR: zera Núcleos e talentos',
  'talents.max': 'MÁX',

  'options.title': 'OPÇÕES',
  'options.sfx': 'Efeitos',
  'options.music': 'Música',
  'options.haptics': 'Vibração',
  'options.reduceFlash': 'Reduzir flashes',
  'options.reduceShake': 'Reduzir tremor',
  'options.lefty': 'Modo canhoto',
  'options.uiScale': 'Tamanho da interface',
  'options.backup': 'Backup do save',
  'options.export': 'EXPORTAR',
  'options.import': 'IMPORTAR',
  'options.exported': 'Código gerado — copie e guarde.',
  'options.imported': 'Save importado.',
  'options.importFailed': 'Código inválido.',
  'options.on': 'LIGADO',
  'options.off': 'DESLIGADO',

  'offline.title': 'BEM-VINDO DE VOLTA',
  'offline.away': 'Você esteve fora',
  'offline.claim': 'COLETAR',
  'offline.capped': 'Limite de acúmulo atingido',

  'error.title': 'ALGO QUEBROU',
  'error.body': 'O jogo encontrou um erro. Seu progresso está salvo.',
  'error.copy': 'COPIAR RELATÓRIO',
  'error.copied': 'Copiado.',
  'error.reload': 'RECARREGAR',

  'quality.reduced': 'Qualidade reduzida para manter a fluidez',

  'tutorial.upgrades': 'Toque para comprar. Segure para comprar em sequência.',
  'tutorial.cards': 'Suba de nível para escolher uma carta.',
  'tutorial.nextWave': 'Chame a próxima onda mais cedo para ganhar ouro extra.',
} as const;

export type StringKey = keyof typeof STRINGS_PT;

/**
 * English. Intentionally incomplete keys fall through to Portuguese rather than
 * rendering a key name at the player.
 */
export const STRINGS_EN: Partial<Record<StringKey, string>> = {
  'menu.play': 'PLAY',
  'menu.resume': 'RESUME RUN',
  'menu.talents': 'TALENTS',
  'menu.options': 'OPTIONS',
  'menu.tagline': 'Stand. Outlast them.',

  'hud.wave': 'WAVE',
  'hud.level': 'Lv.',
  'hud.nextWave': 'NEXT WAVE',

  'policy.closest': 'CLOSE',
  'policy.strongest': 'STRONG',
  'policy.weakest': 'WEAK',
  'policy.fastest': 'FAST',
  'policy.bossFirst': 'BOSS',

  'pause.title': 'PAUSED',
  'pause.resume': 'RESUME',
  'pause.retreat': 'RETREAT (100% reward)',

  'result.died': 'THE SPIRE FELL',
  'result.retreat': 'RETREAT',
  'result.wave': 'Wave reached',
  'result.kills': 'Kills',
  'result.time': 'Time',
  'result.gold': 'Gold earned',
  'result.cores': 'Cores ◈',
  'result.again': 'PLAY AGAIN',
  'result.menu': 'MENU',

  'cards.title': 'LEVEL',
  'cards.new': 'NEW',
  'cards.reroll': 'REROLL',

  'talents.title': 'TALENTS',
  'talents.respec': 'FREE RESPEC',
  'talents.back': 'BACK',
  'talents.rebirth': 'REBIRTH',
  'talents.rebirthConfirm': 'CONFIRM: resets Cores and talents',
  'talents.max': 'MAX',

  'options.title': 'OPTIONS',
  'options.sfx': 'Sound effects',
  'options.music': 'Music',
  'options.haptics': 'Haptics',
  'options.reduceFlash': 'Reduce flashes',
  'options.reduceShake': 'Reduce shake',
  'options.lefty': 'Left-handed mode',
  'options.uiScale': 'Interface size',
  'options.backup': 'Save backup',
  'options.export': 'EXPORT',
  'options.import': 'IMPORT',
  'options.exported': 'Code generated — copy and keep it.',
  'options.imported': 'Save imported.',
  'options.importFailed': 'Invalid code.',
  'options.on': 'ON',
  'options.off': 'OFF',

  'offline.title': 'WELCOME BACK',
  'offline.away': 'You were away for',
  'offline.claim': 'CLAIM',
  'offline.capped': 'Offline cap reached',

  'error.title': 'SOMETHING BROKE',
  'error.body': 'The game hit an error. Your progress is saved.',
  'error.copy': 'COPY REPORT',
  'error.copied': 'Copied.',
  'error.reload': 'RELOAD',

  'quality.reduced': 'Quality reduced to keep things smooth',

  'tutorial.upgrades': 'Tap to buy. Hold to keep buying.',
  'tutorial.cards': 'Level up to pick a card.',
  'tutorial.nextWave': 'Call the next wave early for bonus gold.',
};

let table: Partial<Record<StringKey, string>> = STRINGS_PT;

export function setLanguage(lang: string): void {
  table = lang === 'en' ? STRINGS_EN : STRINGS_PT;
}

/** Looks up a string, falling back to Portuguese, then to the key itself. */
export function t(key: StringKey): string {
  return table[key] ?? STRINGS_PT[key] ?? key;
}
