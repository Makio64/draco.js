// compression/bit_coders/SymbolBitDecoder.js - ported from compression/bit_coders/symbol_bit_decoder.h/cc

import { decodeSymbols } from '../entropy/SymbolDecoding.js';

// Class for decoding bits using the symbol entropy encoding. Wraps
// decodeSymbols(). Note that this uses a symbol-based encoding scheme for
// encoding bits.
export class SymbolBitDecoder {

  constructor() {
    this.symbols_ = []; // Array used as a stack (pop from back)
  }

  // Sets |sourceBuffer| as the buffer to decode bits from.
  startDecoding(sourceBuffer) {
    const size = sourceBuffer.decodeUint32();
    if (size === undefined) {
      return false;
    }

    const symbolsArray = new Uint32Array(size);
    if (!decodeSymbols(size, 1, sourceBuffer, symbolsArray)) {
      return false;
    }
    // Reverse so we can pop from the end (equivalent to C++ reverse + pop_back).
    this.symbols_ = Array.from(symbolsArray);
    this.symbols_.reverse();
    return true;
  }

  // Decode one bit. Returns true if the bit is a 1, otherwise false.
  decodeNextBit() {
    return this.decodeLeastSignificantBits32(1) === 1;
  }

  // Decode the next |nbits| and return the sequence. |nbits| must be > 0 and <= 32.
  decodeLeastSignificantBits32(nbits) {
    const value = this.symbols_.pop();
    // Mask to nbits.
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
