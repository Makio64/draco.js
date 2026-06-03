// compression/mesh/traverser/MeshAttributeIndicesEncodingObserver.js
// Ported from compression/mesh/traverser/mesh_attribute_indices_encoding_observer.h

// Observer that records vertex visit order during mesh traversal.
// Used to generate encoding/decoding order for attribute values.
class MeshAttributeIndicesEncodingObserver {

  constructor(attConnectivity, mesh, sequencer, encodingData) {
    this._attConnectivity = attConnectivity;
    this._encodingData = encodingData;
    this._mesh = mesh;
    this._sequencer = sequencer;
  }

  onNewFaceVisited(/* face */) {}

  onNewVertexVisited(vertex, corner) {
    const faceIndex = (corner / 3) | 0;
    const localIndex = corner - faceIndex * 3;
    const pointId = this._mesh.faceVertex(faceIndex, localIndex);
    // Append the visited attribute to the encoding order.
    this._sequencer.addPointId(pointId);

    // Keep track of visited corners.
    this._encodingData.encodedAttributeValueIndexToCornerMap.push(corner);

    this._encodingData.vertexToEncodedAttributeValueIndexMap[vertex] =
      this._encodingData.numValues;

    this._encodingData.numValues++;
  }

}

export { MeshAttributeIndicesEncodingObserver };
