import { type CalcdexPlayerSide } from '@showdex/interfaces/calc';

/**
 * Toggle button mappings of player-sided screens.
 *
 * * Key is the label of the button, value is the boolean property in `CalcdexPlayerSide`.
 * * Typically only used by `FieldCalc` for both Singles and Doubles formats.
 *   - Although technically player-sided field conditions, these are purposefully separated to
 *     not show `PlayerSideConditionsMap` in Singles formats.
 *
 * @since 1.0.3
 */
export const PlayerSideScreensToggleMap: Record<string, keyof CalcdexPlayerSide> = {
  Light: 'isLightScreen',
  Reflect: 'isReflect',
  Aurora: 'isAuroraVeil',
};

/**
 * Toggle button mappings of player-sided field conditions.
 *
 * * Key is the label of the button, value is the boolean property in `CalcdexPlayerSide`.
 * * Typically only used by `FieldCalc` for Doubles formats.
 *
 * @since 1.0.3
 */
export const PlayerSideConditionsToggleMap: Record<string, keyof CalcdexPlayerSide> = {
  Hand: 'isHelpingHand',
  Gift: 'isFlowerGift',
  Guard: 'isFriendGuard',
  Battery: 'isBattery',
  Power: 'isPowerSpot',
  Twind: 'isTailwind',
};

/**
 * `Dex` iterator mappings of player-sided field conditions.
 *
 * * Key is the boolean property in `CalcdexPlayerSide`, value is the `Dex` iterator, either `'abilities'` or `'moves'`.
 *   - For `'abilities'`, the corresponding iterator would be `Dex.abilities.get()`.
 *   - For `'moves'`, the corresponding iterator would be `Dex.moves.get()`.
 * * Typically only used by `FieldCalc`.
 *
 * @since 1.0.3
 */
export const PlayerSideConditionsDexMap: Partial<Record<keyof CalcdexPlayerSide, 'abilities' | 'moves'>> = {
  isLightScreen: 'moves',
  isReflect: 'moves',
  isAuroraVeil: 'moves',
  isHelpingHand: 'moves',
  isFriendGuard: 'abilities',
  isFlowerGift: 'abilities',
  isBattery: 'abilities',
  isPowerSpot: 'abilities',
  isTailwind: 'moves',
};
