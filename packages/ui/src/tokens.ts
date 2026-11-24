/**
 * CampusCart brand colours, shared by the student and shop sides of the app.
 * green and red are deep enough for white text on them, and for themselves as text on white or on
 * their soft tints, to pass WCAG AA (4.5:1). The lighter launch green (#1A9E4B) stays only in app.json
 * (icon, splash, notification accent), where no small text sits on it.
 */
export const Brand = {
  yellow: '#FFD23F',
  yellowSoft: '#FFF6D6',
  // The website's quick-commerce green (4.9:1 on white, so it also works as text).
  green: '#0C831F',
  greenSoft: '#EDF8E8',
  red: '#C62828',
  redSoft: '#FBE7E7',
  ink: '#1C1C1C',
  inkSoft: '#5F6368',
} as const;

/**
 * The storefront look shared with the website (apps/web, from the earlier MERN site): the
 * yellow-and-green wordmark, the light-green hero, the pastel promo cards and card lines.
 */
export const Storefront = {
  wordYellow: '#E5B814',
  wordGreen: '#29872E',
  hero: '#C3E29F',
  heroInk: '#244826',
  heroText: '#3F6533',
  bag: '#F6CE48',
  bagHandle: '#D8AD2A',
  mint: '#D7EFF0',
  lemon: '#FFF0AF',
  lilac: '#E7DFF6',
  line: '#E8E8E8',
  search: '#F7F7F7',
  searchLine: '#EBEBEB',
  chipLine: '#E0E7DF',
  addFill: '#F7FFF9',
  chip: '#F5F5F5',
  // The quick-commerce home: a warm cream header, light tiles behind product photos, white page.
  header: '#F8E7C3',
  headerDeep: '#F3DDB0',
  tile: '#EEF2F6',
  tileInner: '#FFFFFF',
  page: '#FFFFFF',
  muted: '#666666',
  rating: '#F5A623',
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
} as const;
