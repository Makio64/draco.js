// core/Macros.js - ported from macros.h

// Converts major/minor version into a single uint16 number.
export function bitstreamVersion(major, minor) {
  return ((major & 0xFF) << 8) | (minor & 0xFF);
}

// Extracts major version from a bitstream version number.
export function bitstreamVersionMajor(version) {
  return (version >> 8) & 0xFF;
}

// Extracts minor version from a bitstream version number.
export function bitstreamVersionMinor(version) {
  return version & 0xFF;
}
