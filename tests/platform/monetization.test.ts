import { describe, it, expect } from 'vitest';
import {
  AdGate,
  NoAdsProvider,
  REWARD,
  MIN_SECONDS_BETWEEN_ADS,
  type AdProvider,
  type AdResult,
} from '../../src/platform/ads.stub.ts';
import { NoStoreProvider, PRODUCTS, PRODUCT } from '../../src/platform/iap.stub.ts';

class FakeAds implements AdProvider {
  result: AdResult = { status: 'earned', reward: REWARD.Revive };
  ready = true;
  shown = 0;

  isReady(): boolean {
    return this.ready;
  }

  show(): Promise<AdResult> {
    this.shown++;
    return Promise.resolve(this.result);
  }
}

describe('rewarded ads (SPEC §18)', () => {
  it('the shipping default shows nothing', async () => {
    const gate = new AdGate(new NoAdsProvider());
    expect(gate.canShow(REWARD.Revive)).toBe(false);
    expect((await gate.show(REWARD.Revive)).status).toBe('unavailable');
  });

  it('enforces the minimum gap between presentations', async () => {
    let now = 1_000_000;
    const ads = new FakeAds();
    const gate = new AdGate(ads, () => now);

    expect((await gate.show(REWARD.Revive)).status).toBe('earned');
    // A second ad immediately after would be exactly the pattern SPEC bans.
    expect(gate.canShow(REWARD.Revive)).toBe(false);
    expect((await gate.show(REWARD.Revive)).status).toBe('unavailable');
    expect(ads.shown).toBe(1);

    now += MIN_SECONDS_BETWEEN_ADS * 1000;
    expect(gate.canShow(REWARD.Revive)).toBe(true);
    expect((await gate.show(REWARD.Revive)).status).toBe('earned');
  });

  it('a dismissed ad pays nothing and is not an error', async () => {
    const ads = new FakeAds();
    ads.result = { status: 'dismissed' };
    const gate = new AdGate(ads, () => 0);
    expect((await gate.show(REWARD.DoubleOffline)).status).toBe('dismissed');
  });

  it('a throwing network never looks like a granted reward', async () => {
    const hostile: AdProvider = {
      isReady: () => true,
      show: () => Promise.reject(new Error('sdk exploded')),
    };
    const gate = new AdGate(hostile, () => 0);
    expect((await gate.show(REWARD.Revive)).status).toBe('unavailable');
  });

  it('exposes no interstitial method at all', () => {
    // The design forbids interstitials inside a run, so the surface simply does
    // not offer one — a rule that cannot be violated by accident.
    const gate = new AdGate(new NoAdsProvider()) as unknown as Record<string, unknown>;
    expect(gate.showInterstitial).toBeUndefined();
  });
});

describe('in-app purchases', () => {
  it('the shipping default sells nothing and owns nothing', async () => {
    const store = new NoStoreProvider();
    expect(store.priceOf()).toBe(null);
    expect((await store.purchase()).status).toBe('unavailable');
    expect(await store.restore()).toEqual([]);
  });

  it('every product has a kind, and consumables grant gems', () => {
    const ids = new Set<string>();
    for (const p of PRODUCTS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      if (p.kind === 'consumable') expect(p.gems).toBeGreaterThan(0);
      else expect(p.gems).toBe(0);
    }
    expect(ids.has(PRODUCT.RemoveAds)).toBe(true);
  });
});
