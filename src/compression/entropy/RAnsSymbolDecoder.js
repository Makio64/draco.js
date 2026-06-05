// compression/entropy/RAnsSymbolDecoder.js - ported from compression/entropy/rans_symbol_decoder.h

import { RAnsDecoder } from './ANSCoding.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// Computes the desired precision of the rANS method for the specified number of
// unique symbols (defined by their bit_length). Clamped to [12, 20].
function computeRAnsPrecisionFromUniqueSymbolsBitLength(symbolsBitLength) {
  const unclamped = Math.trunc((3 * symbolsBitLength) / 2);
  if (unclamped < 12) return 12;
  if (unclamped > 20) return 20;
  return unclamped;
}

// A helper class for decoding symbols using the rANS algorithm.
// |uniqueSymbolsBitLength| must be the same as the one used for the
// corresponding RAnsSymbolEncoder.
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
    // Check that the DecoderBuffer version is set.
    if (buffer.bitstreamVersion === 0) {
      return false;
    }

    // Decode the number of alphabet symbols.
    if (buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 0)) {
      this.numSymbols_ = buffer.decodeUint32();
      if (this.numSymbols_ === undefined) return false;
    } else {
      const val = buffer.decodeVarintUint32();
      if (val === undefined) return false;
      this.numSymbols_ = val;
    }

    // Check that decoded number of symbols is not unreasonably high.
    if (Math.trunc(this.numSymbols_ / 64) > buffer.remainingSize) {
      return false;
    }

    this.probabilityTable_ = new Uint32Array(this.numSymbols_);
    if (this.numSymbols_ === 0) {
      return true;
    }

    // Decode the probability table.
    for (let i = 0; i < this.numSymbols_; ++i) {
      const probData = buffer.decodeUint8();
      if (probData === undefined) return false;

      // Token is stored in the first two bits of the first byte.
      // Values 0-2 indicate the number of extra bytes.
      // Value 3 is a special symbol for run-length coding of zero probability entries.
      const token = probData & 3;
      if (token === 3) {
        const offset = probData >> 2;
        if (i + offset >= this.numSymbols_) {
          return false;
        }
        // Set zero probability for all symbols in the specified range.
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
          // Shift 8 bits for each extra byte and subtract 2 for the two first bits.
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

  // Starts decoding from the buffer. The buffer will be advanced past the
  // encoded data after this call.
  startDecoding(buffer) {
    let bytesEncoded;

    if (buffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 0)) {
      bytesEncoded = buffer.decodeUint64();
      if (bytesEncoded === undefined) return false;
    } else {
      bytesEncoded = buffer.decodeVarintUint64();
      if (bytesEncoded === undefined) return false;
    }

    if (bytesEncoded > buffer.remainingSize) {
      return false;
    }

    const dataHead = buffer.dataHead;
    // Advance the buffer past the rANS data.
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
