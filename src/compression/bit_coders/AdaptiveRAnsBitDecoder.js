// compression/bit_coders/AdaptiveRAnsBitDecoder.js - ported from compression/bit_coders/adaptive_rans_bit_decoder.h/cc

import { AnsDecoder, ansReadInit, ansReadEnd, rabsRead } from '../entropy/ANSCoding.js';

// Clamp the probability p to a uint8 in the range [1, 255].
function clampProbability(p) {
  let pInt = Math.trunc(p * 256 + 0.5);
  if (pInt === 256) pInt = 255;
  if (pInt === 0) pInt = 1;
  return pInt;
}

// Update the probability according to new incoming bit.
function updateProbability(oldP, bit) {
  const w = 128.0;
  const w0 = (w - 1.0) / w;
  const w1 = 1.0 / w;
  return oldP * w0 + (bit ? 0 : 1) * w1;
}

// Class for decoding a sequence of bits that were encoded with
// AdaptiveRAnsBitEncoder.
export class AdaptiveRAnsBitDecoder {

  constructor() {
    this.ansDecoder_ = new AnsDecoder();
    this.p0F_ = 0.5;
  }

  // Sets |sourceBuffer| as the buffer to decode bits from.
  startDecoding(sourceBuffer) {
    this.clear();

    const sizeInBytes = sourceBuffer.decodeUint32();
    if (sizeInBytes === undefined) {
      return false;
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
    const p0 = clampProbability(this.p0F_);
    const bit = rabsRead(this.ansDecoder_, p0) > 0;
    this.p0F_ = updateProbability(this.p0F_, bit);
    return bit;
  }

  // Decode the next |nbits| and return the sequence as uint32.
  // |nbits| must be > 0 and <= 32.
  decodeLeastSignificantBits32(nbits) {
    let result = 0;
    for (let i = 0; i < nbits; i++) {
      result = (result << 1) + (this.decodeNextBit() ? 1 : 0);
    }
    return result;
  }

  endDecoding() {}

  clear() {
    ansReadEnd(this.ansDecoder_);
    this.p0F_ = 0.5;
  }

}
