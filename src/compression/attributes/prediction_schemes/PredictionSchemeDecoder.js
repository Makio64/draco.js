// src/compression/attributes/prediction_schemes/PredictionSchemeDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoder.h

import { PredictionSchemeDecoderInterface } from './PredictionSchemeDecoderInterface.js';

/**
 * Base class for typed prediction scheme decoders. Provides basic access
 * to the encoded attribute and the supplied prediction transform.
 *
 * In C++ this is a template: PredictionSchemeDecoder<DataTypeT, TransformT>.
 * In JS, the transform is passed as a constructor parameter.
 */
class PredictionSchemeDecoder extends PredictionSchemeDecoderInterface {

  /**
   * @param {object} attribute - PointAttribute
   * @param {object} transform - A decoding transform instance
   */
  constructor(attribute, transform) {
    super();
    this._attribute = attribute;
    this._transform = transform;
  }

  /**
   * Decodes prediction data by delegating to the transform.
   * @param {DecoderBuffer} buffer
   * @returns {boolean}
   */
  decodePredictionData(buffer) {
    if (!this._transform.decodeTransformData(buffer)) {
      return false;
    }
    return true;
  }

  /** @returns {object} */
  getAttribute() {
    return this._attribute;
  }

  /** @returns {number} */
  getNumParentAttributes() {
    return 0;
  }

  /**
   * @param {number} i
   * @returns {number}
   */
  getParentAttributeType(i) {
    return -1; // INVALID
  }

  /**
   * @param {object} att
   * @returns {boolean}
   */
  setParentAttribute(att) {
    return false;
  }

  /** @returns {boolean} */
  areCorrectionsPositive() {
    return this._transform.areCorrectionsPositive();
  }

  /** @returns {number} */
  getTransformType() {
    return this._transform.getType();
  }

  /** @returns {object} */
  get attribute() {
    return this._attribute;
  }

  /** @returns {object} */
  get transform() {
    return this._transform;
  }

}

export { PredictionSchemeDecoder };
