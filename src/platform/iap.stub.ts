/**
 * In-app purchase interface (SPEC §18).
 *
 * Same shape as the ad layer and for the same reason: the store is swapped in
 * behind this, and entitlements are the ONLY thing it returns. Granting is the
 * game's job, so a billing SDK can never write to a save.
 */
export const PRODUCT = {
  RemoveAds: 'remove_ads',
  DoubleOffline: 'double_offline_forever',
  GemsSmall: 'gems_small',
  GemsMedium: 'gems_medium',
  GemsLarge: 'gems_large',
  SeasonPass: 'season_pass',
} as const;

export type ProductId = (typeof PRODUCT)[keyof typeof PRODUCT];

export type ProductKind = 'nonConsumable' | 'consumable' | 'subscription';

export type ProductDef = {
  readonly id: ProductId;
  readonly kind: ProductKind;
  /** Gems granted, for consumables. */
  readonly gems: number;
};

export const PRODUCTS: readonly ProductDef[] = [
  { id: PRODUCT.RemoveAds, kind: 'nonConsumable', gems: 0 },
  { id: PRODUCT.DoubleOffline, kind: 'nonConsumable', gems: 0 },
  { id: PRODUCT.GemsSmall, kind: 'consumable', gems: 120 },
  { id: PRODUCT.GemsMedium, kind: 'consumable', gems: 700 },
  { id: PRODUCT.GemsLarge, kind: 'consumable', gems: 4000 },
  { id: PRODUCT.SeasonPass, kind: 'subscription', gems: 0 },
];

export type PurchaseResult =
  | { status: 'purchased'; product: ProductId }
  | { status: 'cancelled' }
  | { status: 'unavailable' };

export type IapProvider = {
  /** Localised price string, or null when the store has not loaded it. */
  priceOf(product: ProductId): string | null;
  purchase(product: ProductId): Promise<PurchaseResult>;
  /** Non-consumables and subscriptions the player already owns. */
  restore(): Promise<ProductId[]>;
};

/** The shipping default until a store is wired in. */
export class NoStoreProvider implements IapProvider {
  priceOf(): string | null {
    return null;
  }

  purchase(): Promise<PurchaseResult> {
    return Promise.resolve({ status: 'unavailable' });
  }

  restore(): Promise<ProductId[]> {
    return Promise.resolve([]);
  }
}
