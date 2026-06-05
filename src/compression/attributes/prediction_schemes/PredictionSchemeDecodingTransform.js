// src/compression/attributes/prediction_schemes/PredictionSchemeDecodingTransform.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';

/**
 * Transforms predicted + correction values into the original attribute values.
 * Default: original = predicted + correction.
 */
class PredictionSchemeDecodingTransform {

  constructor() {
    this._numComponents = 0;
  }

  init(numComponents) {
    this._numComponents = numComponents;
  }

  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_DELTA;
  }

  computeOriginalValue(predictedVals, predictedOffset, corrVals, corrOffset,
    outOriginalVals, outOffset) {
    for (let i = 0; i < this._numComponents; ++i) {
      outOriginalVals[outOffset + i] =
        predictedVals[predictedOffset + i] + corrVals[corrOffset + i];
    }
  }

  /** Called before init(). */
  decodeTransformData(buffer) {
    return true;
  }

  areCorrectionsPositive() {
    return false;
  }

  numComponents() {
    return this._numComponents;
  }

  /** Dummy for interface compatibility; real transforms override. */
  quantizationBits() {
    return -1;
  }

}

export { PredictionSchemeDecodingTransform };
