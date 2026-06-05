// src/compression/attributes/prediction_schemes/PredictionSchemeWrapDecodingTransform.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_wrap_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';

/**
 * PredictionSchemeWrapDecodingTransform unwraps values encoded with the
 * wrap encoding transform. Values are wrapped around min/max range.
 *
 * The wrapping works as follows:
 *   - Encoding stores correction X = O - P, wrapped around the data range N:
 *       X + N if X < -N/2
 *       X - N if X > N/2
 *   - Decoding unwraps: F = P + X, then:
 *       F + N if F < MIN
 *       F - N if F > MAX
 */
class PredictionSchemeWrapDecodingTransform {

  constructor() {
    this._numComponents = 0;
    this._minValue = 0;
    this._maxValue = 0;
    this._maxDif = 0;
  }

  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_WRAP;
  }

  init(numComponents) {
    this._numComponents = numComponents;
  }

  areCorrectionsPositive() {
    return false;
  }

  /**
   * Unwraps values that fall outside the [min, max] range.
   */
  computeOriginalValue(predictedVals, predictedOffset, corrVals, corrOffset,
    outOriginalVals, outOffset) {
    // Clamp to [min, max] then unwrap, fused into one pass with bounds in
    // locals and no scratch buffer.
    const nc = this._numComponents;
    const minValue = this._minValue;
    const maxValue = this._maxValue;
    const maxDif = this._maxDif;
    for (let i = 0; i < nc; ++i) {
      let pred = predictedVals[predictedOffset + i];
      if (pred > maxValue) {
        pred = maxValue;
      } else if (pred < minValue) {
        pred = minValue;
      }
      // 32-bit (| 0) arithmetic to avoid signed overflow.
      let orig = (pred + corrVals[corrOffset + i]) | 0;
      if (orig > maxValue) {
        orig -= maxDif;
      } else if (orig < minValue) {
        orig += maxDif;
      }
      outOriginalVals[outOffset + i] = orig;
    }
  }

  /** Decodes the min and max values from the buffer. */
  decodeTransformData(buffer) {
    const minValue = buffer.decodeInt32();
    if (minValue === undefined) return false;
    const maxValue = buffer.decodeInt32();
    if (maxValue === undefined) return false;
    if (minValue > maxValue) return false;

    this._minValue = minValue;
    this._maxValue = maxValue;
    return this._initCorrectionBounds();
  }

  _initCorrectionBounds() {
    const dif = this._maxValue - this._minValue;
    if (dif < 0 || dif >= 0x7FFFFFFF) {
      return false;
    }
    this._maxDif = 1 + dif;
    return true;
  }

}

export { PredictionSchemeWrapDecodingTransform };
