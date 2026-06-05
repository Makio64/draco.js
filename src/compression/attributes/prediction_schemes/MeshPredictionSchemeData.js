// src/compression/attributes/prediction_schemes/MeshPredictionSchemeData.js
// Ported from draco/compression/attributes/prediction_schemes/mesh_prediction_scheme_data.h

/**
 * Stores connectivity data about the mesh and information about how it was
 * encoded/decoded.
 */
class MeshPredictionSchemeData {

  constructor() {
    this._mesh = null;
    this._cornerTable = null;
    this._vertexToDataMap = null;
    this._dataToCornerMap = null;
  }

  /**
   * Initializes the data with mesh connectivity information.
   * @param {object} mesh
   * @param {object} cornerTable
   * @param {Array|Int32Array} dataToCornerMap
   * @param {Array|Int32Array} vertexToDataMap
   */
  set(mesh, cornerTable, dataToCornerMap, vertexToDataMap) {
    this._mesh = mesh;
    this._cornerTable = cornerTable;
    this._dataToCornerMap = dataToCornerMap;
    this._vertexToDataMap = vertexToDataMap;
  }

  /** @returns {object} */
  get cornerTable() { return this._cornerTable; }

  /** @returns {Array|Int32Array} */
  get vertexToDataMap() { return this._vertexToDataMap; }

  /** @returns {Array|Int32Array} */
  get dataToCornerMap() { return this._dataToCornerMap; }

  /** @returns {boolean} */
  isInitialized() {
    return this._mesh !== null &&
           this._cornerTable !== null &&
           this._vertexToDataMap !== null &&
           this._dataToCornerMap !== null;
  }

}

export { MeshPredictionSchemeData };
