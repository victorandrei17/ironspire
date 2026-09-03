import { GameLoop } from './core/loop.ts';
import { Rng } from './core/rng.ts';
import { RunState, SCENE, POLICY_COUNT, type Scene, type TargetPolicy } from './core/state.ts';
import { bus, EV } from './core/events.ts';
import { AURA_HZ } from './core/constants.ts';

import { World } from './entities/world.ts';
import { ST } from './entities/tower.ts';

import { UPGRADE_COUNT } from './data/upgrades.ts';
import { CARD_COUNT } from './data/cards.ts';
import { BAL } from './data/balance.ts';

import { AiSystem } from './systems/ai.ts';
import { TargetingSystem } from './systems/targeting.ts';
import { updateWeapons } from './systems/weapons.ts';
import { ProjectileSystem } from './systems/projectiles.ts';
import { EnemyCombatSystem } from './systems/enemyCombat.ts';
import { StatusSystem } from './systems/status.ts';
import { resolveDamage } from './systems/damage.ts';
import { updateRewards } from './systems/rewards.ts';
import { CameraSystem } from './systems/camera.ts';
import { BossSystem } from './systems/boss.ts';
import { AbilitySystem } from './systems/abilities.ts';
import { BOSSES } from './data/bosses.ts';
import { ABILITY_COUNT } from './data/abilities.ts';
import { Spawner } from './systems/spawner.ts';
import { WaveSystem } from './systems/waves.ts';
import { CardOffer, pickCard, applyCards } from './systems/cards.ts';
import { applyUpgrades } from './systems/upgrades.ts';
import {
  updateProgression,
  xpToNext,
  LevelUpEffect,
  healToMatchNewMax,
} from './systems/progression.ts';
import {
  integrateEnemies,
  integrateProjectiles,
  integrateParticles,
  integratePickups,
  integrateDamageNumbers,
  despawnStrays,
} from './systems/movement.ts';

import { Viewport } from './render/viewport.ts';
import { Renderer } from './render/renderer.ts';
import { AssetRegistry } from './render/assetRegistry.ts';
import { createWorldView, syncWorldView } from './render/worldView.ts';
import { missingSpriteKeys } from './render/drawSprite.ts';

import { Input } from './platform/input.ts';
import { Lifecycle } from './platform/lifecycle.ts';
import { DebugOverlay } from './debug/overlay.ts';

import { SaveManager } from './save/save.ts';
import type { RunSnapshot } from './save/schema.ts';
import {
  applyTalents,
  computeOffline,
  coresForRun,
  recordRunRates,
  canRebirth,
  rebirth,
  type OfflineReward,
} from './systems/meta.ts';

import { Hud } from './ui/hud.ts';
import { TalentTree } from './ui/talentTree.ts';
import { OfflineScreen } from './ui/offlineScreen.ts';
import { OptionsScreen, applyUiScale } from './ui/options.ts';
import { AbilityBar } from './ui/abilityBar.ts';
import { ErrorOverlay } from './ui/errorOverlay.ts';
import { Transition } from './ui/transition.ts';
import { Toast } from './ui/toast.ts';
import { Tutorial, HINT_UPGRADES, HINT_CARDS, HINT_NEXT_WAVE } from './ui/tutorial.ts';
import { QualitySystem, QUALITY, type QualityLevel } from './systems/quality.ts';
import { setHapticsEnabled, setTapListener } from './platform/haptics.ts';
import { setLanguage, t } from './data/strings.ts';
import { AudioSystem } from './platform/audio.ts';
import { SFX, SFX_VOICES } from './data/audio.ts';
import { UpgradePanel } from './ui/upgradePanel.ts';
import { CardPicker } from './ui/cardPicker.ts';
import { MainMenu, PauseScreen, ResultScreen, TopBar, type RunResult } from './ui/menus.ts';

function clampQuality(v: number): QualityLevel {
  const n = Math.round(v);
  return (n < 0 ? 0 : n > 2 ? 2 : n) as QualityLevel;
}

/**
 * The app root: owns the scene machine, the systems, and the UI (SPEC §12.6).
 *
 * One place decides what runs in which scene. Systems stay ignorant of scenes,
 * and the UI never reaches into a system — it calls a method here.
 */
export class Game {
  readonly world = new World();
  readonly run = new RunState(UPGRADE_COUNT, CARD_COUNT);

  private scene: Scene = SCENE.Menu;
  private readonly rng = new Rng(1);

  private readonly ai = new AiSystem();
  private readonly targeting = new TargetingSystem();
  private readonly projectiles = new ProjectileSystem();
  private readonly enemyCombat = new EnemyCombatSystem();
  private readonly status = new StatusSystem();
  private readonly camera: CameraSystem;
  private readonly boss = new BossSystem();
  private readonly abilities = new AbilitySystem();
  private readonly audio = new AudioSystem(SFX_VOICES);
  private readonly quality = new QualitySystem();
  private readonly spawner = new Spawner();
  private readonly waves = new WaveSystem();
  private readonly offer = new CardOffer();
  private readonly levelUpFx = new LevelUpEffect();

  private readonly viewport: Viewport;
  private readonly renderer: Renderer;
  private readonly assets = new AssetRegistry();
  private readonly view;
  private readonly input: Input;
  private readonly overlay: DebugOverlay;
  private readonly loop: GameLoop;

  private readonly hud: Hud;
  private readonly panel: UpgradePanel;
  private readonly picker: CardPicker;
  private readonly menu: MainMenu;
  private readonly pause: PauseScreen;
  private readonly result: ResultScreen;
  private readonly topBar: TopBar;
  private readonly talentTree: TalentTree;
  private readonly offlineScreen: OfflineScreen;
  private readonly options: OptionsScreen;
  private readonly abilityBar: AbilityBar;
  private readonly errorOverlay: ErrorOverlay;
  private readonly transition: Transition;
  private readonly toast: Toast;
  private readonly tutorial: Tutorial;
  /** Set while the options screen is open, so it can return to where it came from. */
  private optionsReturn: Scene = SCENE.Menu;

  private readonly saves = new SaveManager();
  private pendingOffline: OfflineReward | null = null;

  private readonly debugLines: string[] = ['', '', '', ''];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    ctx: CanvasRenderingContext2D,
  ) {
    this.viewport = new Viewport(canvas);
    this.renderer = new Renderer(ctx, this.viewport);
    this.input = new Input(this.viewport);
    this.overlay = new DebugOverlay(uiRoot);
    this.view = createWorldView(this.world);
    this.camera = new CameraSystem(this.rng);

    this.hud = new Hud(uiRoot, () => this.cyclePolicy());
    this.panel = new UpgradePanel(
      uiRoot,
      this.run,
      this.world.tower.stats,
      () => this.world.tower.mods.upgradeCostMult,
      () => this.waves.callEarly(this.world, this.run, this.spawner),
    );
    this.picker = new CardPicker(
      uiRoot,
      (slot) => this.takeCard(slot),
      () => this.rerollOffer(),
    );
    this.menu = new MainMenu(
      uiRoot,
      () => this.startRun(),
      () => this.setScene(SCENE.Talents),
      () => this.resumeRun(),
    );
    this.talentTree = new TalentTree(
      uiRoot,
      () => this.saves.save,
      () => this.onTalentsChanged(),
      () => this.doRebirth(),
      () => this.setScene(SCENE.Menu),
    );
    this.offlineScreen = new OfflineScreen(uiRoot, () => this.claimOffline());
    this.options = new OptionsScreen(
      uiRoot,
      () => this.saves.save.prefs,
      () => this.onPrefsChanged(),
      () => this.saves.export(),
      (code) => this.saves.import(code),
      () => this.closeOptions(),
    );
    this.pause = new PauseScreen(
      uiRoot,
      () => this.setScene(SCENE.Run),
      () => this.endRun(false),
      () => this.openOptions(),
    );
    this.result = new ResultScreen(
      uiRoot,
      () => this.startRun(),
      () => this.setScene(SCENE.Menu),
    );
    this.topBar = new TopBar(uiRoot, () => this.setScene(SCENE.Pause));
    this.abilityBar = new AbilityBar(uiRoot, (id) => this.abilities.cast(this.world, id));
    this.transition = new Transition(uiRoot);
    this.toast = new Toast(uiRoot);
    this.tutorial = new Tutorial(
      uiRoot,
      (id) => this.saves.save.meta.unlocks.includes(id),
      (id) => {
        this.saves.save.meta.unlocks.push(id);
        this.saves.touch();
      },
    );
    // Last, so it paints over everything if the worst happens.
    this.errorOverlay = new ErrorOverlay(uiRoot);

    this.loop = new GameLoop(
      (dt) => this.simulate(dt),
      (alpha) => this.render(alpha),
    );

    // Systems announce; this is the only place that turns an announcement into
    // a sound, so no system needs to know audio exists.
    bus.on(EV.Sfx, (id) => this.audio.play(id));
    bus.on(EV.EnemyKilled, () => this.audio.play(SFX.EnemyDeath));
    bus.on(EV.TowerDamaged, () => this.audio.play(SFX.TowerHit));
    bus.on(EV.GoldChanged, () => this.audio.play(SFX.Pickup));
    bus.on(EV.LevelUp, () => {
      this.audio.play(SFX.LevelUp);
      bus.emit(EV.Shake, 0.35);
      this.levelUpFx.trigger();
    });
    bus.on(EV.UpgradeBought, () => this.audio.play(SFX.Purchase));
    bus.on(EV.BossSpawned, () => {
      this.audio.play(SFX.BossSpawn);
      this.audio.duckMusic(true);
    });
    bus.on(EV.BossKilled, () => this.audio.duckMusic(false));

    bus.on(EV.WaveStart, (wave, pattern) => this.hud.banner(pattern, wave));
    bus.on(EV.BossSpawned, (idx) => {
      this.boss.register(this.spawner.bossHandle, idx);
      this.hud.setBossName(BOSSES[idx]?.name ?? 'CHEFE');
    });
    bus.on(EV.TowerDied, () => this.endRun(true));
    // A finished wave is the natural autosave point: cheap, and it bounds how
    // much progress a kill -9 can cost (SPEC §15.3).
    bus.on(EV.WaveEnd, () => {
      this.snapshotRun();
      this.saves.flush();
    });

    this.saves.load();
    this.onTalentsChanged();
    this.onPrefsChanged();
    this.setScene(SCENE.Menu);
  }

  // --- lifecycle -------------------------------------------------------------

  start(): void {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    this.input.attach(this.canvas);
    this.overlay.attachKeyboard();

    // iOS will not start an AudioContext outside a real gesture, so the unlock
    // rides on the first touch anywhere.
    this.audio.init();
    setTapListener(() => this.audio.play(SFX.UiTap));
    const unlock = (): void => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);

    new Lifecycle({
      onPause: () => {
        this.input.clearActive();
        if (this.scene === SCENE.Run) this.setScene(SCENE.Pause);
        this.snapshotRun();
        this.saves.flush();
      },
      onResume: () => this.loop.reset(),
    }).attach();

    this.showOfflineOrMenu();

    // The atlas is optional by contract: absent means placeholders (SPEC §13.6).
    void this.assets.load('game', this.viewport.dpr);

    this.errorOverlay.install(() => JSON.stringify(this.diagnostics));

    let prevNow = -1;
    let firstFrame = true;
    const frame = (now: number): void => {
      requestAnimationFrame(frame);
      if (prevNow >= 0) this.quality.sample(Math.min((now - prevNow) / 1000, 0.25));
      prevNow = now;
      if (this.quality.changed) this.onQualityChanged();
      this.loop.frame(now);
      if (firstFrame) {
        firstFrame = false;
        this.transition.dismissBoot();
      }
    };
    requestAnimationFrame(frame);
  }

  private resize(): void {
    this.viewport.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  }

  // --- scenes ----------------------------------------------------------------

  private setScene(next: Scene): void {
    this.scene = next;
    const inRun = next === SCENE.Run;
    this.hud.setVisible(inRun || next === SCENE.CardPick);
    this.panel.setVisible(inRun);
    this.topBar.setVisible(inRun);
    this.abilityBar.setVisible(inRun);
    this.picker.setVisible(next === SCENE.CardPick);
    this.menu.setVisible(next === SCENE.Menu);
    if (next === SCENE.Menu) {
      this.menu.render(
        this.saves.save.meta.nucleos,
        this.saves.save.stats.bestWaveEver,
        this.saves.save.run !== undefined,
      );
    }
    this.talentTree.setVisible(next === SCENE.Talents);
    this.options.setVisible(next === SCENE.Options);
    this.pause.setVisible(next === SCENE.Pause);
    this.result.setVisible(next === SCENE.Result);
    // Pause and the card screen freeze the simulation entirely; the level-up
    // slow-mo is the only partial time scale, and `simulate` reasserts it every
    // tick, so setting 1 here is just the resume value.
    this.loop.timeScale = inRun ? 1 : 0;
    bus.emit(EV.SceneChanged, next);
  }

  private startRun(): void {
    this.transition.run(() => this.beginRun());
  }

  private beginRun(): void {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const mods = this.world.tower.mods;
    this.rng.state = seed;
    this.world.reset();
    this.run.reset(seed, xpToNext(1), 1 + mods.rerolls);
    this.run.gold = mods.startGold;
    applyUpgrades(this.run, this.world.tower.stats);
    applyCards(this.run, this.world.tower.stats);
    this.world.tower.hp = this.world.tower.hpMax;
    // Abilities unlock through the Arcane branch; until then the bar is empty.
    const mask = mods.abilityUnlocks;
    for (let i = 0; i < ABILITY_COUNT; i++) {
      this.abilities.unlocked[i] = (mask & (1 << i)) !== 0 ? 1 : 0;
    }
    this.abilities.autoCast = mods.autoCast;
    this.saves.clearRunSnapshot();
    this.spawner.reset();
    this.waves.reset();
    this.status.reset();
    this.camera.reset();
    this.boss.reset();
    this.abilities.reset(this.world);
    this.levelUpFx.reset();
    this.offer.close();
    this.setScene(SCENE.Run);
    bus.emit(EV.RunStarted, seed);
  }

  private endRun(died: boolean): void {
    if (this.scene === SCENE.Result) return;
    this.run.over = true;
    this.run.waveMax = Math.max(this.run.waveMax, this.run.wave);

    const save = this.saves.save;
    const cores = coresForRun(this.run.waveMax, this.world.tower.mods, save.meta.ether);
    // Retreat pays the same as death on purpose (SPEC §2.3).
    save.meta.nucleos += cores;
    save.stats.totalRuns++;
    save.stats.totalKills += this.run.kills;
    save.stats.playTimeSec += this.run.time;
    save.stats.bestWave = Math.max(save.stats.bestWave, this.run.waveMax);
    save.stats.bestWaveEver = Math.max(save.stats.bestWaveEver, this.run.waveMax);
    recordRunRates(save, cores, this.run.goldEarned, this.run.time);
    this.saves.clearRunSnapshot();
    this.saves.flush();
    this.onTalentsChanged();

    const res: RunResult = {
      wave: this.run.waveMax,
      kills: this.run.kills,
      timeSec: this.run.time,
      gold: this.run.goldEarned,
      cores,
      died,
    };
    this.result.render(res);
    this.transition.run(() => this.setScene(SCENE.Result));
    bus.emit(EV.RunEnded, res.wave, res.cores, died ? 1 : 0);
  }

  private openOptions(): void {
    this.optionsReturn = this.scene === SCENE.Pause ? SCENE.Pause : SCENE.Menu;
    this.setScene(SCENE.Options);
  }

  private closeOptions(): void {
    this.setScene(this.optionsReturn);
  }

  private onQualityChanged(): void {
    this.world.particles.share = this.quality.particleShare;
    if (this.quality.level < QUALITY.High) this.toast.show(t('quality.reduced'));
    this.saves.save.prefs.particleLevel = this.quality.level;
    this.saves.touch();
  }

  /** Pushes preference changes into the systems that read them. */
  private onPrefsChanged(): void {
    const prefs = this.saves.save.prefs;
    setHapticsEnabled(prefs.haptics);
    this.audio.setVolumes(prefs.sfx, prefs.music);
    // Reduce-shake scales the whole effect rather than disabling it, so the
    // feedback survives for players who only need it toned down (SPEC §11.4).
    this.camera.intensity = prefs.reduceShake ? 0.25 : 1;
    applyUiScale(prefs.uiScale);
    setLanguage(prefs.lang);
    // Start from the level this device settled on last time, so a weak phone
    // does not spend the first ten seconds of every session stuttering.
    this.quality.reset(clampQuality(prefs.particleLevel));
    this.world.particles.share = this.quality.particleShare;
    this.view.flashScale = prefs.reduceFlash ? 0.3 : 1;
    document.body.classList.toggle('lefty', prefs.lefty);
    this.saves.touch();
  }

  /** Reapplies talents to the meta stat layer, then refreshes anything showing them. */
  private onTalentsChanged(): void {
    applyTalents(this.saves.save, this.world.tower.stats, this.world.tower.mods);
    this.world.tower.reviveAvailable = this.world.tower.mods.reviveOnce;
    this.saves.touch();
  }

  /** Shows the welcome-back screen when the reward is worth a modal. */
  private showOfflineOrMenu(): void {
    const reward = computeOffline(this.saves.save, Date.now(), this.world.tower.mods);
    if (reward.clockAnomaly) {
      this.saves.save.idle.clockAnomalies++;
      this.saves.touch();
      return;
    }
    if (reward.gold < 1 && reward.nucleos < 1) return;
    this.pendingOffline = reward;
    this.offlineScreen.render(reward);
    this.offlineScreen.setVisible(true);
  }

  private claimOffline(): void {
    const reward = this.pendingOffline;
    this.pendingOffline = null;
    this.offlineScreen.setVisible(false);
    if (reward === null) return;
    this.saves.save.meta.nucleos += reward.nucleos;
    this.saves.flush();
  }

  /** Freezes the current run so closing the app does not throw it away. */
  private snapshotRun(): void {
    if (this.scene !== SCENE.Run && this.scene !== SCENE.Pause) return;
    if (this.run.over || this.run.wave <= 0) return;
    const snapshot: RunSnapshot = {
      seed: this.run.seed,
      wave: this.run.wave,
      time: this.run.time,
      gold: this.run.gold,
      goldEarned: this.run.goldEarned,
      xp: this.run.xp,
      xpToNext: this.run.xpToNext,
      level: this.run.level,
      kills: this.run.kills,
      policy: this.run.policy,
      pendingCards: this.run.pendingCards,
      rerollsLeft: this.run.rerollsLeft,
      waveMax: this.run.waveMax,
      upgradeLevels: Array.from(this.run.upgradeLevels),
      cardLevels: Array.from(this.run.cardLevels),
      towerHp: this.world.tower.hp,
    };
    this.saves.storeRunSnapshot(snapshot);
  }

  /**
   * Resumes a run frozen by a previous session.
   *
   * The arena itself is NOT restored — enemies mid-flight are not worth
   * serialising. The wave restarts from its own seed, which is exactly what
   * the deterministic spawner makes possible.
   */
  resumeRun(): boolean {
    const snap = this.saves.save.run;
    if (snap === undefined) return false;
    this.world.reset();
    this.run.reset(snap.seed, snap.xpToNext, snap.rerollsLeft);
    this.run.wave = Math.max(0, snap.wave - 1);
    this.run.time = snap.time;
    this.run.gold = snap.gold;
    this.run.goldEarned = snap.goldEarned;
    this.run.xp = snap.xp;
    this.run.level = snap.level;
    this.run.kills = snap.kills;
    this.run.waveMax = snap.waveMax;
    this.run.pendingCards = snap.pendingCards;
    for (let i = 0; i < this.run.upgradeLevels.length; i++) {
      this.run.upgradeLevels[i] = snap.upgradeLevels[i] ?? 0;
    }
    for (let i = 0; i < this.run.cardLevels.length; i++) {
      this.run.cardLevels[i] = snap.cardLevels[i] ?? 0;
    }
    applyUpgrades(this.run, this.world.tower.stats);
    applyCards(this.run, this.world.tower.stats);
    this.world.tower.hp = Math.min(snap.towerHp, this.world.tower.hpMax);
    this.rng.state = snap.seed;
    this.spawner.reset();
    this.waves.reset();
    this.status.reset();
    this.camera.reset();
    this.setScene(SCENE.Run);
    return true;
  }

  /** Rebirth is player-initiated and irreversible, so it stays explicit. */
  doRebirth(): number {
    if (!canRebirth(this.saves.save)) return 0;
    const gained = rebirth(this.saves.save);
    this.onTalentsChanged();
    this.saves.flush();
    return gained;
  }

  private cyclePolicy(): void {
    this.run.policy = ((this.run.policy + 1) % POLICY_COUNT) as TargetPolicy;
    // Force a fresh acquisition so the change is felt immediately.
    this.world.tower.targetHandle = -1;
  }

  private takeCard(slot: number): void {
    const beforeMax = this.world.tower.hpMax;
    const idx = pickCard(this.offer, this.run, this.world.tower.stats, slot);
    if (idx < 0) return;
    // hp_up heals by what it added; the card's apply stays pure (SPEC §8.3).
    healToMatchNewMax(this.world, beforeMax);
    this.run.pendingCards = Math.max(0, this.run.pendingCards - 1);
    if (this.run.pendingCards > 0) this.openCardPick();
    else this.setScene(SCENE.Run);
  }

  private rerollOffer(): void {
    if (this.run.rerollsLeft <= 0) return;
    this.run.rerollsLeft--;
    this.offer.roll(this.run, this.rng, this.world.tower.mods.cardLuckPct);
    this.picker.render(this.offer, this.run);
  }

  private openCardPick(): void {
    this.offer.roll(this.run, this.rng, this.world.tower.mods.cardLuckPct);
    this.picker.render(this.offer, this.run);
    this.setScene(SCENE.CardPick);
  }

  // --- tick ------------------------------------------------------------------

  /** System order is SPEC §12.3. Do not reorder without updating the spec. */
  private simulate(dt: number): void {
    this.input.flush(dt);
    if (this.input.fourFingerTap) {
      this.input.fourFingerTap = false;
      this.overlay.toggle();
    }
    if (this.scene !== SCENE.Run) {
      this.updateDebug(dt);
      return;
    }

    this.run.time += dt;
    this.levelUpFx.update(dt);
    // Level-up hit-stop: time crawls for a beat before the card screen
    // (SPEC §7.3). Applied to the loop, not to individual systems.
    this.loop.timeScale = this.levelUpFx.timeScale;

    this.waves.update(this.world, this.run, this.spawner, dt);
    this.ai.update(
      this.world.enemies,
      this.world.hash,
      this.world.tower.x,
      this.world.tower.y,
      dt,
      this.boss.isDashing(this.spawner.bossHandle) ? this.spawner.bossHandle : -1,
    );

    integrateEnemies(this.world.enemies, dt);
    integrateProjectiles(this.world.projectiles, dt);
    integratePickups(
      this.world.pickups,
      dt,
      this.world.tower.x,
      this.world.tower.y,
      this.world.tower.stats.get(ST.PickupRadius),
    );

    this.world.rebuildHash();

    // Orbitals move before collision so their swept segment is this tick's.
    this.status.updateOrbitals(this.world, dt);

    this.targeting.update(this.world.tower, this.world.enemies, this.world.hash, this.run.policy, dt);
    updateWeapons(this.world, dt);
    this.projectiles.update(this.world);
    this.enemyCombat.update(this.world, dt);
    this.abilities.update(this.world, dt);
    this.boss.update(this.world, this.rng, dt);
    this.status.update(this.world, dt, AURA_HZ);

    const goldBefore = this.run.gold;
    resolveDamage(this.world, this.run, this.rng, dt);
    updateRewards(this.world, this.run);
    if (this.run.gold > goldBefore) this.run.goldEarned += this.run.gold - goldBefore;

    updateProgression(this.run);

    integrateParticles(this.world.particles, dt);
    integrateDamageNumbers(this.world.damageNumbers, dt);
    despawnStrays(this.world.enemies, this.world.tower.x, this.world.tower.y);
    this.camera.update(dt);

    this.run.waveMax = Math.max(this.run.waveMax, this.run.wave);

    this.saves.update(dt);
    this.audio.flush();

    // UI last: it reads the settled state of this tick.
    this.toast.update(dt);
    this.tutorial.update(dt);
    this.panel.update(dt);
    this.panel.setNextWave(this.waves.canCallEarly, BAL.wave.earlyCallGoldBonus);
    if (this.waves.canCallEarly) this.tutorial.trigger(HINT_NEXT_WAVE);
    if (this.run.gold >= 20) this.tutorial.trigger(HINT_UPGRADES);
    if (this.run.level >= 1 && this.run.xp > this.run.xpToNext * 0.5) {
      this.tutorial.trigger(HINT_CARDS);
    }
    this.abilityBar.update(this.abilities);
    this.hud.update(this.run, this.world, dt);

    // A banked level opens the card screen, which freezes the simulation.
    if (this.run.pendingCards > 0) this.openCardPick();

    this.updateDebug(dt);
  }

  private updateDebug(dt: number): void {
    const w = this.world;
    this.debugLines[0] = `wave ${this.run.wave} · enemies ${w.enemies.liveCount} · proj ${w.projectiles.liveCount}`;
    this.debugLines[1] = `hp ${w.tower.hp.toFixed(0)}/${w.tower.hpMax.toFixed(0)} · gold ${this.run.gold.toFixed(0)} · lv ${this.run.level}`;
    this.debugLines[2] = `kills ${this.run.kills} · skipped ${this.spawner.skipped} · qOvf ${w.queue.overflow}`;
    const missing = missingSpriteKeys();
    this.debugLines[3] = missing.length === 0 ? 'sprites ok' : `MISSING ${missing.length}`;
    this.overlay.update(dt, {
      fps: this.loop.fps,
      simMs: this.loop.simMs,
      renderMs: this.loop.renderMs,
      steps: this.loop.stepsLastFrame,
      lines: this.debugLines,
    });
  }

  private render(alpha: number): void {
    syncWorldView(this.view, this.world, this.camera.x, this.camera.y);
    this.view.showRange = this.scene === SCENE.Run || this.scene === SCENE.CardPick;
    this.renderer.render(this.view, alpha);
  }

  /** Read by the headless smoke test. */
  get diagnostics(): Record<string, number | string | string[]> {
    return {
      scene: this.scene,
      fps: Math.round(this.loop.fps),
      simMs: Number(this.loop.simMs.toFixed(2)),
      renderMs: Number(this.loop.renderMs.toFixed(2)),
      wave: this.run.wave,
      level: this.run.level,
      gold: Math.round(this.run.gold),
      kills: this.run.kills,
      enemies: this.world.enemies.liveCount,
      atlasLoaded: this.assets.loaded ? 1 : 0,
      audio: this.audio.available ? 1 : 0,
      quality: this.quality.level,
      cores: this.saves.save.meta.nucleos,
      bestWave: this.saves.save.stats.bestWaveEver,
      localOnly: this.saves.localOnly ? 1 : 0,
      hasSnapshot: this.saves.save.run === undefined ? 0 : 1,
      missingSprites: missingSpriteKeys(),
    };
  }

  /** Test hooks: drive the machine without touching the DOM. */
  debugStartRun(): void {
    this.startRun();
  }

  debugOpenTalents(): void {
    this.setScene(SCENE.Talents);
  }

  /**
   * Jumps a fresh run to `wave` with stats scaled to match, so a boss wave can
   * be reached without playing to it. Test hook only.
   */
  debugJumpToWave(wave: number): void {
    this.startRun();
    this.run.wave = wave - 1;
    this.run.waveMax = wave - 1;
    // Give the tower roughly the power a player would have at that wave, or
    // the boss simply deletes it before anything is visible.
    for (let i = 0; i < this.run.upgradeLevels.length; i++) {
      this.run.upgradeLevels[i] = Math.round(wave * 1.5);
    }
    applyUpgrades(this.run, this.world.tower.stats);
    this.world.tower.hp = this.world.tower.hpMax;
    this.waves.reset();
    this.waves.callEarly(this.world, this.run, this.spawner);
  }
}
