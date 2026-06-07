// compression/attributes/prediction_schemes/PredictionSchemeNormalOctahedronTransformBase.js - ported from compression/attributes/prediction_schemes/prediction_scheme_normal_octahedron_transform_base.h
//
// Shared base for the octahedral-normal decoding transforms. Holds the
// OctahedronToolBox and the quantization-bit plumbing; each subclass supplies
// its own getType / decodeTransformData / computeOriginalValue.

import { OctahedronToolBox } from '../NormalCompressionUtils.js';

class PredictionSchemeNormalOctahedronTransformBase {

  constructor() {
    this._octahedronToolBox = new OctahedronToolBox();
  }

  areCorrectionsPositive() {
    return true;
  }

  /** No-op to fulfill the transform interface. */
  init(numComponents) {}

  quantizationBits() {
    return this._octahedronToolBox.quantizationBits();
  }

  _setMaxQuantizedValue(maxQuantizedValue) {
    if (maxQuantizedValue % 2 === 0) return false;
    let q = 0;
    let v = maxQuantizedValue;
    while (v > 0) {
      v >>>= 1;
      q++;
    }
    return this._octahedronToolBox.setQuantizationBits(q);
  }

}

export { PredictionSchemeNormalOctahedronTransformBase };
