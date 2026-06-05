// src/compression/attributes/prediction_schemes/PredictionSchemeDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoder.h

import { PredictionSchemeDecoderInterface } from './PredictionSchemeDecoderInterface.js';

/**
 * Base class for typed prediction scheme decoders. C++ templates this on
 * <DataTypeT, TransformT>; here the transform is a constructor param.
 */
class PredictionSchemeDecoder extends PredictionSchemeDecoderInterface {

  constructor(attribute, transform) {
    super();
    this._attribute = attribute;
    this._transform = transform;
  }

  decodePredictionData(buffer) {
    if (!this._transform.decodeTransformData(buffer)) {
      return false;
    }
    return true;
  }

  getNumParentAttributes() {
    return 0;
  }

  getParentAttributeType(i) {
    return -1; // INVALID
  }

  setParentAttribute(att) {
    return false;
  }

  areCorrectionsPositive() {
    return this._transform.areCorrectionsPositive();
  }

  get transform() {
    return this._transform;
  }

}

export { PredictionSchemeDecoder };
