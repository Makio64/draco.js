// core/VarintDecoding.js - ported from varint_decoding.h

import { convertSymbolToSignedInt } from './BitUtils.js';

// Unsigned varint, MSB continuation coding. Returns undefined on error.
function decodeVarintUnsigned(buffer, maxBytes) {
  let result = 0;
  for (let i = 0; i < maxBytes; i++) {
    const byte = buffer.decodeUint8();
    if (byte === undefined) return undefined;
    if (byte & 0x80) {
      // C++ builds the value MSB-first via recursion (recurse, then shift and OR).
      // We replicate that by collecting bytes and building MSB-first.
      const bytes = [byte & 0x7F];
      let done = false;
      for (let j = i + 1; j < maxBytes; j++) {
        const next = buffer.decodeUint8();
        if (next === undefined) return undefined;
        if (next & 0x80) {
          bytes.push(next & 0x7F);
        } else {
          bytes.push(next);
          done = true;
          break;
        }
      }
      if (!done) return undefined;
      // Last byte read is the most significant.
      result = bytes[bytes.length - 1];
      for (let k = bytes.length - 2; k >= 0; k--) {
        result = (result * 128) + bytes[k];
      }
      return result;
    } else {
      return byte;
    }
  }
  return undefined;
}

// signed applies zigzag decoding. Returns undefined on error.
export function decodeVarint(buffer, signed = false) {
  const maxBytes = 10;
  const value = decodeVarintUnsigned(buffer, maxBytes);
  if (value === undefined) return undefined;
  if (signed) {
    return convertSymbolToSignedInt(value);
  }
  return value;
}
