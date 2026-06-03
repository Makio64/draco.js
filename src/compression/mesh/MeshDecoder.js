// compression/mesh/MeshDecoder.js - ported from mesh/mesh_decoder.h/cc

import { PointCloudDecoder } from '../point_cloud/PointCloudDecoder.js';
import { EncodedGeometryType } from '../config/CompressionShared.js';

// Class that reconstructs a 3D mesh from input data that was encoded by
// MeshEncoder.
class MeshDecoder extends PointCloudDecoder {

  constructor() {
    super();
    this._mesh = null;
  }

  getGeometryType() {
    return EncodedGeometryType.TRIANGULAR_MESH;
  }

  // The main entry point for mesh decoding.
  decodeMesh(options, inBuffer, outMesh) {
    this._mesh = outMesh;
    return this.decode(options, inBuffer, outMesh);
  }

  // Returns the base connectivity of the decoded mesh (or null if not initialized).
  getCornerTable() {
    return null;
  }

  // Returns the attribute connectivity data or null if it does not exist.
  getAttributeCornerTable(/* attId */) {
    return null;
  }

  // Returns the decoding data for a given attribute or null when the data
  // does not exist.
  getAttributeEncodingData(/* attId */) {
    return null;
  }

  mesh() {
    return this._mesh;
  }

  decodeGeometryData() {
    if (this._mesh === null) {
      return false;
    }
    if (!this.decodeConnectivity()) {
      return false;
    }
    return super.decodeGeometryData();
  }

  // Must be implemented by derived classes.
  decodeConnectivity() {
    return false;
  }

}

export { MeshDecoder };
