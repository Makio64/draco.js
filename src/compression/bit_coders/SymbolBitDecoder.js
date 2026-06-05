// compression/bit_coders/SymbolBitDecoder.js - ported from compression/bit_coders/symbol_bit_decoder.h/cc

import { decodeSymbols } from '../entropy/SymbolDecoding.js';

// Decodes bits via the symbol entropy coding; wraps decodeSymbols().
export class SymbolBitDecoder {

  constructor() {
    this.symbols_ = []; // stack, pop from back
  }

  startDecoding(sourceBuffer) {
    const size = sourceBuffer.decodeUint32();
    if (size === undefined) {
      return false;
    }

    const symbolsArray = new Uint32Array(size);
    if (!decodeSymbols(size, 1, sourceBuffer, symbolsArray)) {
      return false;
    }
    // Reverse so pop() yields stream order (C++ reverse + pop_back).
    this.symbols_ = Array.from(symbolsArray);
    this.symbols_.reverse();
    return true;
  }

  decodeNextBit() {
    return this.decodeLeastSignificantBits32(1) === 1;
  }

  // nbits must be > 0 and <= 32.
  decodeLeastSignificantBits32(nbits) {
    const value = this.symbols_.pop();
    const discardedBits = 32 - nbits;
    return ((value << discardedBits) >>> discardedBits);
  }

  endDecoding() {
    this.clear();
  }

  clear() {
    this.symbols_ = [];
  }

}
