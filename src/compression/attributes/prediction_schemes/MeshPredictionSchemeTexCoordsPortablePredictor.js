// src/compression/attributes/prediction_schemes/MeshPredictionSchemeTexCoordsPortablePredictor.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_tex_coords_portable_predictor.h

/**
 * Predictor functionality used for portable UV prediction by both encoder and
 * decoder. This implements only the decoder path (is_encoder_t = false).
 */
class MeshPredictionSchemeTexCoordsPortablePredictor {

  static NUM_COMPONENTS = 2;

  /**
   * @param {object} meshData - MeshPredictionSchemeData instance
   */
  constructor(meshData) {
    this._posAttribute = null;
    this._entryToPointIdMap = null;
    this._predictedValue = new Int32Array(2);
    this._orientations = [];
    this._meshData = meshData;
    this._tempPos = new Array(3);
    // Reusable scratch for the per-corner position fetches (hot loop).
    this._nextPos = new Array(3);
    this._prevPos = new Array(3);
    // Flat Int32 position cache indexed by data entry id (built once per
    // decode) so position fetches are array reads, not convertValue calls.
    this._posCache = null;
  }

  /**
   * @param {object} positionAttribute - PointAttribute for positions
   */
  setPositionAttribute(positionAttribute) {
    this._posAttribute = positionAttribute;
  }

  /**
   * @param {Array} map
   */
  setEntryToPointIdMap(map) {
    this._entryToPointIdMap = map;
  }

  /** @returns {boolean} */
  isInitialized() {
    return this._posAttribute !== null;
  }

  /** @returns {Int32Array} */
  get predictedValue() {
    return this._predictedValue;
  }

  /**
   * @param {number} numOrientations
   */
  resizeOrientations(numOrientations) {
    this._orientations = new Array(numOrientations);
  }

  /**
   * @param {number} i
   * @param {boolean} v
   */
  setOrientation(i, v) {
    this._orientations[i] = v;
  }

  /**
   * Precomputes the integer position of every data entry once so position
   * fetches in the hot loop are flat-array reads.
   * @param {number} numEntries
   */
  buildPositionCache(numEntries) {
    const cache = new Int32Array(numEntries * 3);
    const tmp = this._tempPos;
    const att = this._posAttribute;
    const map = this._entryToPointIdMap;
    for (let d = 0; d < numEntries; ++d) {
      att.convertValue(att.mappedIndex(map[d]), tmp);
      const o = d * 3;
      cache[o] = tmp[0];
      cache[o + 1] = tmp[1];
      cache[o + 2] = tmp[2];
    }
    this._posCache = cache;
  }

  /**
   * Returns the 3D position (as int64-safe values) for a given entry id.
   * @private
   */
  _getPositionForEntryId(entryId, out) {
    const c = this._posCache;
    const o = entryId * 3;
    out[0] = c[o];
    out[1] = c[o + 1];
    out[2] = c[o + 2];
  }

  /**
   * Computes predicted UV coordinates on a given corner (decoder path).
   * @param {number} cornerId
   * @param {Int32Array} data
   * @param {number} dataId
   * @returns {boolean}
   */
  computePredictedValue(cornerId, data, dataId) {
    const table = this._meshData.cornerTable;
    const nextCornerId = table.next(cornerId);
    const prevCornerId = table.previous(cornerId);

    const nextVertId = table.vertex(nextCornerId);
    const prevVertId = table.vertex(prevCornerId);

    const nextDataId = this._meshData.vertexToDataMap[nextVertId];
    const prevDataId = this._meshData.vertexToDataMap[prevVertId];

    if (prevDataId < dataId && nextDataId < dataId) {
      const nDataOff = nextDataId * 2;
      const pDataOff = prevDataId * 2;
      const nUV0 = data[nDataOff], nUV1 = data[nDataOff + 1];
      const pUV0 = data[pDataOff], pUV1 = data[pDataOff + 1];

      if (pUV0 === nUV0 && pUV1 === nUV1) {
        this._predictedValue[0] = pUV0;
        this._predictedValue[1] = pUV1;
        return true;
      }

      const tipPos = this._tempPos;
      const nextPos = this._nextPos;
      const prevPos = this._prevPos;
      this._getPositionForEntryId(dataId, tipPos);
      this._getPositionForEntryId(nextDataId, nextPos);
      this._getPositionForEntryId(prevDataId, prevPos);

      // pn = prevPos - nextPos
      const pn0 = prevPos[0] - nextPos[0];
      const pn1 = prevPos[1] - nextPos[1];
      const pn2 = prevPos[2] - nextPos[2];
      const pnNorm2Squared = pn0 * pn0 + pn1 * pn1 + pn2 * pn2;

      if (pnNorm2Squared !== 0) {
        const cn0 = tipPos[0] - nextPos[0];
        const cn1 = tipPos[1] - nextPos[1];
        const cn2 = tipPos[2] - nextPos[2];
        const cnDotPn = pn0 * cn0 + pn1 * cn1 + pn2 * cn2;

        const pnUV0 = pUV0 - nUV0;
        const pnUV1 = pUV1 - nUV1;

        const INT64_MAX = 9223372036854775807;
        const nUVAbsMax = Math.max(Math.abs(nUV0), Math.abs(nUV1));
        if (nUVAbsMax > INT64_MAX / pnNorm2Squared) {
          return false;
        }

        const pnUVAbsMax = Math.max(Math.abs(pnUV0), Math.abs(pnUV1));
        if (pnUVAbsMax > 0 && Math.abs(cnDotPn) > INT64_MAX / pnUVAbsMax) {
          return false;
        }

        // x_uv = nUV * pnNorm2Squared + cnDotPn * pnUV
        const xUV0 = nUV0 * pnNorm2Squared + cnDotPn * pnUV0;
        const xUV1 = nUV1 * pnNorm2Squared + cnDotPn * pnUV1;

        const pnAbsMax = Math.max(Math.abs(pn0), Math.abs(pn1), Math.abs(pn2));
        if (pnAbsMax > 0 && Math.abs(cnDotPn) > INT64_MAX / pnAbsMax) {
          return false;
        }

        // x_pos = nextPos + (cnDotPn * pn) / pnNorm2Squared
        const xPos0 = nextPos[0] + Math.trunc((cnDotPn * pn0) / pnNorm2Squared);
        const xPos1 = nextPos[1] + Math.trunc((cnDotPn * pn1) / pnNorm2Squared);
        const xPos2 = nextPos[2] + Math.trunc((cnDotPn * pn2) / pnNorm2Squared);
        const cx0 = tipPos[0] - xPos0;
        const cx1 = tipPos[1] - xPos1;
        const cx2 = tipPos[2] - xPos2;
        const cxNorm2Squared = cx0 * cx0 + cx1 * cx1 + cx2 * cx2;

        // Rotated pnUV by 90 degrees.
        const normSquared = Math.floor(Math.sqrt(cxNorm2Squared * pnNorm2Squared));
        const cxUV0 = pnUV1 * normSquared;
        const cxUV1 = -pnUV0 * normSquared;

        if (this._orientations.length === 0) {
          return false;
        }
        const orientation = this._orientations[this._orientations.length - 1];
        this._orientations.length--;

        if (orientation) {
          this._predictedValue[0] = Math.trunc((xUV0 + cxUV0) / pnNorm2Squared);
          this._predictedValue[1] = Math.trunc((xUV1 + cxUV1) / pnNorm2Squared);
        } else {
          this._predictedValue[0] = Math.trunc((xUV0 - cxUV0) / pnNorm2Squared);
          this._predictedValue[1] = Math.trunc((xUV1 - cxUV1) / pnNorm2Squared);
        }
        return true;
      }
    }

    // Fallback: delta coding.
    let dataOffset = 0;
    if (prevDataId < dataId) {
      dataOffset = prevDataId * 2;
    }
    if (nextDataId < dataId) {
      dataOffset = nextDataId * 2;
    } else {
      if (dataId > 0) {
        dataOffset = (dataId - 1) * 2;
      } else {
        this._predictedValue[0] = 0;
        this._predictedValue[1] = 0;
        return true;
      }
    }
    this._predictedValue[0] = data[dataOffset];
    this._predictedValue[1] = data[dataOffset + 1];
    return true;
  }

}

export { MeshPredictionSchemeTexCoordsPortablePredictor };
