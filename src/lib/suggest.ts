import type { Category, Occasion, Season } from '../types';
import { normalizeText } from './util';

interface Rule<T> { value: T; keys: string[] }

// Порядок важен: более специфичные категории — раньше
const CATEGORY_RULES: Rule<Category>[] = [
  { value: 'dress', keys: ['dress', 'jumpsuit', 'overall', 'romper', 'sundress', 'платье', 'платьиц', 'комбинезон', 'сарафан'] },
  { value: 'outerwear', keys: ['coat', 'jacket', 'blazer', 'parka', 'trench', 'puffer', 'cardigan', 'vest', 'bomber', 'windbreaker', 'пальто', 'куртк', 'пиджак', 'жакет', 'парка', 'тренч', 'пуховик', 'кардиган', 'жилет', 'бомбер', 'ветровк', 'шуба', 'дубленк', 'косух'] },
  { value: 'bottom', keys: ['jeans', 'pants', 'sweatpants', 'trackpants', 'trousers', 'shorts', 'skirt', 'leggings', 'joggers', 'chinos', 'джинс', 'брюк', 'штаны', 'шорт', 'юбк', 'леггинс', 'лосин', 'джогер', 'чинос'] },
  { value: 'shoes', keys: ['shoe', 'sneaker', 'boot', 'heel', 'sandal', 'loafer', 'flats', 'trainer', 'pumps', 'туфл', 'кроссовк', 'кеды', 'ботин', 'сапог', 'сапоги', 'босоножк', 'сандал', 'лофер', 'балетк', 'мокасин', 'ботильон', 'сникер', 'мюли', 'обувь'] },
  { value: 'bag', keys: ['bag', 'handbag', 'backpack', 'clutch', 'tote', 'purse', 'сумк', 'рюкзак', 'клатч', 'шоппер'] },
  { value: 'hat', keys: ['hat', 'cap', 'beanie', 'beret', 'panama', 'шапк', 'кепк', 'шляп', 'берет', 'панам', 'бейсболк'] },
  { value: 'jewelry', keys: ['necklace', 'earring', 'bracelet', 'ring', 'chain', 'jewel', 'pendant', 'колье', 'серьг', 'браслет', 'кольцо', 'цепочк', 'ожерель', 'подвеск', 'бусы', 'кулон', 'украшен'] },
  { value: 'other', keys: ['scarf', 'belt', 'glasses', 'sunglasses', 'tie', 'шарф', 'ремен', 'ремн', 'очки', 'платок', 'галстук', 'перчатк'] },
  { value: 'top', keys: ['shirt', 'tshirt', 'tee', 'top', 'blouse', 'sweater', 'hoodie', 'sweatshirt', 'longsleeve', 'polo', 'turtleneck', 'jumper', 'pullover', 'tank', 'футболк', 'рубашк', 'блузк', 'блуза', 'свитер', 'худи', 'толстовк', 'топ', 'водолазк', 'лонгслив', 'джемпер', 'кофт', 'майк', 'поло', 'свитшот', 'пуловер'] },
];

const SEASON_RULES: Rule<Season>[] = [
  { value: 'winter', keys: ['winter', 'wool', 'puffer', 'down', 'зим', 'шерст', 'пуховик', 'шуба', 'дубленк', 'валенк', 'теплы', 'тепла'] },
  { value: 'summer', keys: ['summer', 'linen', 'beach', 'лет', 'льнян', 'лен', 'пляж', 'сарафан', 'шорт', 'сандал', 'босоножк', 'панам', 'майк'] },
  { value: 'autumn', keys: ['autumn', 'fall', 'осен', 'тренч'] },
  { value: 'spring', keys: ['spring', 'весн', 'весен'] },
];

const OCCASION_RULES: Rule<Occasion>[] = [
  { value: 'sport', keys: ['sport', 'gym', 'running', 'fitness', 'yoga', 'спорт', 'фитнес', 'йог', 'бег', 'леггинс', 'лосин'] },
  { value: 'evening', keys: ['evening', 'party', 'cocktail', 'heels', 'gala', 'вечер', 'вечерн', 'коктейл', 'праздн', 'клатч', 'шпильк'] },
  { value: 'work', keys: ['office', 'work', 'business', 'formal', 'blazer', 'офис', 'работ', 'делов', 'пиджак', 'классич'] },
  { value: 'daily', keys: ['casual', 'daily', 'everyday', 'повседнев', 'каждый', 'кэжуал'] },
];

const COLOR_RULES: Rule<string>[] = [
  { value: 'black', keys: ['black', 'черн'] },
  { value: 'white', keys: ['white', 'бел', 'молочн', 'ivory', 'cream', 'кремов'] },
  { value: 'gray', keys: ['gray', 'grey', 'серый', 'серая', 'серое', 'серые', 'серого', 'графит'] },
  { value: 'beige', keys: ['beige', 'nude', 'бежев', 'песочн', 'camel', 'кэмел'] },
  { value: 'navy', keys: ['navy', 'darkblue', 'темно-син', 'темносин'] },
  { value: 'denim', keys: ['denim', 'деним', 'джинсов'] },
  { value: 'brown', keys: ['brown', 'коричн', 'шоколад'] },
  { value: 'khaki', keys: ['khaki', 'olive', 'хаки', 'оливк', 'оливков'] },
  { value: 'burgundy', keys: ['burgundy', 'wine', 'maroon', 'бордо', 'бордов', 'винн'] },
  { value: 'red', keys: ['red', 'красн', 'алый'] },
  { value: 'pink', keys: ['pink', 'розов', 'пудров'] },
  { value: 'orange', keys: ['orange', 'оранж', 'терракот'] },
  { value: 'yellow', keys: ['yellow', 'желт', 'горчич'] },
  { value: 'green', keys: ['green', 'зелен', 'изумруд', 'мятн'] },
  { value: 'lightblue', keys: ['lightblue', 'light-blue', 'skyblue', 'голуб'] },
  { value: 'blue', keys: ['blue', 'синий', 'синяя', 'синее', 'синие', 'электрик'] },
  { value: 'purple', keys: ['purple', 'violet', 'lilac', 'lavender', 'фиолет', 'сиренев', 'лаванд'] },
  { value: 'multi', keys: ['print', 'floral', 'stripe', 'принт', 'цветоч', 'полоск', 'клетк'] },
];

function tokens(name: string) {
  const base = normalizeText(name.replace(/\.[a-z0-9]+$/i, ''));
  const hyphenated = base.split(/[^a-zа-я0-9-]+/).filter(Boolean);
  const words = base.split(/[^a-zа-я0-9]+/).filter(Boolean);
  // 't-shirt' → 'tshirt'
  return { base: base.replace(/[_\s.]+/g, ' '), words: [...words, ...hyphenated, ...hyphenated.map((w) => w.replace(/-/g, ''))] };
}

function match<T>(name: string, rules: Rule<T>[]): T | undefined {
  const { base, words } = tokens(name);
  for (const r of rules) {
    for (const k of r.keys) {
      if (k.length <= 4 || /^[a-z-]+$/.test(k)) {
        // короткие и английские ключи — по началу слова, чтобы «top» не находился в «laptop»
        if (words.some((w) => w === k || w.startsWith(k))) return r.value;
      } else if (base.includes(k)) {
        return r.value;
      }
    }
  }
  return undefined;
}

export interface FilenameHints {
  name: string;
  category?: Category;
  season?: Season;
  occasion?: Occasion;
  color?: string;
}

export function hintsFromFilename(fileName: string): FilenameHints {
  const clean = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/([a-z]{2})-(?=[a-z]{3,})/gi, '$1 ').replace(/\s+/g, ' ').trim();
  const pretty = /^(img|dsc|photo|image|screenshot|pxl)[\s-]?\d/i.test(clean) || /^\d+$/.test(clean) ? '' : clean;
  return {
    name: pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : '',
    category: match(fileName, CATEGORY_RULES),
    season: match(fileName, SEASON_RULES),
    occasion: match(fileName, OCCASION_RULES),
    color: match(fileName, COLOR_RULES),
  };
}
