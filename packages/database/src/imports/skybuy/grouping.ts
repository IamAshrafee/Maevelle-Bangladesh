export interface SkyBuyLogicalProductGroup {
  readonly key: string;
  readonly label?: string;
}

const REVIEWED_SINGLE_PRODUCT_LISTINGS = new Set([
  'abb-0414421322711', // Mug colorways.
  'abb-0426371538562', // Legging color/length options.
  'abb-0451938299661', // One sandal design in several sizes.
  'abb-06508318628963', // One knit-top design in several colors.
  'abb-06517315336675', // One straw bag with an optional pendant.
]);

function attributeLabel(attributes: Readonly<Record<string, string>>): string {
  return Object.values(attributes).join(' / ');
}

function separateVariant(attributes: Readonly<Record<string, string>>): SkyBuyLogicalProductGroup {
  return {
    key: `variant:${JSON.stringify(
      Object.fromEntries(
        Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right)),
      ),
    )}`,
    label: attributeLabel(attributes),
  };
}

function family(key: string, label: string): SkyBuyLogicalProductGroup {
  return { key: `family:${key}`, label };
}

function colorOrStyle(attributes: Readonly<Record<string, string>>): string {
  return attributes.Color ?? attributes.Style ?? attributeLabel(attributes);
}

export function resolveSkyBuyLogicalProductGroup(
  sourceListingId: string,
  attributes: Readonly<Record<string, string>>,
): SkyBuyLogicalProductGroup {
  if (REVIEWED_SINGLE_PRODUCT_LISTINGS.has(sourceListingId)) return { key: 'listing' };

  const option = colorOrStyle(attributes);
  if (sourceListingId === 'abb-0433432770146' && /^starfish\b/i.test(option)) {
    return family('starfish-plush-hair-clip', 'Starfish plush hair clip');
  }
  if (
    sourceListingId === 'abb-0456002479207' &&
    /^fairy (?:blue|orange|pink|purple|red|rose|white) flower$/i.test(option)
  ) {
    return family('fairy-flower-wreath', 'Fairy flower wreath');
  }
  if (sourceListingId === 'abb-0480136948429') {
    if (/^bl ?4095/i.test(option)) return family('bl-4095-straw-hat', 'BL 4095 straw hat');
    if (/^pd ?5070/i.test(option)) return family('pd-5070-straw-hat', 'PD 5070 straw hat');
    if (/^large brim(?:med)? raw edge embroidered straw hat/i.test(option)) {
      return family('large-brim-embroidered-straw-hat', 'Large-brim embroidered straw hat');
    }
    if (/^large flat eaves/i.test(option)) {
      return family('large-flat-eaves-straw-hat', 'Large flat-eaves straw hat');
    }
    if (/^large lace mesh lace straw hat/i.test(option)) {
      return family('large-lace-mesh-straw-hat', 'Large lace-mesh straw hat');
    }
    if (/^large lace three-layer bow/i.test(option)) {
      return family('large-lace-bow-straw-hat', 'Large lace-bow straw hat');
    }
  }
  if (sourceListingId === 'abb-0496420240746') {
    if (/^(?:blue|light blue|pink) starfish pearl shell necklace$/i.test(option)) {
      return family('starfish-pearl-shell-necklace', 'Starfish pearl shell necklace');
    }
    if (/^(?:blue|pink) starfish shell necklace$/i.test(option)) {
      return family('starfish-shell-necklace', 'Starfish shell necklace');
    }
  }
  if (sourceListingId === 'abb-06515262684980') {
    if (/lace daisy$/i.test(option)) return family('lace-daisy-headscarf', 'Lace daisy headscarf');
    if (/^lace bubble triangle headscarf/i.test(option)) {
      return family('lace-bubble-triangle-headscarf', 'Lace bubble triangle headscarf');
    }
    if (/bow headband$/i.test(option)) return family('bow-headband', 'Bow headband');
  }
  if (sourceListingId === 'abb-06517988661531') {
    if (/^pearl adult pants clip/i.test(option)) {
      return family('pearl-adult-pants-clip', 'Pearl adult pants clip');
    }
    if (/^pearl hanger 40cm/i.test(option))
      return family('pearl-hanger-40cm', '40 cm pearl hanger');
  }
  if (sourceListingId === 'abb-06586962329587') {
    if (/azalea$/i.test(option)) return family('azalea-hairpin', 'Azalea flower hairpin');
    if (/camellia$/i.test(option)) return family('camellia-hairpin', 'Camellia flower hairpin');
    if (/narcissus$/i.test(option)) return family('narcissus-hairpin', 'Narcissus flower hairpin');
    if (/lily beauty$/i.test(option)) return family('lily-beauty-hairpin', 'Lily beauty hairpin');
    if (/^(?:blue|purple) lily$/i.test(option))
      return family('lily-hairpin', 'Lily flower hairpin');
    if (/cymbidium$/i.test(option)) return family('cymbidium-hairpin', 'Cymbidium flower hairpin');
    if (/poppy$/i.test(option)) return family('poppy-hairpin', 'Poppy flower hairpin');
    if (/rose hairpin$/i.test(option)) return family('rose-hairpin', 'Rose flower hairpin');
    if (/^(?:rose|white) orchid$/i.test(option))
      return family('orchid-hairpin', 'Orchid flower hairpin');
    if (/^(?:large purple mesh rose|large rose in (?:green|pink) mesh)$/i.test(option)) {
      return family('large-mesh-rose-hairpin', 'Large mesh rose hairpin');
    }
    if (/^big (?:blue|red) peony$/i.test(option))
      return family('big-peony-hairpin', 'Big peony hairpin');
  }

  // Supplier assortment listings are unsafe to merge by default. A new listing
  // stays split until its color/size family has been explicitly reviewed.
  return separateVariant(attributes);
}
