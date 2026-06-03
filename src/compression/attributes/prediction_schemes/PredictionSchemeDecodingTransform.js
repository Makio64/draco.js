// src/compression/attributes/prediction_schemes/PredictionSchemeDecodingTransform.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoding_transform.h

import { PredictionSchemeTransformType } from '../../config/CompressionShared.js';

/**
 * PredictionSchemeDecodingTransform transforms predicted values and correction
 * values into the final original attribute values.
 * The default implementation is: original = predicted + correction.
 */
class PredictionSchemeDecodingTransform {

  constructor() {
    this._numComponents = 0;
  }

  /**
   * Initializes the transform with the number of components per entry.
   * @param {number} numComponents
   */
  init(numComponents) {
    this._numComponents = numComponents;
  }

  /**
   * Returns the transform type.
   * @returns {number}
   */
  getType() {
    return PredictionSchemeTransformType.PREDICTION_TRANSFORM_DELTA;
  }

  /**
   * Computes the original value from predicted and correction values.
   * Default: original[i] = predicted[i] + correction[i].
   * @param {Int32Array|TypedArray} predictedVals
   * @param {number} predictedOffset
   * @param {Int32Array|TypedArray} corrVals
   * @param {number} corrOffset
   * @param {Int32Array|TypedArray} outOriginalVals
   * @param {number} outOffset
   */
  computeOriginalValue(predictedVals, predictedOffset, corrVals, corrOffset,
    outOriginalVals, outOffset) {
    for (let i = 0; i < this._numComponents; ++i) {
      outOriginalVals[outOffset + i] =
        predictedVals[predictedOffset + i] + corrVals[corrOffset + i];
    }
  }

  /**
   * Decodes transform-specific data from the buffer. Called before init().
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodeTransformData(buffer) {
    return true;
  }

  /**
   * Returns true if all corrected values are guaranteed to be positive.
   * @returns {boolean}
   */
  areCorrectionsPositive() {
    return false;
  }

  /**
   * Returns the number of components.
   * @returns {number}
   */
  numComponents() {
    return this._numComponents;
  }

  /**
   * Quantization bits (dummy for interface compatibility).
   * @returns {number}
   */
  quantizationBits() {
    return -1;
  }

}

export { PredictionSchemeDecodingTransform };
