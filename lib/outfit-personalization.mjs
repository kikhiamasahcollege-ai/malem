const uniq = (values, maximum = 20) => [...new Set((Array.isArray(values) ? values : [])
  .map((value) => String(value || '').trim().toLowerCase())
  .filter(Boolean))].slice(0, maximum);

const clamp = (value, fallback, minimum = 0, maximum = 100) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
};

export const STYLE_OPTIONS = Object.freeze({
  archetypes: ['minimal', 'classic', 'romantic', 'vintage', 'streetwear', 'sporty', 'bohemian', 'avant-garde'],
  silhouettes: ['relaxed', 'tailored', 'fitted', 'oversized', 'fluid', 'structured'],
  palettes: ['neutral', 'earthy', 'monochrome', 'pastel', 'jewel-tone', 'bright'],
  footwear: ['sneakers', 'loafers', 'flats', 'boots', 'sandals', 'heels'],
});

export const DEFAULT_STYLE_DNA = Object.freeze({
  version: 1,
  completed: false,
  source: 'manual',
  archetypes: [],
  silhouettes: [],
  palettes: [],
  footwear: [],
  materials: [],
  patterns: [],
  avoid: [],
  closetStaples: [],
  intensity: 45,
  practicality: 75,
  experimentation: 25,
  updatedAt: null,
});

export const normalizeStyleDNA = (value = {}) => ({
  ...DEFAULT_STYLE_DNA,
  ...(value && typeof value === 'object' ? value : {}),
  version: 1,
  completed: Boolean(value?.completed),
  source: ['manual', 'calibration', 'pinterest-assisted'].includes(value?.source) ? value.source : 'manual',
  archetypes: uniq(value?.archetypes).filter((value) => STYLE_OPTIONS.archetypes.includes(value)),
  silhouettes: uniq(value?.silhouettes).filter((value) => STYLE_OPTIONS.silhouettes.includes(value)),
  palettes: uniq(value?.palettes).filter((value) => STYLE_OPTIONS.palettes.includes(value)),
  footwear: uniq(value?.footwear).filter((value) => STYLE_OPTIONS.footwear.includes(value)),
  materials: uniq(value?.materials),
  patterns: uniq(value?.patterns),
  avoid: uniq(value?.avoid),
  closetStaples: uniq(value?.closetStaples, 40),
  intensity: clamp(value?.intensity, DEFAULT_STYLE_DNA.intensity),
  practicality: clamp(value?.practicality, DEFAULT_STYLE_DNA.practicality),
  experimentation: clamp(value?.experimentation, DEFAULT_STYLE_DNA.experimentation),
  updatedAt: value?.updatedAt ? String(value.updatedAt) : null,
});

export const styleDNAKeywords = (styleDNA) => {
  const style = normalizeStyleDNA(styleDNA);
  const intensity = style.intensity >= 70 ? 'statement styling'
    : style.intensity <= 30 ? 'understated styling' : 'balanced styling';
  const practicality = style.practicality >= 70 ? 'practical comfortable'
    : style.practicality <= 30 ? 'fashion-forward' : 'wearable';
  return [
    ...style.archetypes,
    ...style.silhouettes.map((value) => `${value} silhouette`),
    ...style.palettes.map((value) => `${value} palette`),
    ...style.footwear,
    ...style.materials,
    ...style.patterns,
    intensity,
    practicality,
  ].filter(Boolean).join(' ');
};

const hourFor = (time) => {
  const match = String(time || '').match(/^(\d{1,2})(?::(\d{2}))?/);
  return match ? Math.max(0, Math.min(23, Number(match[1]))) : 12;
};

const periodFor = (time) => {
  const hour = hourFor(time);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const classifyBlock = (block = {}) => {
  const text = `${block.title || ''} ${block.kind || ''} ${block.notes || ''}`.toLowerCase();
  const tags = [];
  if (/museum|gallery|architecture|old town|walking tour|market|shopping|sight/.test(text)) tags.push('city walking');
  if (/hike|trail|mountain|park|outdoor|nature|cycling|bike/.test(text)) tags.push('active outdoors');
  if (/beach|boat|sail|pool|swim|coast|waterfront/.test(text)) tags.push('waterfront');
  if (/mosque|church|cathedral|temple|shrine|religious|sacred/.test(text)) tags.push('coverage required');
  if (/fine|tasting|michelin|opera|theatre|theater|cocktail|rooftop|reservation|dinner/.test(text)) tags.push('smart evening');
  if (/transit|train|flight|airport|drive/.test(text)) tags.push('travel comfort');
  if (!tags.length) tags.push(block.kind === 'meal' ? 'casual meal' : 'general sightseeing');
  return tags;
};

export const deriveOutfitMoments = (itineraryDay = {}, weather = null) => {
  const blocks = Array.isArray(itineraryDay?.blocks) ? itineraryDay.blocks : [];
  const groups = new Map();
  blocks.forEach((block) => {
    const period = periodFor(block.time);
    const current = groups.get(period) || { period, labels: [], requirements: [] };
    if (block.title) current.labels.push(String(block.title));
    current.requirements.push(...classifyBlock(block));
    groups.set(period, current);
  });
  const order = ['morning', 'afternoon', 'evening'];
  const moments = order.filter((period) => groups.has(period)).map((period) => {
    const group = groups.get(period);
    return {
      id: `${period}-${group.labels.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'plan'}`,
      period,
      label: group.labels.slice(0, 2).join(' → ') || `${period} plans`,
      requirements: uniq(group.requirements, 8),
    };
  });
  if (!moments.length) {
    moments.push({
      id: 'day-general-plan',
      period: 'day',
      label: itineraryDay?.theme || 'Day plans',
      requirements: ['general sightseeing'],
    });
  }
  const allRequirements = uniq(moments.flatMap((moment) => moment.requirements), 12);
  const walkingLevel = allRequirements.includes('active outdoors') ? 'high'
    : allRequirements.includes('city walking') ? 'medium' : 'light';
  const transitions = moments.length > 1
    ? moments.slice(1).map((moment, index) => `${moments[index].period} → ${moment.period}`)
    : [];
  const weatherText = weather && typeof weather === 'object'
    ? [weather.summary, weather.condition, weather.temperature, weather.high, weather.low].filter(Boolean).join(' ')
    : String(weather || '');
  return {
    dayTheme: String(itineraryDay?.theme || ''),
    moments,
    requirements: allRequirements,
    walkingLevel,
    transitions,
    weather: weatherText.slice(0, 240),
  };
};

export const buildOutfitIntent = ({ destination, season, look = {}, moment, profile = {}, extra = '' }) => {
  const style = normalizeStyleDNA(profile.styleDNA);
  const pieces = (look.pieces || look.items || []).map((piece) => piece.item || piece.value || '').filter(Boolean);
  return [
    destination,
    season,
    look.name,
    look.theme,
    look.why,
    look.activityNote,
    look.weatherNote,
    ...(look.vibeWords || []),
    ...(moment?.requirements || []),
    ...(moment?.moments || []).flatMap((entry) => [entry.label, ...(entry.requirements || [])]),
    `walking ${moment?.walkingLevel || 'light'}`,
    styleDNAKeywords(style),
    ...pieces,
    extra,
  ].filter(Boolean).join(' ');
};

export const buildPersonalizedQueries = ({
  location,
  season,
  audience,
  modest,
  look = {},
  moment,
  styleDNA,
  extra = '',
}) => {
  const style = normalizeStyleDNA(styleDNA);
  const taste = styleDNAKeywords(style);
  const momentText = [
    ...(moment?.requirements || []),
    ...(moment?.moments || []).map((entry) => `${entry.period} ${entry.requirements.join(' ')}`),
  ].join(' ');
  const vibe = [...(look.vibeWords || []), look.theme, look.name].filter(Boolean).join(' ');
  const footwear = style.footwear.slice(0, 2).join(' ');
  const queries = [
    `${location} ${season || ''} ${momentText} ${audience} ${modest} ${taste} complete outfit inspiration ${extra}`,
    `${location} ${vibe} ${audience} ${taste} ${footwear} full body travel outfit lookbook ${extra}`,
    `${momentText} ${style.archetypes.slice(0, 2).join(' ')} ${style.silhouettes.slice(0, 2).join(' ')} wearable day to night outfit ${extra}`,
  ];
  return uniq(queries.map((query) => query.replace(/\s+/g, ' ').trim()).filter(Boolean), 3);
};

export const feedbackEventWeight = (type, reason = '') => {
  const base = {
    love: 6,
    more_like_this: 5.5,
    save: 4.5,
    unsave: -4.5,
    hide: -5,
    dislike: -5,
    open: 1.25,
    zoom: 1.75,
  }[type] || 0;
  const reasonAdjustment = {
    wrong_activity: -1.5,
    uncomfortable: -1,
    wrong_silhouette: -1,
    wrong_color: -.75,
  }[reason] || 0;
  return base < 0 ? base + reasonAdjustment : base;
};

export const matchExplanation = ({ candidate = {}, moment, styleDNA }) => {
  const style = normalizeStyleDNA(styleDNA);
  const reasons = [];
  if (style.archetypes.length) reasons.push(`${style.archetypes.slice(0, 2).join(' + ')} taste`);
  if (style.silhouettes.length) reasons.push(`${style.silhouettes[0]} silhouette`);
  if (moment?.walkingLevel && moment.walkingLevel !== 'light') reasons.push(`${moment.walkingLevel} walking day`);
  if (moment?.requirements?.includes('smart evening')) reasons.push('evening-ready');
  if (moment?.requirements?.includes('coverage required')) reasons.push('coverage-aware');
  if (candidate.visionReason) reasons.push(candidate.visionReason);
  return reasons.slice(0, 3).join(' · ') || 'Matched to this day’s route and weather';
};
