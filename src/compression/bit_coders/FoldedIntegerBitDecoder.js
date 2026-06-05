// compression/bit_coders/FoldedIntegerBitDecoder.js - ported from compression/bit_coders/folded_integer_bit_decoder.h

// C++ template parameterized by BitDecoder type; pass the class as a constructor
// arg, e.g. new FoldedBit32Decoder(DirectBitDecoder).
export class FoldedBit32Decoder {

  constructor(BitDecoderClass) {
    this.BitDecoderClass_ = BitDecoderClass;
    this.foldedNumberDecoders_ = new Array(32);
    for (let i = 0; i < 32; i++) {
      this.foldedNumberDecoders_[i] = new BitDecoderClass();
    }
    this.bitDecoder_ = new BitDecoderClass();
  }

  startDecoding(sourceBuffer) {
    for (let i = 0; i < 32; i++) {
      if (!this.foldedNumberDecoders_[i].startDecoding(sourceBuffer)) {
        return false;
      }
    }
    return this.bitDecoder_.startDecoding(sourceBuffer);
  }

  decodeNextBit() {
    return this.bitDecoder_.decodeNextBit();
  }

  // nbits must be > 0 and <= 32.
  decodeLeastSignificantBits32(nbits) {
    let result = 0;
    for (let i = 0; i < nbits; ++i) {
      const bit = this.foldedNumberDecoders_[i].decodeNextBit() ? 1 : 0;
      result = (result << 1) + bit;
    }
    return result;
  }

  endDecoding() {
    for (let i = 0; i < 32; i++) {
      this.foldedNumberDecoders_[i].endDecoding();
    }
    this.bitDecoder_.endDecoding();
  }

}
