/**
 * Convert a SourceItem's design size into the arranged (layout) size
 * based on the desired orientation.
 *
 * @param {{size: {w:number, h:number}}} item
 * @param {'portrait'|'landscape'} orient
 * @returns {{w:number, h:number}}
 */
export function arrangedSize(item, orient) {
  const s = item.size;
  const w = Math.min(s.w, s.h);  // smaller = "short side"
  const h = Math.max(s.w, s.h);  // larger  = "long side"
  if (orient === 'landscape') return { w: h, h: w };  // long side horizontally
  return { w, h };                                     // long side vertically (portrait / unknown)
}