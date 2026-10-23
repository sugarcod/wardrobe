import type { Mood, PerfumeFamily, Weather } from './types';

export const PERFUME_FAMILIES: { id: PerfumeFamily; label: string; color: string }[] = [
  { id: 'citrus', label: 'Цитрусовые', color: '#efcf73' },
  { id: 'woody', label: 'Древесные', color: '#b98a5b' },
  { id: 'floral', label: 'Цветочные', color: '#e6aebc' },
  { id: 'oriental', label: 'Восточные', color: '#b4613f' },
  { id: 'fresh', label: 'Свежие', color: '#9fcfd3' },
  { id: 'gourmand', label: 'Гурманские', color: '#c99366' },
  { id: 'other', label: 'Другое', color: '#c9c0b3' },
];

export const FAMILY_BY_ID = Object.fromEntries(PERFUME_FAMILIES.map((f) => [f.id, f])) as Record<PerfumeFamily, (typeof PERFUME_FAMILIES)[number]>;


export const MOODS: { id: Mood; label: string }[] = [
  { id: 'great', label: 'Отлично' },
  { id: 'good', label: 'Хорошо' },
  { id: 'ok', label: 'Нормально' },
  { id: 'meh', label: 'Так себе' },
];
export const WEATHERS: { id: Weather; label: string }[] = [
  { id: 'sunny', label: 'Солнечно' },
  { id: 'cloudy', label: 'Облачно' },
  { id: 'rain', label: 'Дождь' },
  { id: 'snow', label: 'Снег' },
  { id: 'wind', label: 'Ветрено' },
  { id: 'hot', label: 'Жарко' },
  { id: 'cold', label: 'Холодно' },
];
export const MOOD_LABEL = Object.fromEntries(MOODS.map((m) => [m.id, m.label])) as Record<Mood, string>;
export const WEATHER_LABEL = Object.fromEntries(WEATHERS.map((m) => [m.id, m.label])) as Record<Weather, string>;
