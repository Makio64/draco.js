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

  /**
   * @returns {number}
   */
  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_WRAP;
  }

  /**
   * @param {number} numComponents
   */
  init(numComponents) {
    this._numComponents = numComponents;
  }

  /**
   * @returns {boolean}
   */
  areCorrectionsPositive() {
    return false;
  }

  /**
   * Computes the original value from predicted and correction values,
   * unwrapping values that fall outside the [min, max] range.
   * @param {Int32Array|TypedArray} predictedVals
   * @param {number} predictedOffset
   * @param {Int32Array|TypedArray} corrVals
   * @param {number} corrOffset
   * @param {Int32Array|TypedArray} outOriginalVals
   * @param {number} outOffset
   */
  computeOriginalValue(predictedVals, predictedOffset, corrVals, corrOffset,
    outOriginalVals, outOffset) {
    // Clamp and wrap fused into a single pass over the components, reading the
    // bounds from locals — clamps each predicted value to [min, max] and then
    // unwraps it, in one loop with no scratch buffer.
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
      // Perform the wrapping using 32-bit arithmetic to avoid signed overflow.
      let orig = (pred + corrVals[corrOffset + i]) | 0;
      if (orig > maxValue) {
        orig -= maxDif;
      } else if (orig < minValue) {
        orig += maxDif;
      }
      outOriginalVals[outOffset + i] = orig;
    }
  }

  /**
   * Decodes the transform-specific data (min and max values) from the buffer.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
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

  /**
   * @private
   * @returns {boolean}
   */
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
