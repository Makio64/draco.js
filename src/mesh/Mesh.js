// mesh/Mesh.js - ported from mesh/mesh.h/cc

import { PointCloud } from '../point_cloud/PointCloud.js';

// Mesh attribute element types.
export const MeshAttributeElementType = {
  MESH_VERTEX_ATTRIBUTE: 0,
  MESH_CORNER_ATTRIBUTE: 1,
  MESH_FACE_ATTRIBUTE: 2
};

class Mesh extends PointCloud {

  constructor() {

    super();
    // Faces stored as a flat Int32Array of point indices (3 per face) for cache
    // locality and to avoid an allocation per face. faces_[3*f + c] is the c-th
    // corner's point index of face f; corner index ci maps directly to faces_[ci].
    this.faces_ = new Int32Array(0);
    this.numFaces_ = 0;
    // Per-attribute data tracking element type.
    this.attribute_data_ = [];

  }

  _ensureFaceCapacity(numFaces) {

    if (this.faces_.length >= numFaces * 3) {
      return;
    }
    const grown = new Int32Array(numFaces * 3);
    grown.set(this.faces_);
    this.faces_ = grown;

  }

  addFace(face) {

    const f = this.numFaces_;
    this._ensureFaceCapacity(f + 1);
    const o = f * 3;
    this.faces_[o] = face[0];
    this.faces_[o + 1] = face[1];
    this.faces_[o + 2] = face[2];
    this.numFaces_ = f + 1;

  }

  setFace(faceId, face) {

    if (faceId >= this.numFaces_) {
      this._ensureFaceCapacity(faceId + 1);
      this.numFaces_ = faceId + 1;
    }
    const o = faceId * 3;
    this.faces_[o] = face[0];
    this.faces_[o + 1] = face[1];
    this.faces_[o + 2] = face[2];

  }

  // Like setFace() but takes the three corner point indices directly, avoiding
  // a temporary [v0, v1, v2] array allocation per face in the hot decode path.
  setFaceVertices(faceId, v0, v1, v2) {

    if (faceId >= this.numFaces_) {
      this._ensureFaceCapacity(faceId + 1);
      this.numFaces_ = faceId + 1;
    }
    const o = faceId * 3;
    this.faces_[o] = v0;
    this.faces_[o + 1] = v1;
    this.faces_[o + 2] = v2;

  }

  setNumFaces(numFaces) {

    this._ensureFaceCapacity(numFaces);
    this.numFaces_ = numFaces;

  }

  numFaces() {

    return this.numFaces_;

  }

  // Returns a fresh [v0, v1, v2] array (public API). Hot internal loops should
  // use faceVertex() to avoid the allocation.
  face(faceId) {

    const o = faceId * 3;
    return [this.faces_[o], this.faces_[o + 1], this.faces_[o + 2]];

  }

  // Returns a single corner's point index without allocating.
  faceVertex(faceId, corner) {

    return this.faces_[faceId * 3 + corner];

  }

  setAttribute(attId, pa) {

    super.setAttribute(attId, pa);
    while (this.attribute_data_.length <= attId) {
      this.attribute_data_.push({ elementType: MeshAttributeElementType.MESH_CORNER_ATTRIBUTE });
    }

  }

  deleteAttribute(attId) {

    super.deleteAttribute(attId);
    if (attId >= 0 && attId < this.attribute_data_.length) {
      this.attribute_data_.splice(attId, 1);
    }

  }

  getAttributeElementType(attId) {

    return this.attribute_data_[attId].elementType;

  }

  setAttributeElementType(attId, et) {

    this.attribute_data_[attId].elementType = et;

  }

  // Returns the point id for a corner index (plain integer). With the flat face
  // layout the corner index is a direct index into faces_.
  cornerToPointId(ci) {

    if (ci < 0) {
      return -1;
    }
    return this.faces_[ci];

  }

}

export { Mesh };
