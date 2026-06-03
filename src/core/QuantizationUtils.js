// core/QuantizationUtils.js - ported from quantization_utils.h/cc
// (Decoder-only: the encoder-side Quantizer is not ported.)

export class Dequantizer {

  constructor() {
    this._delta = 1.0;
  }

  initFromRange(range, maxQuantizedValue) {
    if (maxQuantizedValue <= 0) return false;
    this._delta = range / maxQuantizedValue;
    return true;
  }

  initFromDelta(delta) {
    this._delta = delta;
    return true;
  }

  dequantizeFloat(val) {
    return val * this._delta;
  }

  get delta() {
    return this._delta;
  }

}
