// core/Macros.js - ported from macros.h

// Packs major/minor into a single uint16.
export function bitstreamVersion(major, minor) {
  return ((major & 0xFF) << 8) | (minor & 0xFF);
}
