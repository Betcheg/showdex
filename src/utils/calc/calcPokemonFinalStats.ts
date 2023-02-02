// import { times } from '@showdex/consts/core';
import {
  // PokemonInitialStats,
  PokemonSpeedReductionItems,
  PokemonStatNames,
} from '@showdex/consts/pokemon';
import { formatId as id } from '@showdex/utils/app';
import {
  countRuinAbilities,
  detectGenFromFormat,
  detectLegacyGen,
  findHighestStat,
  getDexForFormat,
  notFullyEvolved,
  ruinAbilitiesActive,
} from '@showdex/utils/battle';
import { env } from '@showdex/utils/core';
import { logger } from '@showdex/utils/debug';
import type { GenerationNum } from '@smogon/calc';
import type { CalcdexBattleField, CalcdexPlayer, CalcdexPokemon } from '@showdex/redux/store';
import type { CalcdexStatModRecording } from './statModRecorder';
import { calcPokemonHp } from './calcPokemonHp';
import { shouldIgnoreItem } from './shouldIgnoreItem';
import { statModRecorder } from './statModRecorder';

const l = logger('@showdex/utils/calc/calcPokemonFinalStats');

/**
 * Reimplementation of `calculateModifiedStats()` in the Showdown client's `BattleTooltip`.
 *
 * * Makes use of our custom `CalcdexPokemon` and `CalcdexBattleField` properties wherever possible
 *   to better integrate with the Calcdex's state (which many properties are user-mutable).
 * * Though the aforementioned function exists in the client, it reads directly from the battle state,
 *   preventing us from non-destructively incorporating the Calcdex's state.
 *   - In other words, would be a pain in the ass to incorporate the user's inputs into the function,
 *     which requires writing directly into the battle state, hoping that we didn't fuck something up.
 *   - Let's not forget that we gotta get our `CalcdexBattleField` in there too!
 * * Hence why I chose death.
 *
 * @see https://github.com/smogon/pokemon-showdown-client/blob/de8e7ea0d17305046c957574e52c613eeed50630/src/battle-tooltips.ts#L966-L1240
 * @since 0.1.3
 */
export const calcPokemonFinalStats = (
  format: GenerationNum | string,
  pokemon: DeepPartial<CalcdexPokemon>,
  opponentPokemon: DeepPartial<CalcdexPokemon>,
  player?: CalcdexPlayer,
  opponent?: CalcdexPlayer,
  field?: CalcdexBattleField,
): CalcdexStatModRecording => {
  const record = statModRecorder(pokemon);

  if (!pokemon?.speciesForme || !opponentPokemon?.speciesForme) {
    return record.export();
  }

  const dex = getDexForFormat(format);

  if (!dex) {
    if (__DEV__) {
      l.warn(
        'Global Dex is unavailable for format', format,
        '\n', 'pokemon', pokemon?.name || pokemon?.speciesForme || '???', pokemon,
        '\n', 'player', player,
        '\n', 'opponentPokemon', opponentPokemon?.name || opponentPokemon?.speciesForme || '???', opponentPokemon,
        '\n', 'opponent', opponent,
        '\n', 'field', field,
        '\n', '(You will only see this warning on development.)',
      );
    }

    return record.export();
  }

  const gen = typeof format === 'string'
    ? detectGenFromFormat(format, env.int<GenerationNum>('calcdex-default-gen'))
    : format;

  const legacy = detectLegacyGen(gen);

  const hpPercentage = calcPokemonHp(pokemon);
  const ability = id(pokemon.dirtyAbility ?? pokemon.ability);
  const opponentAbility = id(opponentPokemon.dirtyAbility ?? opponentPokemon.ability);

  const hasTransform = 'transform' in pokemon.volatiles;
  const hasFormeChange = 'formechange' in pokemon.volatiles;
  const speciesForme = hasTransform && hasFormeChange
    ? pokemon.volatiles.formechange[1]
    : pokemon.speciesForme;

  const species = dex.species.get(speciesForme);
  const baseForme = id(species?.baseSpecies);

  const types = pokemon.terastallized && pokemon.teraType
    ? [pokemon.teraType]
    : pokemon.types;

  // note: using optional chaining here (over logical OR) in case the user clears the item on purpose
  // (in which case the value of dirtyItem becomes an empty string, i.e., `''`)
  const item = id(pokemon.dirtyItem ?? pokemon.item);
  const ignoreItem = shouldIgnoreItem(pokemon, field);

  // swap ATK and DEF if the move "Power Trick" was used
  if ('powertrick' in pokemon.volatiles) {
    record.swap('atk', 'def', 'move', 'Power Trick');
  }

  // apply stat boosts
  const boostTable = legacy
    ? [1, 100 / 66, 2, 2.5, 100 / 33, 100 / 28, 4]
    : [1, 1.5, 2, 2.5, 3, 3.5, 4];

  const boosts: Showdown.StatsTable = {
    atk: (pokemon?.dirtyBoosts?.atk ?? pokemon?.boosts?.atk) || 0,
    def: (pokemon?.dirtyBoosts?.def ?? pokemon?.boosts?.def) || 0,
    spa: (pokemon?.dirtyBoosts?.spa ?? pokemon?.boosts?.spa) || 0,
    spd: (pokemon?.dirtyBoosts?.spd ?? pokemon?.boosts?.spd) || 0,
    spe: (pokemon?.dirtyBoosts?.spe ?? pokemon?.boosts?.spe) || 0,
  };

  PokemonStatNames.forEach((stat) => {
    // apply effects to non-HP stats
    if (stat === 'hp') {
      return;
    }

    // apply stat boosts if not 0 (cause it'd do nothing)
    const stage = boosts[stat];

    if (stage) {
      const boostValue = boostTable[Math.abs(stage)];
      const modifier = stage > 0 ? boostValue : (1 / boostValue);

      record.apply(stat, modifier, 'boost', `${stage > 0 ? '+' : ''}${stage} Stage`);
    }
  });

  // find out what the highest *boosted* stat is (excluding HP) for use in some abilities,
  // particularly Protosynthesis & Quark Drive (gen 9),
  // which will boost the highest stat after stage boosts are applied
  const highestBoostedStat = findHighestStat(record.stats());

  // apply status condition effects
  if (pokemon.status) {
    if (!legacy && ['guts', 'quickfeet'].includes(ability)) {
      // 50% ATK boost w/ non-volatile status condition due to "Guts" (gen 3+)
      if (ability === 'guts') {
        record.apply('atk', 1.5, 'ability', 'Guts');
      }

      // 50% SPE boost w/ non-volatile status condition due to "Quick Feet" (gen 4+)
      if (ability === 'quickfeet') {
        record.apply('spe', 1.5, 'ability', 'Quick Feet');
      }
    } else {
      // 50% ATK reduction when burned (all gens... probably)
      if (pokemon.status === 'brn') {
        record.apply('atk', 0.5, 'status', 'Burn');
      }

      // 75% SPE reduction when paralyzed for gens 1-6, otherwise, 50% SPE reduction
      if (pokemon.status === 'par') {
        record.apply('spe', gen < 7 ? 0.25 : 0.5, 'status', 'Paralysis');
      }
    }
  }

  // finished gen 1 since it doesn't support items
  if (gen <= 1) {
    // gen 1 stats are capped to 999
    record.cap(999);

    return record.export();
  }

  // apply gen 2-compatible item effects
  // (at this point, we should at least be gen 2)
  if (baseForme === 'pikachu' && !ignoreItem && item === 'lightball') {
    if (gen > 4) {
      // 100% ATK boost if "Light Ball" is held by a Pikachu (gen 5+)
      record.apply('atk', 2, 'item', 'Light Ball');
    }

    // 100% SPA boost if "Light Ball" is held by a Pikachu
    record.apply('spa', 2, 'item', 'Light Ball');
  }

  if (['marowak', 'cubone'].includes(baseForme) && !ignoreItem && item === 'thickclub') {
    // 100% ATK boost if "Thick Club" is held by a Marowak/Cubone
    record.apply('atk', 2, 'item', 'Thick Club');
  }

  if (baseForme === 'ditto' && !hasTransform && !ignoreItem) {
    if (item === 'quickpowder') {
      record.apply('spe', 2, 'item', 'Quick Powder');
    } else if (item === 'metalpowder') {
      if (gen === 2) {
        // 50% DEF/SPD boost if "Metal Powder" is held by a Ditto (gen 2)
        record.apply('def', 1.5, 'item', 'Metal Powder');
        record.apply('spd', 1.5, 'item', 'Metal Powder');
      } else {
        // 100% DEF boost if "Metal Powder" is held by a Ditto (gen 3+)
        record.apply('def', 2, 'item', 'Metal Powder');
      }
    }
  }

  // finished gen 2 abilities and items
  if (gen <= 2) {
    return record.export();
  }

  // apply Dynamax effects
  const hasDynamax = 'dynamax' in pokemon.volatiles
    || pokemon.useMax;

  // 100% (2x) HP boost when Dynamaxed
  if (hasDynamax) {
    record.apply('hp', 2, 'ultimate', 'Dynamax');
  }

  // apply more item effects
  // (at this point, we should at least be gen 3)
  if (!ignoreItem) {
    // 50% ATK boost if "Choice Band" is held
    if (item === 'choiceband' && !hasDynamax) {
      record.apply('atk', 1.5, 'item', 'Choice Band');
    }

    // 50% SPA boost if "Choice Specs" is held
    if (item === 'choicespecs' && !hasDynamax) {
      record.apply('spa', 1.5, 'item', 'Choice Specs');
    }

    if (item === 'choicescarf' && !hasDynamax) {
      record.apply('spe', 1.5, 'item', 'Choice Scarf');
    }

    // 50% SPA boost if "Assault Vest" is held
    if (item === 'assaultvest') {
      record.apply('spd', 1.5, 'item', 'Assault Vest');
    }

    // 100% DEF boost if "Fur Coat" is held
    if (item === 'furcoat') {
      record.apply('def', 2, 'item', 'Fur Coat');
    }

    if (baseForme === 'clamperl') {
      if (item === 'deepseatooth') {
        // 100% SPA boost if "Deep Sea Tooth" is held by a Clamperl
        record.apply('spa', 2, 'item', 'Deep Sea Tooth');
      } else if (item === 'deepseascale') {
        // 100% SPD boost if "Deep Sea Scale" is held by a Clamperl
        record.apply('spd', 2, 'item', 'Deep Sea Scale');
      }
    }

    if (item === 'souldew' && gen < 7 && ['latios', 'latias'].includes(baseForme)) {
      // 50% SPA/SPD boost if "Soul Dew" is held by a Latios/Latias (gens 3-6)
      record.apply('spa', 1.5, 'item', 'Soul Dew');
      record.apply('spd', 1.5, 'item', 'Soul Dew');
    }

    const speedReductionItems = [
      'ironball',
      ...PokemonSpeedReductionItems.map((i) => id(i)),
    ];

    if (speedReductionItems.includes(item)) {
      record.apply('spe', 0.5, 'item', dex.items.get(item)?.name || item);
    }
  }

  // 100% ATK boost if ability is "Pure Power" or "Huge Power"
  if (['purepower', 'hugepower'].includes(ability)) {
    record.apply('atk', 2, 'ability', dex.abilities.get(ability)?.name || ability);
  }

  // 50% ATK boost if ability is "Hustle" or "Gorilla Tactics" (and not dynamaxed, for the latter only)
  if (ability === 'hustle' || (ability === 'gorillatactics' && !hasDynamax)) {
    record.apply('atk', 1.5, 'ability', dex.abilities.get(ability)?.name || ability);
  }

  // apply "Ruin" ability effects that'll ruin me (gen 9)
  // update (2022/12/14): Showdown fixed the Ruin stacking bug, so apply only once now
  // update (2023/01/23): apparently Ruin abilities will CANCEL each other out if BOTH Pokemon have it
  if (ruinAbilitiesActive(player?.side, opponent?.side)) {
    const ruinCounts = countRuinAbilities(player?.side, opponent?.side);

    // 25% SPD reduction if there's at least one Pokemon with the "Beads of Ruin" ability (excluding this `pokemon`)
    const ruinBeadsCount = Math.max(ruinCounts.beads - (ability === 'beadsofruin' ? ruinCounts.beads : 0), 0);

    if (ruinBeadsCount) {
      record.apply('spd', 0.75, 'ability', 'Beads of Ruin');
    }

    // 25% DEF reduction if there's at least one Pokemon with the "Sword of Ruin" ability (excluding this `pokemon`)
    const ruinSwordCount = Math.max(ruinCounts.sword - (ability === 'swordofruin' ? ruinCounts.sword : 0), 0);

    if (ruinSwordCount) {
      record.apply('def', 0.75, 'ability', 'Sword of Ruin');
    }

    // 25% ATK reduction if there's at least one Pokemon with the "Tablets of Ruin" ability (excluding this `pokemon`)
    const ruinTabletsCount = Math.max(ruinCounts.tablets - (ability === 'tabletsofruin' ? ruinCounts.tablets : 0), 0);

    if (ruinTabletsCount) {
      record.apply('atk', 0.75, 'ability', 'Tablets of Ruin');
    }

    // 25% SPA reduction if there's at least one Pokemon with the "Vessel of Ruin" ability (excluding this `pokemon`)
    const ruinVesselCount = Math.max(ruinCounts.vessel - (ability === 'vesselofruin' ? ruinCounts.vessel : 0), 0);

    if (ruinVesselCount) {
      record.apply('spa', 0.75, 'ability', 'Vessel of Ruin');
    }
  }

  // apply weather effects
  const weather = id(field.weather);

  const ignoreWeather = [
    ability,
    opponentAbility,
  ].filter(Boolean).some((a) => ['airlock', 'cloudnine'].includes(a));

  if (weather && !ignoreWeather) {
    // note: see WeatherMap in weather consts for the sanitized value
    // (e.g., `weather` will be `'sand'`, not `'sandstorm'`)
    if (weather === 'sand') {
      // 50% SPD boost if Rock type w/ darude sandstorm
      if (types.includes('Rock')) {
        record.apply('spd', 1.5, 'field', 'Darude Sandstorm');
      }

      // 2x SPE modifier if ability is "Sand Rush" w/ sarude dandstorm
      if (ability === 'sandrush') {
        record.apply('spe', 2, 'ability', 'Sand Rush');
      }
    }

    // 2x SPE modifier if ability is "Slush Rush" w/ hail/snow
    if (['hail', 'snow'].includes(weather) && ability === 'slushrush') {
      record.apply('spe', 2, 'ability', 'Slush Rush');
    }

    // 50% DEF boost if Ice type w/ "snow" only (gen 9)
    if (weather === 'snow' && types.includes('Ice')) {
      record.apply('def', 1.5, 'field', 'Snow');
    }

    if (ignoreItem || item !== 'utilityumbrella') {
      if (['sun', 'harshsunshine'].includes(weather)) {
        // 50% SPA boost if ability is "Solar Power", sunny/desolate, and Pokemon is NOT holding "Utility Umbrella"
        if (ability === 'solarpower') {
          record.apply('spa', 1.5, 'ability', 'Solar Power');
        }

        // 2x SPE modifier if ability is "Chlorophyll", sunny/desolate, and Pokemon is NOT holding "Utility Umbrella"
        if (ability === 'chlorophyll') {
          record.apply('spe', 2, 'ability', 'Chlorophyll');
        }

        // 30% ATK boost if ability is "Orichal Cumpulse" (hehe), sunny/desolate, and Pokemon is NOT holding "Utility Umbrella"
        if (ability === 'orichalcumpulse') { // "...uhm but actually, it's Orichalcum Pulse"
          record.apply('atk', 1.3, 'ability', 'Orichalcum Pulse');
        }

        /**
         * @todo *Properly* implement support for ally Pokemon, notably Cherrim's "Flower Gift".
         * @see https://github.com/smogon/pokemon-showdown-client/blob/master/src/battle-tooltips.ts#L1098-L1109
         */
        // 50% ATK/SPD boost if ability is "Flower Gift" and sunny/desolate
        if (ability === 'flowergift' && (gen <= 4 || baseForme === 'cherrim')) {
          record.apply('atk', 1.5, 'ability', 'Flower Gift');
        }
      }
    }

    // 2x SPE modifier if ability is "Swift Swim" and rain/primordial
    if (['rain', 'heavyrain'].includes(weather) && ability === 'swiftswim') {
      record.apply('spe', 2, 'ability', 'Swift Swim');
    }
  }

  // 50% ATK/SPA reduction if ability is "Defeatist" and HP is 50% or less
  // yoo when tf did they make me into an ability lmaooo
  if (ability === 'defeatist' && hpPercentage <= 0.5) {
    record.apply('atk', 0.5, 'ability', 'Defeatist');
    record.apply('spa', 0.5, 'ability', 'Defeatist');
  }

  // apply additional status effects
  if (pokemon.status) {
    if (ability === 'marvelscale') {
      record.apply('def', 1.5, 'ability', 'Marvel Scale');
    }
  }

  // apply NFE (not fully evolved) effects
  const nfe = notFullyEvolved(species);

  if (nfe) {
    // 50% DEF/SPD boost if "Eviolite" is held by an NFE Pokemon
    if (!ignoreItem && item === 'eviolite') {
      record.apply('def', 1.5, 'item', 'Eviolite');
      record.apply('spd', 1.5, 'item', 'Eviolite');
    }
  }

  // apply terrain effects
  const terrain = id(field.terrain);

  // 50% DEF boost if ability is "Grass Pelt" w/ terrain of the grassy nature
  if (ability === 'grasspelt' && terrain === 'grassy') {
    record.apply('def', 1.5, 'ability', 'Grass Pelt');
  }

  if (terrain === 'electric') {
    // 2x SPE modifier if ability is "Surge Surfer" w/ electric terrain
    if (ability === 'surgesurfer') {
      record.apply('spe', 2, 'ability', 'Surge Surfer');
    }

    // 30% SPA boost if ability is "Hadron Engine" w/ electric terrain
    if (ability === 'hadronengine') {
      record.apply('spa', 1.3, 'ability', 'Hadron Engine');
    }
  }

  // apply player side conditions
  // const fieldSideKey = playerKey === 'p1' ? 'attackerSide' : 'defenderSide';
  // const playerSide = field[fieldSideKey];
  const { side: playerSide } = player || {};

  // 2x SPE modifier if "Tailwind" is active on the field
  if (playerSide?.isTailwind) {
    record.apply('spe', 2, 'field', 'Tailwind');
  }

  // 0.25x SPE modifier if "Grass Pledge" is active on the field
  if (playerSide?.isGrassPledge) {
    record.apply('spe', 0.25, 'field', 'Grass Pledge');
  }

  // 10% ATK/SPA boost for each fainted Pokemon if ability is "Supreme Overlord" (gen 9)
  // update: whoops, it's actually a base power mod >:(
  // if (ability === 'supremeoverlord' && playerSide?.faintedCount > 0) {
  //   const { faintedCount } = playerSide;
  //   const modifier = 1 + (0.1 * faintedCount);
  //   const label = `Supreme Overlord ${faintedCount > 1 ? `${times}${faintedCount}` : ''}`;
  //
  //   record.apply('atk', modifier, 'ability', label);
  //   record.apply('spa', modifier, 'ability', label);
  // }

  // apply toggleable abilities
  if (pokemon.abilityToggled) {
    // 50% ATK/SPE reduction if ability is "Slow Start"
    if (ability === 'slowstart') {
      record.apply('atk', 0.5, 'ability', 'Slow Start');
      record.apply('spe', 0.5, 'ability', 'Slow Start');
    }

    // 2x SPE modifier if ability is "Unburden" and item was removed
    if (ability === 'unburden') {
      record.apply('spe', 2, 'ability', 'Unburden');
    }

    /**
     * @todo Implement ally Pokemon support for "Minus" and "Plus" toggleable abilities.
     * @see https://github.com/smogon/pokemon-showdown-client/blob/master/src/battle-tooltips.ts#L1159-L1172
     */

    // 30% highest stat boost (or 1.5x SPE modifier) if ability is "Protosynthesis" or "Quark Drive"
    if (['protosynthesis', 'quarkdrive'].includes(ability) && highestBoostedStat) {
      // if the Pokemon has a booster volatile, use its reported stat
      // e.g., 'protosynthesisatk' -> boosterVolatileStat = 'atk'
      const boosterVolatile = Object.keys(pokemon.volatiles || {}).find((k) => /^(?:proto|quark)/i.test(k));
      const boosterVolatileStat = <Showdown.StatNameNoHp> boosterVolatile?.replace(/(?:protosynthesis|quarkdrive)/i, '');
      const stat = boosterVolatileStat || highestBoostedStat;

      record.apply(
        stat,
        stat === 'spe' ? 1.5 : 1.3,
        'ability',
        dex.abilities.get(ability)?.name || ability,
      );
    }
  }

  return record.export();
};
