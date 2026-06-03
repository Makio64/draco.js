// src/compression/attributes/prediction_schemes/PredictionSchemeDecoderFactory.js
// Ported from draco/compression/attributes/prediction_schemes/prediction_scheme_decoder_factory.h

import { PredictionSchemeMethod, PredictionSchemeTransformType } from '../../config/CompressionShared.js';
import { PredictionSchemeDeltaDecoder } from './PredictionSchemeDeltaDecoder.js';
import { MeshPredictionSchemeParallelogramDecoder } from './MeshPredictionSchemeParallelogramDecoder.js';
import { MeshPredictionSchemeMultiParallelogramDecoder } from './MeshPredictionSchemeMultiParallelogramDecoder.js';
import { MeshPredictionSchemeConstrainedMultiParallelogramDecoder } from './MeshPredictionSchemeConstrainedMultiParallelogramDecoder.js';
import { MeshPredictionSchemeTexCoordsDecoder } from './MeshPredictionSchemeTexCoordsDecoder.js';
import { MeshPredictionSchemeTexCoordsPortableDecoder } from './MeshPredictionSchemeTexCoordsPortableDecoder.js';
import { MeshPredictionSchemeGeometricNormalDecoder } from './MeshPredictionSchemeGeometricNormalDecoder.js';
import { MeshPredictionSchemeData } from './MeshPredictionSchemeData.js';

/**
 * Creates a mesh prediction scheme decoder based on the prediction method.
 *
 * @param {number} method - PredictionSchemeMethod enum value
 * @param {object} attribute - PointAttribute
 * @param {object} transform - A decoding transform instance
 * @param {object} meshData - MeshPredictionSchemeData instance
 * @param {number} bitstreamVersion
 * @param {number} transformType - PredictionSchemeTransformType
 * @returns {object|null} Prediction scheme decoder or null
 */
function createMeshPredictionSchemeDecoder(method, attribute, transform,
  meshData, bitstreamVersion, transformType) {

  // For normal octahedron transforms, only geometric normal is supported.
  if (transformType === PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON_CANONICALIZED ||
      transformType === PredictionSchemeTransformType.PREDICTION_TRANSFORM_NORMAL_OCTAHEDRON) {
    if (method === PredictionSchemeMethod.MESH_PREDICTION_GEOMETRIC_NORMAL) {
      return new MeshPredictionSchemeGeometricNormalDecoder(
        attribute, transform, meshData
      );
    }
    return null;
  }

  // For wrap and delta transforms, any mesh prediction scheme is valid.
  switch (method) {
    case PredictionSchemeMethod.MESH_PREDICTION_PARALLELOGRAM:
      return new MeshPredictionSchemeParallelogramDecoder(
        attribute, transform, meshData
      );

    case PredictionSchemeMethod.MESH_PREDICTION_MULTI_PARALLELOGRAM:
      return new MeshPredictionSchemeMultiParallelogramDecoder(
        attribute, transform, meshData
      );

    case PredictionSchemeMethod.MESH_PREDICTION_CONSTRAINED_MULTI_PARALLELOGRAM:
      return new MeshPredictionSchemeConstrainedMultiParallelogramDecoder(
        attribute, transform, meshData
      );

    case PredictionSchemeMethod.MESH_PREDICTION_TEX_COORDS_DEPRECATED:
      return new MeshPredictionSchemeTexCoordsDecoder(
        attribute, transform, meshData, bitstreamVersion
      );

    case PredictionSchemeMethod.MESH_PREDICTION_TEX_COORDS_PORTABLE:
      return new MeshPredictionSchemeTexCoordsPortableDecoder(
        attribute, transform, meshData
      );

    case PredictionSchemeMethod.MESH_PREDICTION_GEOMETRIC_NORMAL:
      return new MeshPredictionSchemeGeometricNormalDecoder(
        attribute, transform, meshData
      );

    default:
      return null;
  }
}

/**
 * Creates a prediction scheme for a given decoder and given prediction method.
 * If the method specifies a mesh-based prediction and mesh data is available,
 * the appropriate mesh prediction scheme is created. Otherwise, a delta
 * decoder is returned as fallback.
 *
 * @param {number} method - PredictionSchemeMethod
 * @param {number} attId - attribute id
 * @param {object} decoder - PointCloudDecoder or MeshDecoder
 * @param {object} transform - A decoding transform instance
 * @returns {object|null} Prediction scheme decoder or null
 */
function createPredictionSchemeForDecoder(method, attId, decoder, transform) {
  if (method === PredictionSchemeMethod.PREDICTION_NONE) {
    return null;
  }

  const att = decoder.pointCloud().attribute(attId);

  if (decoder.getGeometryType() === 1) { // TRIANGULAR_MESH
    const meshDecoder = decoder;
    const cornerTable = meshDecoder.getCornerTable();
    const encodingData = meshDecoder.getAttributeEncodingData(attId);

    if (cornerTable !== null && encodingData !== null) {
      const meshData = new MeshPredictionSchemeData();
      const attCornerTable = meshDecoder.getAttributeCornerTable(attId);

      if (attCornerTable !== null) {
        meshData.set(
          meshDecoder.mesh(),
          attCornerTable,
          encodingData.encodedAttributeValueIndexToCornerMap,
          encodingData.vertexToEncodedAttributeValueIndexMap
        );
      } else {
        meshData.set(
          meshDecoder.mesh(),
          cornerTable,
          encodingData.encodedAttributeValueIndexToCornerMap,
          encodingData.vertexToEncodedAttributeValueIndexMap
        );
      }

      const transformType = transform.getType ? transform.getType() : -1;
      const ret = createMeshPredictionSchemeDecoder(
        method, att, transform, meshData,
        decoder.bitstreamVersion(), transformType
      );
      if (ret !== null) return ret;
    }
  }

  // Fallback: delta decoder.
  return new PredictionSchemeDeltaDecoder(att, transform);
}

export { createPredictionSchemeForDecoder };
