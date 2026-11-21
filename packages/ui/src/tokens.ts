/**
 * CampusCart brand colours, shared by the student and shop sides of the app.
 * green and red are deep enough for white text on them, and for themselves as text on white or on
 * their soft tints, to pass WCAG AA (4.5:1). The lighter launch green (#1A9E4B) stays only in app.json
 * (icon, splash, notification accent), where no small text sits on it.
 */
export const Brand = {
  yellow: '#FFD23F',
  yellowSoft: '#FFF6D6',
  green: '#13793A',
  greenSoft: '#E3F5EA',
  red: '#C62828',
  redSoft: '#FBE7E7',
  ink: '#1C1C1C',
  inkSoft: '#5F6368',
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
} as const;
