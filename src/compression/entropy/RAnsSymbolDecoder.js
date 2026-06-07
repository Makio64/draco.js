// compression/entropy/RAnsSymbolDecoder.js - ported from compression/entropy/rans_symbol_decoder.h

import { RAnsDecoder } from './ANSCoding.js';

// rANS precision for the given unique-symbols bit length, clamped to [12, 20].
function computeRAnsPrecisionFromUniqueSymbolsBitLength(symbolsBitLength) {
  const unclamped = Math.trunc((3 * symbolsBitLength) / 2);
  if (unclamped < 12) return 12;
  if (unclamped > 20) return 20;
  return unclamped;
}

// Decodes symbols using rANS. uniqueSymbolsBitLength must match the encoder's.
export class RAnsSymbolDecoder {

  constructor(uniqueSymbolsBitLength) {
    this.uniqueSymbolsBitLength_ = uniqueSymbolsBitLength;
    this.ransPrecisionBits_ = computeRAnsPrecisionFromUniqueSymbolsBitLength(uniqueSymbolsBitLength);
    this.ransPrecision_ = 1 << this.ransPrecisionBits_;
    this.probabilityTable_ = null;
    this.numSymbols_ = 0;
    this.ans_ = new RAnsDecoder(this.ransPrecisionBits_);
  }

  get numSymbols() {
    return this.numSymbols_;
  }

  // Initialize the decoder and decode the probability table.
  create(buffer) {
    if (buffer.bitstreamVersion === 0) {
      return false;
    }

    const val = buffer.decodeVarintUint32();
    if (val === undefined) return false;
    this.numSymbols_ = val;

    // Reject an unreasonably high symbol count.
    if (Math.trunc(this.numSymbols_ / 64) > buffer.remainingSize) {
      return false;
    }

    this.probabilityTable_ = new Uint32Array(this.numSymbols_);
    if (this.numSymbols_ === 0) {
      return true;
    }

    for (let i = 0; i < this.numSymbols_; ++i) {
      const probData = buffer.decodeUint8();
      if (probData === undefined) return false;

      // Low 2 bits = token: 0-2 is the extra-byte count, 3 is run-length of zero-prob entries.
      const token = probData & 3;
      if (token === 3) {
        const offset = probData >> 2;
        if (i + offset >= this.numSymbols_) {
          return false;
        }
        for (let j = 0; j < offset + 1; ++j) {
          this.probabilityTable_[i + j] = 0;
        }
        i += offset;
      } else {
        const extraBytes = token;
        let prob = probData >> 2;
        for (let b = 0; b < extraBytes; ++b) {
          const eb = buffer.decodeUint8();
          if (eb === undefined) return false;
          // Shift 8 bits per extra byte, minus 2 for the two token bits.
          prob |= eb << (8 * (b + 1) - 2);
        }
        this.probabilityTable_[i] = prob;
      }
    }

    if (!this.ans_.ransBuildLookUpTable(this.probabilityTable_, this.numSymbols_)) {
      return false;
    }
    return true;
  }

  // Starts decoding, advancing buffer past the encoded data.
  startDecoding(buffer) {
    const bytesEncoded = buffer.decodeVarintUint64();
    if (bytesEncoded === undefined) return false;

    if (bytesEncoded > buffer.remainingSize) {
      return false;
    }

    const dataHead = buffer.dataHead;
    buffer.advance(Number(bytesEncoded));
    if (this.ans_.readInit(dataHead, Number(bytesEncoded)) !== 0) {
      return false;
    }
    return true;
  }

  endDecoding() {
    this.ans_.readEnd();
  }

}
