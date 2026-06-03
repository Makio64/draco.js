// compression/mesh/traverser/MeshTraversalSequencer.js
// Ported from compression/mesh/traverser/mesh_traversal_sequencer.h

// Sequencer that generates point sequence in an order given by a deterministic
// traversal on the mesh surface.
class MeshTraversalSequencer {

  constructor(mesh, encodingData, traversalCache = null) {
    this._mesh = mesh;
    this._encodingData = encodingData;
    this._traverser = null;
    this._outPointIds = new Int32Array(0);
    this._numOutPoints = 0;
    // Optional per-decode cache, keyed by corner table, shared across the
    // attribute decoders of one mesh (see MeshEdgebreakerDecoderImpl).
    this._traversalCache = traversalCache;
  }

  setTraverser(traverser) {
    this._traverser = traverser;
  }

  // Called by SequentialAttributeDecodersController.
  generateSequence(/* outPointIds */) {
    // A traversal's output (point order + encoding maps) depends only on the
    // corner table's connectivity, not on the attribute being decoded. Meshes
    // with several vertex-mapped attributes share one corner table, so reuse a
    // previously computed result instead of repeating the O(faces) traversal.
    const cornerTable = this._traverser.cornerTable();
    if (this._traversalCache) {
      const cached = this._traversalCache.get(cornerTable);
      if (cached !== undefined) {
        this._outPointIds = cached.pointIds;
        this._encodingData.adoptTraversalResult(
          cached.vertexMap, cached.cornerMap, cached.numValues);
        return true;
      }
    }

    if (!this._generateSequenceInternal()) {
      return false;
    }

    if (this._encodingData.numValues < this._encodingData._encodedAttributeValueIndexToCornerMap.length) {
      this._encodingData._encodedAttributeValueIndexToCornerMap =
        this._encodingData._encodedAttributeValueIndexToCornerMap.subarray(0, this._encodingData.numValues);
    }

    if (this._traversalCache) {
      this._traversalCache.set(cornerTable, {
        pointIds: this._outPointIds,
        vertexMap: this._encodingData.vertexToEncodedAttributeValueIndexMap,
        cornerMap: this._encodingData.encodedAttributeValueIndexToCornerMap,
        numValues: this._encodingData.numValues,
      });
    }
    return true;
  }

  getOutputPointIds() {
    return this._outPointIds;
  }

  addPointId(pointId) {
    this._outPointIds[this._numOutPoints++] = pointId;
  }

  updatePointToAttributeIndexMapping(attribute) {
    const cornerTable = this._traverser.cornerTable();
    const numFaces = this._mesh.numFaces();
    const numPoints = this._mesh.numPoints();
    attribute.setExplicitMapping(numPoints);
    // Iterate corners directly over the flat connectivity arrays: the corner
    // table is one of two classes, so vertex()/faceVertex()/setPointMapEntry()
    // would all be polymorphic per corner. faces_[ci] is the corner's point id
    // and cornerToVertex[ci] its vertex; write straight into the indices map.
    const numCorners = numFaces * 3;
    const faces = this._mesh.faces_;
    const cornerToVertex = cornerTable.cornerToVertexArray();
    const vertexToAttEntry =
      this._encodingData.vertexToEncodedAttributeValueIndexMap;
    const indicesMap = attribute.indicesMap;
    for (let ci = 0; ci < numCorners; ++ci) {
      const vertId = cornerToVertex[ci];
      if (vertId < 0) {
        return false;
      }
      const attEntryId = vertexToAttEntry[vertId];
      const pointId = faces[ci];
      if (pointId >= numPoints || attEntryId >= numPoints) {
        return false;
      }
      indicesMap[pointId] = attEntryId;
    }
    return true;
  }

  _generateSequenceInternal() {
    // Preallocate.
    this._numOutPoints = 0;
    this._outPointIds = new Int32Array(this._mesh.numPoints());

    this._traverser.onTraversalStart();
    const numFaces = this._traverser.cornerTable().numFaces();
    for (let i = 0; i < numFaces; ++i) {
      if (!this._traverser.traverseFromCorner(3 * i)) {
        return false;
      }
    }
    this._traverser.onTraversalEnd();

    if (this._numOutPoints < this._outPointIds.length) {
      this._outPointIds = this._outPointIds.subarray(0, this._numOutPoints);
    }
    return true;
  }

}

export { MeshTraversalSequencer };
