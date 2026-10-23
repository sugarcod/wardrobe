import type { Category, Occasion, Season } from '../types';
import { normalizeText } from './util';

interface Rule<T> { value: T; keys: string[] }

// Порядок важен: более специфичные правила — раньше (свитшот раньше рубашки, куртка раньше рубашки…)
type KindRule = Rule<{ category: Category; subtype?: string }>;
const k = (category: Category, subtype: string | undefined, keys: string[]): KindRule => ({ value: { category, subtype }, keys });
const CATEGORY_RULES: KindRule[] = [
  k('dress', undefined, ['dress', 'jumpsuit', 'overall', 'romper', 'sundress', 'платье', 'платьиц', 'комбинезон', 'сарафан']),
  k('outerwear', 'puffer', ['puffer', 'down-jacket', 'downjacket', 'пуховик']),
  k('outerwear', 'trench', ['trench', 'тренч']),
  k('outerwear', 'coat', ['coat', 'overcoat', 'parka', 'пальто', 'парка', 'шуба', 'дубленк']),
  k('outerwear', 'windbreaker', ['windbreaker', 'raincoat', 'anorak', 'дождевик', 'ветровк', 'анорак']),
  k('top', 'blazer', ['blazer', 'пиджак', 'жакет']),
  k('outerwear', 'jacket', ['jacket', 'bomber', 'куртк', 'бомбер', 'косух']),
  k('bottom', undefined, ['jeans', 'pants', 'sweatpants', 'trackpants', 'trousers', 'shorts', 'skirt', 'leggings', 'joggers', 'chinos', 'джинс', 'брюк', 'штаны', 'шорт', 'юбк', 'леггинс', 'лосин', 'джогер', 'чинос']),
  k('shoes', undefined, ['shoe', 'sneaker', 'boot', 'heel', 'sandal', 'loafer', 'flats', 'trainer', 'pumps', 'туфл', 'кроссовк', 'кеды', 'ботин', 'сапог', 'сапоги', 'босоножк', 'сандал', 'лофер', 'балетк', 'мокасин', 'ботильон', 'сникер', 'мюли', 'обувь']),
  k('bag', 'backpack', ['backpack', 'rucksack', 'рюкзак']),
  k('bag', 'briefcase', ['briefcase', 'portfolio', 'портфел', 'дипломат']),
  k('bag', 'clutch', ['clutch', 'клатч']),
  k('bag', 'handbag', ['bag', 'handbag', 'tote', 'purse', 'сумк', 'шоппер']),
  k('hat', 'panama', ['panama', 'bucket', 'панам']),
  k('hat', 'cap', ['cap', 'baseball', 'кепк', 'бейсболк']),
  k('hat', 'beanie', ['beanie', 'шапк', 'берет', 'beret']),
  k('hat', 'hat', ['hat', 'fedora', 'шляп']),
  k('jewelry', 'watch', ['watch', 'часы', 'часик']),
  k('jewelry', 'earrings', ['earring', 'серьг', 'сережк']),
  k('jewelry', 'bracelet', ['bracelet', 'bangle', 'браслет']),
  k('jewelry', 'ring', ['ring', 'кольц', 'перстен']),
  k('jewelry', 'necklace', ['necklace', 'chain', 'pendant', 'колье', 'цеп', 'ожерель', 'подвеск', 'бусы', 'кулон']),
  k('jewelry', 'jewel', ['jewel', 'brooch', 'брошь', 'брошк', 'украшен']),
  k('other', 'glasses', ['glasses', 'sunglasses', 'очки']),
  k('other', 'belt', ['belt', 'ремен', 'ремн', 'пояс']),
  k('other', 'scarf', ['scarf', 'шарф', 'платок', 'палантин']),
  k('other', 'accessory', ['tie', 'gloves', 'галстук', 'перчатк']),
  k('top', 'cardigan', ['cardigan', 'кардиган']),
  k('top', 'vest', ['vest', 'gilet', 'жилет']),
  k('top', 'hoodie', ['hoodie', 'худи', 'толстовк']),
  k('top', 'sweatshirt', ['sweatshirt', 'свитшот']),
  k('top', 'jumper', ['jumper', 'pullover', 'джемпер', 'пуловер', 'кофт']),
  k('top', 'sweater', ['sweater', 'knit', 'свитер']),
  k('top', 'longsleeve', ['longsleeve', 'turtleneck', 'лонгслив', 'водолазк']),
  k('top', 'blouse', ['blouse', 'блузк', 'блуза']),
  k('top', 'shirt', ['shirt', 'рубашк', 'сорочк']),
  k('top', 'tank', ['tank', 'singlet', 'майк']),
  k('top', 'croptop', ['top', 'crop', 'топ']),
  k('top', 'tshirt', ['tshirt', 'tee', 'polo', 'футболк', 'поло']),
];

/** Вид вещи по названию (для миграции старых вещей без подтипа) */
export function kindFromName(name: string): { category: Category; subtype?: string } | undefined {
  return match(name, CATEGORY_RULES);
}

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
  subtype?: string;
  season?: Season;
  occasion?: Occasion;
  color?: string;
}

export function hintsFromFilename(fileName: string): FilenameHints {
  const clean = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/([a-z]{2})-(?=[a-z]{3,})/gi, '$1 ').replace(/\s+/g, ' ').trim();
  const pretty = /^(img|dsc|photo|image|screenshot|pxl)[\s-]?\d/i.test(clean) || /^\d+$/.test(clean) ? '' : clean;
  return {
    name: pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : '',
    ...(() => {
      const kind = match(fileName, CATEGORY_RULES);
      return kind ? { category: kind.category, subtype: kind.subtype } : {};
    })(),
    season: match(fileName, SEASON_RULES),
    occasion: match(fileName, OCCASION_RULES),
    color: match(fileName, COLOR_RULES),
  };
}
