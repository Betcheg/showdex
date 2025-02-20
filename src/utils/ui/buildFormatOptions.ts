import { type GenerationNum } from '@smogon/calc';
import { type DropdownOption } from '@showdex/components/form';
import { FormatSectionLabels, GenLabels } from '@showdex/consts/dex';
import { formatId, nonEmptyObject } from '@showdex/utils/core';
import { detectGenFromFormat, getGenfulFormat, parseBattleFormat } from '@showdex/utils/dex';

export type CalcdexBattleFormatOption = DropdownOption<string>;

const prioritySection = (
  section: string,
): boolean => /\s(?:singles(?:\/doubles)?|doubles(?:\/triples)?|triples)$/i.test(section);

const standardizeSection = (
  section: string,
  all?: string[],
  gen?: GenerationNum,
): string => {
  const sectionId = formatId(section);

  if (!sectionId) {
    return section;
  }

  if (sectionId in FormatSectionLabels) {
    return FormatSectionLabels[sectionId];
  }

  if (sectionId === 'pastgenerations') {
    return all?.find((s) => formatId(s).includes('singles'))
      || `${GenLabels[gen]?.label || ''} Singles`.trim();
  }

  if (sectionId === 'pastgensdoublesou') {
    return all?.find((s) => formatId(s).includes('doubles'))
      || `${GenLabels[gen]?.label || ''} Doubles`.trim();
  }

  return section;
};

/**
 * Builds the `options[]` prop for the battle format `Dropdown` in `BattleInfo`.
 *
 * @since 1.2.0
 */
export const buildFormatOptions = (
  gen: GenerationNum,
  config?: {
    showAll?: boolean;
  },
): CalcdexBattleFormatOption[] => {
  const options: CalcdexBattleFormatOption[] = [];

  if (!nonEmptyObject(BattleFormats)) {
    return options;
  }

  const { showAll } = config || {};
  const eligible = (f: string) => !!f && (showAll || (!f.includes('random') && !f.includes('custom')));

  const favoritedFormats = Object.entries(Dex?.prefs('starredformats') || {})
    .filter(([format, faved]) => eligible(format) && detectGenFromFormat(format) === gen && faved)
    .map(([format]) => format);

  const genFormats = Object.values(BattleFormats)
    .filter((f) => eligible(f?.id) && detectGenFromFormat(f.id) === gen);

  if (!favoritedFormats.length && !genFormats.length) {
    return options;
  }

  // note: filtering by `label`, NOT `value` !!
  // (using the latter can result in 2 BSS formats showing up in Gen 9, for both 'gen9bss' & 'gen9battlestadiumsingles')
  const filterFormats: string[] = [];

  const initialSections: string[] = genFormats
    .reduce((prev, format) => {
      // `column` is 1-indexed (i.e., starts with column 1, not 0)
      if (!format?.column || !format.section || prev.includes(format.section)) {
        return prev;
      }

      prev.splice(format.column, 0, format.section);

      return prev;
    }, [] as string[])
    .filter(Boolean);

  const sections: CalcdexBattleFormatOption[] = initialSections
    .reduce((prev, value) => {
      if (!value) {
        return prev;
      }

      const section = standardizeSection(value, initialSections, gen);

      if (!prev.includes(section)) {
        prev.push(section);
      }

      return prev;
    }, [] as string[])
    .sort((a, b) => (
      prioritySection(a)
        ? prioritySection(b)
          ? a.endsWith('Singles')
            ? -1
            : b.endsWith('Singles')
              ? 1
              : 0
          : -1
        : prioritySection(b)
          ? 1
          : 0
    ))
    .map((section) => ({
      label: section,
      options: [],
    }));

  if (favoritedFormats.length) {
    sections.unshift({
      label: 'Favorites',
      options: favoritedFormats.map((format) => {
        const { base, label } = parseBattleFormat(format);
        const value = getGenfulFormat(gen, base);

        if (filterFormats.includes(label)) {
          return null;
        }

        filterFormats.push(label);

        return {
          value,
          label,
        };
      }).filter(Boolean),
    });
  }

  if (!sections.length) {
    return genFormats.reduce((prev, format) => {
      const { base, label } = parseBattleFormat(format.id);
      const value = getGenfulFormat(gen, base);

      if (filterFormats.includes(label)) {
        return prev;
      }

      prev.push({
        value,
        label,
      });

      filterFormats.push(label);

      return prev;
    }, [] as CalcdexBattleFormatOption[]);
  }

  const otherFormats: CalcdexBattleFormatOption = {
    label: 'Other',
    options: [],
  };

  genFormats.forEach((format) => {
    const section = standardizeSection(format.section, initialSections, gen);
    const group = (!!section && sections.find((g) => g.label === section)) || otherFormats;

    const { base, label } = parseBattleFormat(format.id);
    const value = getGenfulFormat(gen, base);

    if (filterFormats.includes(label)) {
      return;
    }

    group.options.push({
      value,
      label,
    });

    filterFormats.push(label);
  });

  options.push(
    ...sections.filter((g) => !!g.options.length),
    ...(otherFormats.options.length ? [otherFormats] : []),
  );

  return options;
};
