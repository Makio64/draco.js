// core/QuantizationUtils.js - ported from quantization_utils.h/cc
// (Decoder-only: the encoder-side Quantizer is not ported.)

export class Dequantizer {

  constructor() {
    this._delta = 1.0;
  }

  initFromRange(range, maxQuantizedValue) {
    if (maxQuantizedValue <= 0) return false;
    // Match Draco C++ exactly (quantization_utils.cc): delta_ is a float and is
    // computed as `range / static_cast<float>(max_quantized_value)` in float32.
    // Doing the division in JS double and storing the result verbatim yields a
    // value 1-2 ULP away from the WASM decoder for some attributes, so round
    // every step to float32 with Math.fround.
    this._delta = Math.fround(range / Math.fround(maxQuantizedValue));
    return true;
  }

  initFromDelta(delta) {
    this._delta = Math.fround(delta);
    return true;
  }

  // C++ DequantizeFloat(int32 value): `value * delta_` evaluated in float32
  // (the int is converted to float before the multiply).
  dequantizeFloat(val) {
    return Math.fround(Math.fround(val) * this._delta);
  }

  get delta() {
    return this._delta;
  }

}
