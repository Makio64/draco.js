// compression/attributes/prediction_schemes/MeshPredictionSchemeDecoder.js - ported from compression/attributes/prediction_schemes/mesh_prediction_scheme_decoder.h

import { PredictionSchemeDecoder } from './PredictionSchemeDecoder.js';

/**
 * Base class for mesh prediction scheme decoders that use mesh connectivity.
 * C++ templates this on MeshDataT; here meshData is a constructor param.
 */
class MeshPredictionSchemeDecoder extends PredictionSchemeDecoder {

  constructor(attribute, transform, meshData) {
    super(attribute, transform);
    this._meshData = meshData;
  }

}

export { MeshPredictionSchemeDecoder };
