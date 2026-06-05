// src/compression/attributes/prediction_schemes/MeshPredictionSchemeTexCoordsDecoder.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_tex_coords_decoder.h

import { MeshPredictionSchemeDecoder } from './MeshPredictionSchemeDecoder.js';
import { PredictionSchemeMethod } from '../../config/CompressionShared.js';
import { RAnsBitDecoder } from '../../bit_coders/RAnsBitDecoder.js';

const GEOMETRY_ATTRIBUTE_POSITION = 0;

/**
 * Decoder for UV coordinate predictions using mesh geometry. Not portable;
 * kept for backwards compatibility. See MeshPredictionSchemeTexCoordsPortableDecoder.
 */
class MeshPredictionSchemeTexCoordsDecoder extends MeshPredictionSchemeDecoder {

  constructor(attribute, transform, meshData, version) {
    super(attribute, transform, meshData);
    this._posAttribute = null;
    this._entryToPointIdMap = null;
    this._predictedValue = null;
    this._numComponents = 0;
    this._orientations = [];
    this._version = version;
  }

  getPredictionMethod() {
    return PredictionSchemeMethod.MESH_PREDICTION_TEX_COORDS_DEPRECATED;
  }

  isInitialized() {
    if (this._posAttribute === null) return false;
    if (!this._meshData.isInitialized()) return false;
    return true;
  }

  getNumParentAttributes() {
    return 1;
  }

  getParentAttributeType(i) {
    return GEOMETRY_ATTRIBUTE_POSITION;
  }

  setParentAttribute(att) {
    if (att === null) return false;
    if (att.attributeType !== GEOMETRY_ATTRIBUTE_POSITION) return false;
    if (att.numComponents !== 3) return false;
    this._posAttribute = att;
    return true;
  }

  decodePredictionData(buffer) {
    let numOrientations = 0;
    if (buffer.bitstreamVersion < 0x0202) {
      numOrientations = buffer.decodeUint32();
      if (numOrientations === undefined) return false;
    } else {
      numOrientations = buffer.decodeVarintUint32();
      if (numOrientations === undefined) return false;
    }
    if (numOrientations === 0) return false;
    if (numOrientations > this._meshData.cornerTable.numCorners()) return false;

    this._orientations = new Array(numOrientations);
    let lastOrientation = true;
    const decoder = new RAnsBitDecoder();
    if (!decoder.startDecoding(buffer)) return false;
    for (let i = 0; i < numOrientations; ++i) {
      if (!decoder.decodeNextBit()) {
        lastOrientation = !lastOrientation;
      }
      this._orientations[i] = lastOrientation;
    }
    decoder.endDecoding();
    return super.decodePredictionData(buffer);
  }

  computeOriginalValues(inCorr, outData, size, numComponents, entryToPointIdMap) {
    if (numComponents !== 2) return false;
    this._numComponents = numComponents;
    this._entryToPointIdMap = entryToPointIdMap;
    this._predictedValue = new Int32Array(numComponents);
    this._transform.init(numComponents);

    const cornerMapSize = this._meshData.dataToCornerMap.length;
    for (let p = 0; p < cornerMapSize; ++p) {
      const cornerId = this._meshData.dataToCornerMap[p];
      if (!this._computePredictedValue(cornerId, outData, p)) return false;

      const dstOffset = p * numComponents;
      this._transform.computeOriginalValue(
        this._predictedValue, 0, inCorr, dstOffset, outData, dstOffset
      );
    }
    return true;
  }

  _getPositionForEntryId(entryId) {
    const pointId = this._entryToPointIdMap[entryId];
    const pos = new Float32Array(3);
    this._posAttribute.convertValue(
      this._posAttribute.mappedIndex(pointId), pos
    );
    return pos;
  }

  _getTexCoordForEntryId(entryId, data) {
    const dataOffset = entryId * this._numComponents;
    return [data[dataOffset], data[dataOffset + 1]];
  }

  _computePredictedValue(cornerId, data, dataId) {
    const table = this._meshData.cornerTable;
    const nextCornerId = table.next(cornerId);
    const prevCornerId = table.previous(cornerId);

    const nextVertId = table.vertex(nextCornerId);
    const prevVertId = table.vertex(prevCornerId);

    const nextDataId = this._meshData.vertexToDataMap[nextVertId];
    const prevDataId = this._meshData.vertexToDataMap[prevVertId];

    if (prevDataId < dataId && nextDataId < dataId) {
      const nUV = this._getTexCoordForEntryId(nextDataId, data);
      const pUV = this._getTexCoordForEntryId(prevDataId, data);

      if (pUV[0] === nUV[0] && pUV[1] === nUV[1]) {
        // Degenerated UV triangle.
        for (let i = 0; i < 2; ++i) {
          const v = pUV[i];
          if (isNaN(v) || v > 0x7FFFFFFF || v < -0x80000000) {
            this._predictedValue[i] = -0x80000000;
          } else {
            this._predictedValue[i] = v | 0;
          }
        }
        return true;
      }

      const tipPos = this._getPositionForEntryId(dataId);
      const nextPos = this._getPositionForEntryId(nextDataId);
      const prevPos = this._getPositionForEntryId(prevDataId);

      const pn = [
        prevPos[0] - nextPos[0],
        prevPos[1] - nextPos[1],
        prevPos[2] - nextPos[2]
      ];
      const cn = [
        tipPos[0] - nextPos[0],
        tipPos[1] - nextPos[1],
        tipPos[2] - nextPos[2]
      ];

      const pnNorm2Squared = pn[0] * pn[0] + pn[1] * pn[1] + pn[2] * pn[2];

      let s, t;
      if (this._version < 0x0102 || pnNorm2Squared > 0) {
        s = (pn[0] * cn[0] + pn[1] * cn[1] + pn[2] * cn[2]) / pnNorm2Squared;
        // t = |cn - pn * s| / |pn|
        const diff = [cn[0] - pn[0] * s, cn[1] - pn[1] * s, cn[2] - pn[2] * s];
        const diffNorm2 = diff[0] * diff[0] + diff[1] * diff[1] + diff[2] * diff[2];
        t = Math.sqrt(diffNorm2 / pnNorm2Squared);
      } else {
        s = 0;
        t = 0;
      }

      const pnUV = [pUV[0] - nUV[0], pUV[1] - nUV[1]];
      const pnus = pnUV[0] * s + nUV[0];
      const pnut = pnUV[0] * t;
      const pnvs = pnUV[1] * s + nUV[1];
      const pnvt = pnUV[1] * t;

      if (this._orientations.length === 0) return false;

      const orientation = this._orientations[this._orientations.length - 1];
      this._orientations.length--;

      let predictedU, predictedV;
      if (orientation) {
        predictedU = pnus - pnvt;
        predictedV = pnvs + pnut;
      } else {
        predictedU = pnus + pnvt;
        predictedV = pnvs - pnut;
      }

      const u = Math.floor(predictedU + 0.5);
      if (isNaN(u) || u > 0x7FFFFFFF || u < -0x80000000) {
        this._predictedValue[0] = -0x80000000;
      } else {
        this._predictedValue[0] = u | 0;
      }
      const v = Math.floor(predictedV + 0.5);
      if (isNaN(v) || v > 0x7FFFFFFF || v < -0x80000000) {
        this._predictedValue[1] = -0x80000000;
      } else {
        this._predictedValue[1] = v | 0;
      }

      return true;
    }

    // Fallback to delta coding when a neighbor corner is unavailable.
    let dataOffset = 0;
    if (prevDataId < dataId) {
      dataOffset = prevDataId * this._numComponents;
    }
    if (nextDataId < dataId) {
      dataOffset = nextDataId * this._numComponents;
    } else {
      if (dataId > 0) {
        dataOffset = (dataId - 1) * this._numComponents;
      } else {
        for (let i = 0; i < this._numComponents; ++i) {
          this._predictedValue[i] = 0;
        }
        return true;
      }
    }
    for (let i = 0; i < this._numComponents; ++i) {
      this._predictedValue[i] = data[dataOffset + i];
    }
    return true;
  }

}

export { MeshPredictionSchemeTexCoordsDecoder };
