// src/compression/attributes/prediction_schemes/PredictionSchemeDecoderInterface.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoder_interface.h

import { PredictionSchemeMethod } from '../../config/CompressionShared.js';

/**
 * Abstract interface for all prediction schemes used during attribute decoding.
 * Subclasses should implement all methods.
 */
class PredictionSchemeDecoderInterface {

  /**
   * Returns the prediction method used by this scheme.
   * @returns {number} One of PredictionSchemeMethod values.
   */
  getPredictionMethod() {
    return PredictionSchemeMethod.PREDICTION_NONE;
  }

  /**
   * Returns true when the prediction scheme is fully initialized.
   * @returns {boolean}
   */
  isInitialized() {
    return false;
  }

  /**
   * Returns true if all correction values are guaranteed to be positive.
   * @returns {boolean}
   */
  areCorrectionsPositive() {
    return false;
  }

  /**
   * Returns the number of parent attributes needed for the prediction.
   * @returns {number}
   */
  getNumParentAttributes() {
    return 0;
  }

  /**
   * Returns the type of the parent attribute at index i.
   * @param {number} i
   * @returns {number}
   */
  getParentAttributeType(i) {
    return -1; // INVALID
  }

  /**
   * Sets the required parent attribute.
   * @param {object} att - PointAttribute
   * @returns {boolean}
   */
  setParentAttribute(att) {
    return false;
  }

  /**
   * Returns the transform type used by the prediction scheme.
   * @returns {number}
   */
  getTransformType() {
    return -1;
  }

  /**
   * Returns the encoded/decoded attribute.
   * @returns {object|null}
   */
  getAttribute() {
    return null;
  }

  /**
   * Decodes prediction scheme-specific data from the input buffer.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodePredictionData(buffer) {
    return true;
  }

  /**
   * Reverts changes made by the prediction scheme during encoding.
   * @param {Int32Array|TypedArray} inCorr - correction values
   * @param {Int32Array|TypedArray} outData - output original values
   * @param {number} size - total number of values
   * @param {number} numComponents - components per entry
   * @param {Array|null} entryToPointIdMap
   * @returns {boolean}
   */
  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    return false;
  }

}

export { PredictionSchemeDecoderInterface };
