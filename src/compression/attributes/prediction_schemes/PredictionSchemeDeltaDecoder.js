// src/compression/attributes/prediction_schemes/PredictionSchemeDeltaDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_delta_decoder.h

import { PredictionSchemeDecoder } from './PredictionSchemeDecoder.js';
import { PredictionSchemeMethod } from '../../config/CompressionShared.js';

/**
 * Decoder for values encoded with delta coding.
 * Delta prediction: value[i] = value[i-1] + correction[i].
 */
class PredictionSchemeDeltaDecoder extends PredictionSchemeDecoder {

  /**
   * @param {object} attribute - PointAttribute
   * @param {object} transform - A decoding transform instance
   */
  constructor(attribute, transform) {
    super(attribute, transform);
  }

  /**
   * @returns {number}
   */
  getPredictionMethod() {
    return PredictionSchemeMethod.PREDICTION_DIFFERENCE;
  }

  /**
   * @returns {boolean}
   */
  isInitialized() {
    return true;
  }

  /**
   * Computes original values from corrections using delta prediction.
   * @param {Int32Array|TypedArray} inCorr - correction values
   * @param {Int32Array|TypedArray} outData - output buffer for original values
   * @param {number} size - total number of values
   * @param {number} numComponents - components per entry
   * @param {Array|null} entryToPointIdMap
   * @returns {boolean}
   */
  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    this._transform.init(numComponents);

    // Decode the original value for the first element.
    // The "predicted" value for the first element is all zeros.
    const zeroVals = new Int32Array(numComponents);
    this._transform.computeOriginalValue(
      zeroVals, 0,
      inCorr, 0,
      outData, 0
    );

    // Decode data from the front: D(i) = D(i-1) + correction(i).
    for (let i = numComponents; i < size; i += numComponents) {
      this._transform.computeOriginalValue(
        outData, i - numComponents,
        inCorr, i,
        outData, i
      );
    }

    return true;
  }

}

export { PredictionSchemeDeltaDecoder };
