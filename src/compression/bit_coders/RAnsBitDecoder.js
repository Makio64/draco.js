// compression/bit_coders/RAnsBitDecoder.js - ported from compression/bit_coders/rans_bit_decoder.h/cc

import { AnsDecoder, ansReadInit, ansReadEnd, ANS_L_BASE, ANS_IO_BASE, ANS_P8_PRECISION } from '../entropy/ANSCoding.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// Class for decoding a sequence of bits that were encoded with RAnsBitEncoder.
export class RAnsBitDecoder {

  constructor() {
    this.ansDecoder_ = new AnsDecoder();
    this.probZero_ = 0;
    this.p_ = 0; // ANS_P8_PRECISION - probZero, precomputed
  }

  // Sets |sourceBuffer| as the buffer to decode bits from.
  // Returns false when the data is invalid.
  startDecoding(sourceBuffer) {
    this.clear();

    const probZero = sourceBuffer.decodeUint8();
    if (probZero === undefined) {
      return false;
    }
    this.probZero_ = probZero;
    this.p_ = ANS_P8_PRECISION - probZero;

    let sizeInBytes;
    if (sourceBuffer.bitstreamVersion < DRACO_BITSTREAM_VERSION(2, 2)) {
      sizeInBytes = sourceBuffer.decodeUint32();
      if (sizeInBytes === undefined) return false;
    } else {
      sizeInBytes = sourceBuffer.decodeVarintUint32();
      if (sizeInBytes === undefined) return false;
    }

    if (sizeInBytes > sourceBuffer.remainingSize) {
      return false;
    }

    const dataHead = sourceBuffer.dataHead;
    if (ansReadInit(this.ansDecoder_, dataHead, sizeInBytes) !== 0) {
      return false;
    }
    sourceBuffer.advance(sizeInBytes);
    return true;
  }

  // Decode one bit. Returns true if the bit is a 1, otherwise false.
  decodeNextBit() {
    const ans = this.ansDecoder_;
    const p = this.p_;
    if (ans.state < ANS_L_BASE && ans.bufOffset > 0) {
      ans.state = (ans.state << 8) | ans.buf[--ans.bufOffset];
    }
    const x = ans.state;
    const quot = x >>> 8;
    const rem = x & 0xFF;
    const xn = quot * p;
    if (rem < p) {
      ans.state = xn + rem;
      return true;
    }
    ans.state = x - xn - p;
    return false;
  }

  endDecoding() {}

  clear() {
    ansReadEnd(this.ansDecoder_);
  }

}
