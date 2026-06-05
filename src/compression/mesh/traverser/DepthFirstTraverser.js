// compression/mesh/traverser/DepthFirstTraverser.js
// Ported from compression/mesh/traverser/depth_first_traverser.h

const kInvalidCornerIndex = -1;
const kInvalidFaceIndex = -1;
const kInvalidVertexIndex = -1;

// Basic traverser that traverses a mesh in a DFS like fashion using the
// CornerTable data structure.
class DepthFirstTraverser {

  constructor() {
    this._cornerTable = null;
    this._observer = null;
    this._isFaceVisited = null;
    this._isVertexVisited = null;
    this._cornerTraversalStack = [];
    this._numVisitedFaces = 0;
    // Identifies the traversal order for the shared traversal cache
    // (MESH_TRAVERSAL_DEPTH_FIRST). See MeshTraversalSequencer.
    this._traversalMethodId = 0;
  }

  init(cornerTable, observer) {
    this._cornerTable = cornerTable;
    this._observer = observer;
    // Uint8Array (0/1) instead of Array(bool): these flags are read and written
    // on every corner of the hottest decode loop (traverseFromCorner).
    this._isFaceVisited = new Uint8Array(cornerTable.numFaces());
    this._isVertexVisited = new Uint8Array(cornerTable.numVertices());
    this._numVisitedFaces = 0;
    // Extract the corner table's connectivity as flat arrays once, so the
    // traversal reads them directly (via the monomorphic _* helpers below)
    // instead of dispatching through the corner table on every corner. The
    // corner table is one of two classes, so direct ct.vertex()/opposite()
    // calls in the hot loop are polymorphic and not inlined by the JIT.
    this._cornerToVertex = cornerTable.cornerToVertexArray();
    this._oppositeCorners = cornerTable.oppositeCornerArray();
    this._vertexLeftmost = cornerTable.vertexLeftmostCornerArray();
    this._numCorners = cornerTable.numCorners();
    this._cornerTraversalStack = new Int32Array(this._numCorners);
    this._hasOnNewFaceVisited = typeof observer.onNewFaceVisited === 'function';
  }

  cornerTable() {
    return this._cornerTable;
  }

  // Connectivity accessors operating on the extracted flat arrays. They mirror
  // the corner table's methods exactly but are monomorphic (the receiver is
  // always this traverser and the arrays are always typed), so the JIT inlines
  // them. next/previous are only ever called with a valid (>= 0) corner here.
  _next(c) {
    return (c % 3) === 2 ? c - 2 : c + 1;
  }
  _previous(c) {
    return (c % 3) === 0 ? c + 2 : c - 1;
  }
  _vertex(c) {
    return this._cornerToVertex[c];
  }
  _getRightCorner(c) {
    return this._oppositeCorners[this._next(c)];
  }
  _getLeftCorner(c) {
    return this._oppositeCorners[this._previous(c)];
  }
  _isOnBoundary(v) {
    const lc = this._vertexLeftmost[v];
    if (lc === undefined || lc < 0) return true;
    return this._oppositeCorners[this._next(lc)] < 0;
  }

  onTraversalStart() {}
  onTraversalEnd() {}

  traverseFromCorner(cornerId) {
    if (this._isFaceVisited[(cornerId / 3) | 0]) {
      return true; // Already traversed.
    }

    const isFaceVisited = this._isFaceVisited;
    const isVertexVisited = this._isVertexVisited;
    const observer = this._observer;
    const cornerToVertex = this._cornerToVertex;
    const oppositeCorners = this._oppositeCorners;
    const vertexLeftmost = this._vertexLeftmost;
    const stack = this._cornerTraversalStack;
    const hasOnNewFaceVisited = this._hasOnNewFaceVisited;
    let numVisitedFaces = this._numVisitedFaces;

    let stackSize = 0;
    stack[stackSize++] = cornerId;

    // For the first face, check the remaining corners as they may not be
    // processed yet.
    const nextCorner = (cornerId % 3) === 2 ? cornerId - 2 : cornerId + 1;
    const prevCorner = (cornerId % 3) === 0 ? cornerId + 2 : cornerId - 1;
    const nextVert = cornerToVertex[nextCorner];
    const prevVert = cornerToVertex[prevCorner];
    if (nextVert === kInvalidVertexIndex || prevVert === kInvalidVertexIndex) {
      return false;
    }
    if (!isVertexVisited[nextVert]) {
      isVertexVisited[nextVert] = true;
      observer.onNewVertexVisited(nextVert, nextCorner);
    }
    if (!isVertexVisited[prevVert]) {
      isVertexVisited[prevVert] = true;
      observer.onNewVertexVisited(prevVert, prevCorner);
    }

    // Start the actual traversal.
    while (stackSize > 0) {
      cornerId = stack[stackSize - 1];
      let faceId = (cornerId / 3) | 0;

      // Make sure the face hasn't been visited yet.
      if (cornerId === kInvalidCornerIndex || isFaceVisited[faceId]) {
        stackSize--;
        continue;
      }

      while (true) {
        isFaceVisited[faceId] = true;
        numVisitedFaces++;
        if (hasOnNewFaceVisited) {
          observer.onNewFaceVisited(faceId);
        }

        const vertId = cornerToVertex[cornerId];
        if (vertId === kInvalidVertexIndex) {
          return false;
        }
        if (!isVertexVisited[vertId]) {
          // Inlined isOnBoundary
          const lc = vertexLeftmost[vertId];
          let onBoundary = true;
          if (lc !== undefined && lc >= 0) {
            const nextLc = (lc % 3) === 2 ? lc - 2 : lc + 1;
            onBoundary = oppositeCorners[nextLc] < 0;
          }
          isVertexVisited[vertId] = true;
          observer.onNewVertexVisited(vertId, cornerId);
          if (!onBoundary) {
            // Get right corner: oppositeCorners[next(cornerId)]
            const nextCornerId = (cornerId % 3) === 2 ? cornerId - 2 : cornerId + 1;
            cornerId = oppositeCorners[nextCornerId];
            faceId = (cornerId / 3) | 0;
            continue;
          }
        }

        // The current vertex has been already visited or it was on a boundary.
        const nextCornerId = (cornerId % 3) === 2 ? cornerId - 2 : cornerId + 1;
        const rightCornerId = oppositeCorners[nextCornerId];

        const prevCornerId = (cornerId % 3) === 0 ? cornerId + 2 : cornerId - 1;
        const leftCornerId = oppositeCorners[prevCornerId];

        const rightFaceId = rightCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (rightCornerId / 3) | 0;
        const leftFaceId = leftCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (leftCornerId / 3) | 0;

        const isRightVisited = rightFaceId === kInvalidFaceIndex ||
          isFaceVisited[rightFaceId];
        const isLeftVisited = leftFaceId === kInvalidFaceIndex ||
          isFaceVisited[leftFaceId];

        if (isRightVisited) {
          if (isLeftVisited) {
            // Both neighboring faces are visited. End reached.
            stackSize--;
            break;
          } else {
            // Go to the left face.
            cornerId = leftCornerId;
            faceId = leftFaceId;
          }
        } else {
          if (isLeftVisited) {
            // Left face visited, go to the right one.
            cornerId = rightCornerId;
            faceId = rightFaceId;
          } else {
            // Both neighboring faces are unvisited, split the traversal.
            stack[stackSize - 1] = leftCornerId;
            stack[stackSize++] = rightCornerId;
            break;
          }
        }
      }
    }
    this._numVisitedFaces = numVisitedFaces;
    return true;
  }

}

export { DepthFirstTraverser };
