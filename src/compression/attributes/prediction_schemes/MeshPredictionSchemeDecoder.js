// src/compression/attributes/prediction_schemes/MeshPredictionSchemeDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_decoder.h

import { PredictionSchemeDecoder } from './PredictionSchemeDecoder.js';

/**
 * Base class for all mesh prediction scheme decoders that use mesh
 * connectivity data. Extends PredictionSchemeDecoder with mesh data access.
 *
 * In C++ this is templated on MeshDataT. In JS, meshData is a constructor param.
 */
class MeshPredictionSchemeDecoder extends PredictionSchemeDecoder {

  /**
   * @param {object} attribute - PointAttribute
   * @param {object} transform - A decoding transform instance
   * @param {object} meshData - MeshPredictionSchemeData instance
   */
  constructor(attribute, transform, meshData) {
    super(attribute, transform);
    this._meshData = meshData;
  }

}

export { MeshPredictionSchemeDecoder };
