// compression/mesh/traverser/MaxPredictionDegreeTraverser.js
// Ported from compression/mesh/traverser/max_prediction_degree_traverser.h

const kInvalidCornerIndex = -1;
const kInvalidFaceIndex = -1;

// For efficiency the priority traversal uses buckets, where each bucket is a
// stack of available corners for a given priority. Corners with the highest
// priority (lowest bucket index) are always processed first.
const kMaxPriority = 3;

// Traverser that visits a mesh in an order implicitly guided by the prediction
// degree of the destination vertices ("Multi-way Geometry Encoding",
// Cohen-or et al. '02). Implements the same interface as DepthFirstTraverser so
// it is a drop-in alternative inside MeshTraversalSequencer. Used when the
// bitstream selects MESH_TRAVERSAL_PREDICTION_DEGREE (higher compression
// levels).
class MaxPredictionDegreeTraverser {

  constructor() {
    this._cornerTable = null;
    this._observer = null;
    this._isFaceVisited = null;
    this._isVertexVisited = null;
    this._numVisitedFaces = 0;
    // One stack (bucket) per priority level [0, kMaxPriority).
    this._traversalStacks = null;
    this._bestPriority = 0;
    // Prediction degree accumulated per vertex during traversal.
    this._predictionDegree = null;
    // Flat connectivity arrays (see DepthFirstTraverser for why).
    this._cornerToVertex = null;
    this._oppositeCorners = null;
    this._hasOnNewFaceVisited = false;
    // Identifies the traversal order for the shared traversal cache
    // (MESH_TRAVERSAL_PREDICTION_DEGREE). See MeshTraversalSequencer.
    this._traversalMethodId = 1;
  }

  init(cornerTable, observer) {
    this._cornerTable = cornerTable;
    this._observer = observer;
    this._isFaceVisited = new Uint8Array(cornerTable.numFaces());
    this._isVertexVisited = new Uint8Array(cornerTable.numVertices());
    this._numVisitedFaces = 0;
    this._cornerToVertex = cornerTable.cornerToVertexArray();
    this._oppositeCorners = cornerTable.oppositeCornerArray();
    this._hasOnNewFaceVisited = typeof observer.onNewFaceVisited === 'function';
    this._traversalStacks = [[], [], []]; // kMaxPriority buckets
    this._bestPriority = 0;
  }

  cornerTable() {
    return this._cornerTable;
  }

  // corner is always valid (>= 0) where these are used.
  _next(c) {
    return (c % 3) === 2 ? c - 2 : c + 1;
  }
  _previous(c) {
    return (c % 3) === 0 ? c + 2 : c - 1;
  }

  onTraversalStart() {
    // prediction_degree_.resize(num_vertices, 0)
    this._predictionDegree = new Int32Array(this._cornerTable.numVertices());
  }

  onTraversalEnd() {}

  // Returns the priority of traversing the edge leading to cornerId. Mutates
  // the prediction degree of the destination vertex.
  _computePriority(cornerId) {
    const vTip = this._cornerToVertex[cornerId];
    // Priority 0 when traversing to already visited vertices.
    let priority = 0;
    if (!this._isVertexVisited[vTip]) {
      const degree = ++this._predictionDegree[vTip];
      // Priority 1 when prediction degree > 1, otherwise 2.
      priority = degree > 1 ? 1 : 2;
    }
    if (priority >= kMaxPriority) {
      priority = kMaxPriority - 1;
    }
    return priority;
  }

  _addCornerToTraversalStack(ci, priority) {
    this._traversalStacks[priority].push(ci);
    // Keep the best available priority up to date.
    if (priority < this._bestPriority) {
      this._bestPriority = priority;
    }
  }

  // Retrieves the next available corner to traverse, processed by priority.
  // Returns kInvalidCornerIndex when no corner is available.
  _popNextCornerToTraverse() {
    for (let i = this._bestPriority; i < kMaxPriority; ++i) {
      const stack = this._traversalStacks[i];
      if (stack.length > 0) {
        const ret = stack.pop();
        this._bestPriority = i;
        return ret;
      }
    }
    return kInvalidCornerIndex;
  }

  traverseFromCorner(cornerId) {
    if (this._predictionDegree.length === 0) {
      return true;
    }

    const cornerToVertex = this._cornerToVertex;
    const oppositeCorners = this._oppositeCorners;
    const isFaceVisited = this._isFaceVisited;
    const isVertexVisited = this._isVertexVisited;
    const observer = this._observer;
    const hasOnNewFaceVisited = this._hasOnNewFaceVisited;

    // Traversal starts from |cornerId|; it follows the right or left
    // neighboring faces based on their prediction degree.
    this._traversalStacks[0].push(cornerId);
    this._bestPriority = 0;

    // For the first face, check the remaining corners as they may not be
    // processed yet.
    const firstNext = this._next(cornerId);
    const firstPrev = this._previous(cornerId);
    const nextVert = cornerToVertex[firstNext];
    const prevVert = cornerToVertex[firstPrev];
    if (!isVertexVisited[nextVert]) {
      isVertexVisited[nextVert] = 1;
      observer.onNewVertexVisited(nextVert, firstNext);
    }
    if (!isVertexVisited[prevVert]) {
      isVertexVisited[prevVert] = 1;
      observer.onNewVertexVisited(prevVert, firstPrev);
    }
    const tipVertex = cornerToVertex[cornerId];
    if (!isVertexVisited[tipVertex]) {
      isVertexVisited[tipVertex] = 1;
      observer.onNewVertexVisited(tipVertex, cornerId);
    }

    // Start the actual traversal.
    while ((cornerId = this._popNextCornerToTraverse()) !== kInvalidCornerIndex) {
      let faceId = (cornerId / 3) | 0;
      // Make sure the face hasn't been visited yet.
      if (isFaceVisited[faceId]) {
        continue;
      }

      while (true) {
        faceId = (cornerId / 3) | 0;
        isFaceVisited[faceId] = 1;
        this._numVisitedFaces++;
        if (hasOnNewFaceVisited) {
          observer.onNewFaceVisited(faceId);
        }

        // If the newly reached vertex hasn't been visited, mark and notify.
        const vertId = cornerToVertex[cornerId];
        if (!isVertexVisited[vertId]) {
          isVertexVisited[vertId] = 1;
          observer.onNewVertexVisited(vertId, cornerId);
        }

        // GetRightCorner = opposite(next(corner)); GetLeftCorner =
        // opposite(previous(corner)).
        const rightCornerId = oppositeCorners[this._next(cornerId)];
        const leftCornerId = oppositeCorners[this._previous(cornerId)];
        const rightFaceId = rightCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (rightCornerId / 3) | 0;
        const leftFaceId = leftCornerId === kInvalidCornerIndex
          ? kInvalidFaceIndex : (leftCornerId / 3) | 0;
        const isRightFaceVisited = rightFaceId === kInvalidFaceIndex ||
          isFaceVisited[rightFaceId] !== 0;
        const isLeftFaceVisited = leftFaceId === kInvalidFaceIndex ||
          isFaceVisited[leftFaceId] !== 0;

        if (!isLeftFaceVisited) {
          // We can go to the left face.
          const priority = this._computePriority(leftCornerId);
          if (isRightFaceVisited && priority <= this._bestPriority) {
            // Right face already visited and priority is best — the left face
            // is traversed next, no need to push it onto the stack.
            cornerId = leftCornerId;
            continue;
          } else {
            this._addCornerToTraversalStack(leftCornerId, priority);
          }
        }
        if (!isRightFaceVisited) {
          // Go to the right face.
          const priority = this._computePriority(rightCornerId);
          if (priority <= this._bestPriority) {
            // The right face is traversed next — no need to push it.
            cornerId = rightCornerId;
            continue;
          } else {
            this._addCornerToTraversalStack(rightCornerId, priority);
          }
        }

        // Couldn't proceed directly to the next corner.
        break;
      }
    }
    return true;
  }

}

export { MaxPredictionDegreeTraverser };
