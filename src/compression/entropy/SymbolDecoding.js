// compression/entropy/SymbolDecoding.js - ported from compression/entropy/symbol_decoding.h/cc

import { RAnsSymbolDecoder } from './RAnsSymbolDecoder.js';
import { SymbolCodingMethod } from '../config/CompressionShared.js';

// Decodes an array of symbols that was previously encoded with an entropy code.
// Returns false on error.
// |numValues| - number of values to decode
// |numComponents| - number of components (used for tagged coding)
// |srcBuffer| - DecoderBuffer to read from
// |outValues| - Uint32Array to write decoded symbols into
export function decodeSymbols(numValues, numComponents, srcBuffer, outValues) {
  if (numValues === 0) {
    return true;
  }
  // Decode which scheme to use.
  const scheme = srcBuffer.decodeUint8();
  if (scheme === undefined) {
    return false;
  }
  if (scheme === SymbolCodingMethod.SYMBOL_CODING_TAGGED) {
    return decodeTaggedSymbols(numValues, numComponents, srcBuffer, outValues);
  } else if (scheme === SymbolCodingMethod.SYMBOL_CODING_RAW) {
    return decodeRawSymbols(numValues, srcBuffer, outValues);
  }
  return false;
}

function decodeTaggedSymbols(numValues, numComponents, srcBuffer, outValues) {
  // Decode the encoded data using a tag decoder with 5 precision bits.
  const tagDecoder = new RAnsSymbolDecoder(5);
  if (!tagDecoder.create(srcBuffer)) {
    return false;
  }

  if (!tagDecoder.startDecoding(srcBuffer)) {
    return false;
  }

  if (numValues > 0 && tagDecoder.numSymbols === 0) {
    return false; // Wrong number of symbols.
  }

  // srcBuffer now points behind the encoded tag data (to the place where the
  // values are encoded).
  srcBuffer.startBitDecoding(false);
  // Hoist the bit decoder out of the hot loop. After startBitDecoding(false)
  // the buffer is guaranteed to be in bit mode, so decodeLeastSignificantBits32
  // would always delegate straight to this._bitDecoder.getBits — call getBits
  // directly to remove a layer of method dispatch per component.
  const bd = srcBuffer._bitDecoder;
  // Hoist the rANS decoder for the tag; tagDecoder.decodeSymbol() is exactly
  // a delegation to this.ans_.ransRead().
  const tagAns = tagDecoder.ans_;
  let valueId = 0;
  for (let i = 0; i < numValues; i += numComponents) {
    // Decode the tag.
    const bitLength = tagAns.ransRead();
    // Decode the actual value.
    for (let j = 0; j < numComponents; ++j) {
      const val = bd.getBits(bitLength);
      if (val === undefined) {
        return false;
      }
      outValues[valueId++] = val;
    }
  }
  tagDecoder.endDecoding();
  srcBuffer.endBitDecoding();
  return true;
}

function decodeRawSymbolsInternal(uniqueSymbolsBitLength, numValues, srcBuffer, outValues) {
  const decoder = new RAnsSymbolDecoder(uniqueSymbolsBitLength);
  if (!decoder.create(srcBuffer)) {
    return false;
  }

  if (numValues > 0 && decoder.numSymbols === 0) {
    return false; // Wrong number of symbols.
  }

  if (!decoder.startDecoding(srcBuffer)) {
    return false;
  }
  decoder.ans_.decodeSymbols(outValues, numValues);
  decoder.endDecoding();
  return true;
}

function decodeRawSymbols(numValues, srcBuffer, outValues) {
  const maxBitLength = srcBuffer.decodeUint8();
  if (maxBitLength === undefined) {
    return false;
  }
  if (maxBitLength < 1 || maxBitLength > 18) {
    return false;
  }
  return decodeRawSymbolsInternal(maxBitLength, numValues, srcBuffer, outValues);
}
