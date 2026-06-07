// core/QuantizationUtils.js - ported from quantization_utils.h/cc
// (Decoder-only: the encoder-side Quantizer is not ported.)

export class Dequantizer {

  constructor() {
    this._delta = 1.0;
  }

  initFromRange(range, maxQuantizedValue) {
    if (maxQuantizedValue <= 0) return false;
    // C++ computes delta_ as `range / static_cast<float>(max_quantized_value)` in float32.
    // JS double division is 1-2 ULP off the WASM decoder, so fround every step.
    this._delta = Math.fround(range / Math.fround(maxQuantizedValue));
    return true;
  }

  get delta() {
    return this._delta;
  }

}
