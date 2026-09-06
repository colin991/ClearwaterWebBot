/** Pack catalog — kept for compatibility; canonical copy is also inlined in internetStore.js. */
export const CREDIT_STORE_PACKS = Object.freeze([
  {
    id: '109005087621617',
    assetId: '109005087621617',
    robux: 500,
    credits: 1000,
    label: 'Starter pack',
    url: 'https://www.roblox.com/catalog/109005087621617',
  },
  {
    id: '123843071072106',
    assetId: '123843071072106',
    robux: 1000,
    credits: 2200,
    label: 'Boost pack',
    url: 'https://www.roblox.com/catalog/123843071072106',
  },
  {
    id: '85562318217896',
    assetId: '85562318217896',
    robux: 1500,
    credits: 2750,
    label: 'Plus pack',
    url: 'https://www.roblox.com/catalog/85562318217896',
  },
  {
    id: '116068796281105',
    assetId: '116068796281105',
    robux: 2000,
    credits: 3400,
    label: 'City pack',
    url: 'https://www.roblox.com/catalog/116068796281105',
  },
]);

export const CREDIT_STORE_ASSET_IDS = Object.freeze(
  CREDIT_STORE_PACKS.map((pack) => String(pack.assetId)),
);

export function creditStorePackByAssetId(assetId) {
  const id = String(assetId || '');
  return CREDIT_STORE_PACKS.find((pack) => String(pack.assetId) === id) || null;
}
