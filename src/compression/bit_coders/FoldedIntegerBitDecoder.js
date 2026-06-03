// compression/bit_coders/FoldedIntegerBitDecoder.js - ported from compression/bit_coders/folded_integer_bit_decoder.h

// See FoldedBit32Encoder for more details.
// This is a template class parameterized by a BitDecoder type.
// Usage: new FoldedBit32Decoder(BitDecoderClass)
// where BitDecoderClass is a constructor for DirectBitDecoder, RAnsBitDecoder, etc.
export class FoldedBit32Decoder {

  constructor(BitDecoderClass) {
    this.BitDecoderClass_ = BitDecoderClass;
    this.foldedNumberDecoders_ = new Array(32);
    for (let i = 0; i < 32; i++) {
      this.foldedNumberDecoders_[i] = new BitDecoderClass();
    }
    this.bitDecoder_ = new BitDecoderClass();
  }

  // Sets |sourceBuffer| as the buffer to decode bits from.
  startDecoding(sourceBuffer) {
    for (let i = 0; i < 32; i++) {
      if (!this.foldedNumberDecoders_[i].startDecoding(sourceBuffer)) {
        return false;
      }
    }
    return this.bitDecoder_.startDecoding(sourceBuffer);
  }

  // Decode one bit. Returns true if the bit is a 1, otherwise false.
  decodeNextBit() {
    return this.bitDecoder_.decodeNextBit();
  }

  // Decode the next |nbits| and return the sequence. |nbits| must be > 0 and <= 32.
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
