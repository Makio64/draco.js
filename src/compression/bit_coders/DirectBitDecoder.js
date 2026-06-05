// compression/bit_coders/DirectBitDecoder.js - ported from compression/bit_coders/direct_bit_decoder.h/cc

// Reads a stream of bits packed into 32-bit words.
export class DirectBitDecoder {

  constructor() {
    this.bits_ = null; // Uint32Array
    this.pos_ = 0; // index into bits_
    this.numUsedBits_ = 0;
  }

  startDecoding(sourceBuffer) {
    this.clear();
    const sizeInBytes = sourceBuffer.decodeUint32();
    if (sizeInBytes === undefined) {
      return false;
    }
    // Must be > 0 and a multiple of 4: the encoder always writes 32-bit elements.
    if (sizeInBytes === 0 || (sizeInBytes & 0x3) !== 0) {
      return false;
    }
    if (sizeInBytes > sourceBuffer.remainingSize) {
      return false;
    }
    const num32BitElements = sizeInBytes / 4;
    this.bits_ = new Uint32Array(num32BitElements);
    for (let i = 0; i < num32BitElements; ++i) {
      this.bits_[i] = sourceBuffer.decodeUint32();
    }
    this.pos_ = 0;
    this.numUsedBits_ = 0;
    return true;
  }

  decodeNextBit() {
    const selector = 1 << (31 - this.numUsedBits_);
    if (this.pos_ >= this.bits_.length) {
      return false;
    }
    const bit = (this.bits_[this.pos_] & selector) !== 0;
    ++this.numUsedBits_;
    if (this.numUsedBits_ === 32) {
      ++this.pos_;
      this.numUsedBits_ = 0;
    }
    return bit;
  }

  // nbits must be > 0 and <= 32.
  decodeLeastSignificantBits32(nbits) {
    const remaining = 32 - this.numUsedBits_;
    if (nbits <= remaining) {
      if (this.pos_ >= this.bits_.length) {
        return undefined;
      }
      const value = ((this.bits_[this.pos_] << this.numUsedBits_) >>> 0) >>> (32 - nbits);
      this.numUsedBits_ += nbits;
      if (this.numUsedBits_ === 32) {
        ++this.pos_;
        this.numUsedBits_ = 0;
      }
      return value;
    } else {
      if (this.pos_ + 1 >= this.bits_.length) {
        return undefined;
      }
      const valueL = (this.bits_[this.pos_] << this.numUsedBits_) >>> 0;
      this.numUsedBits_ = nbits - remaining;
      ++this.pos_;
      const valueR = this.bits_[this.pos_] >>> (32 - this.numUsedBits_);
      const value = (valueL >>> (32 - this.numUsedBits_ - remaining)) | valueR;
      return value >>> 0;
    }
  }

  endDecoding() {}

  clear() {
    this.bits_ = null;
    this.numUsedBits_ = 0;
    this.pos_ = 0;
  }

}
