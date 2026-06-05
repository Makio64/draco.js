// core/Macros.js - ported from macros.h

// Packs major/minor into a single uint16.
export function bitstreamVersion(major, minor) {
  return ((major & 0xFF) << 8) | (minor & 0xFF);
}

export function bitstreamVersionMajor(version) {
  return (version >> 8) & 0xFF;
}

export function bitstreamVersionMinor(version) {
  return version & 0xFF;
}
