// compression/mesh/MeshEdgebreakerDecoderImpl.js - ported from mesh/mesh_edgebreaker_decoder_impl.h/cc

import { DecoderBuffer } from '../../core/DecoderBuffer.js';
import { decodeVarint } from '../../core/VarintDecoding.js';
import { DRACO_BITSTREAM_VERSION, MeshTraversalMethod } from '../config/CompressionShared.js';
import { MeshAttributeElementType } from '../../mesh/Mesh.js';
import {
  TOPOLOGY_C, TOPOLOGY_S, TOPOLOGY_L, TOPOLOGY_R, TOPOLOGY_E,
  TOPOLOGY_INVALID,
  TopologySplitEventData, HoleEventData,
  LEFT_FACE_EDGE, RIGHT_FACE_EDGE
} from './MeshEdgebreakerShared.js';
import { SequentialAttributeDecodersController } from '../attributes/SequentialAttributeDecodersController.js';
import { DepthFirstTraverser } from './traverser/DepthFirstTraverser.js';
import { MeshTraversalSequencer } from './traverser/MeshTraversalSequencer.js';
import { MeshAttributeIndicesEncodingObserver } from './traverser/MeshAttributeIndicesEncodingObserver.js';
import { MeshAttributeCornerTable } from '../../mesh/MeshAttributeCornerTable.js';

// Invalid index constant (used for corners and vertices).
const kInvalidCornerIndex = -1;
const kInvalidVertexIndex = -1;

// Implementation of the edgebreaker decoder that decodes data encoded with the
// MeshEdgebreakerEncoderImpl class. The implementation is based on the
// algorithm presented in Isenburg et al'02 "Spirale Reversi: Reverse
// decoding of the Edgebreaker encoding".
class MeshEdgebreakerDecoderImpl {

  constructor(TraversalDecoderClass) {
    this._decoder = null;
    this._cornerTable = null;
    this._cornerTraversalStack = [];
    this._vertexTraversalLength = [];
    this._topologySplitData = [];
    this._holeEventData = [];
    this._initFaceConfigurations = [];
    this._initCorners = [];
    this._lastSymbolId = -1;
    this._lastVertId = -1;
    this._lastFaceId = -1;
    this._visitedFaces = [];
    this._visitedVerts = [];
    this._isVertHole = [];
    this._numNewVertices = 0;
    this._newToParentVertexMap = new Map();
    this._numEncodedVertices = 0;
    this._processedCornerIds = [];
    this._processedConnectivityCorners = [];
    this._posEncodingData = new MeshAttributeIndicesEncodingData();
    this._posDataDecoderId = -1;
    // Per-decode cache of vertex-traversal results, keyed by corner table, so
    // multiple vertex-mapped attributes that share connectivity traverse once.
    this._vertexTraversalCache = new Map();
    this._attributeData = [];
    this._traversalDecoder = new TraversalDecoderClass();
  }

  init(decoder) {
    this._decoder = decoder;
    return true;
  }

  getDecoder() {
    return this._decoder;
  }

  getCornerTable() {
    return this._cornerTable;
  }

  getAttributeCornerTable(attId) {
    for (let i = 0; i < this._attributeData.length; ++i) {
      const decoderId = this._attributeData[i].decoderId;
      if (decoderId < 0 || decoderId >= this._decoder.numAttributesDecoders()) {
        continue;
      }
      const dec = this._decoder.attributesDecoder(decoderId);
      for (let j = 0; j < dec.getNumAttributes(); ++j) {
        if (dec.getAttributeId(j) === attId) {
          if (this._attributeData[i].isConnectivityUsed) {
            return this._attributeData[i].connectivityData;
          }
          return null;
        }
      }
    }
    return null;
  }

  getAttributeEncodingData(attId) {
    for (let i = 0; i < this._attributeData.length; ++i) {
      const decoderId = this._attributeData[i].decoderId;
      if (decoderId < 0 || decoderId >= this._decoder.numAttributesDecoders()) {
        continue;
      }
      const dec = this._decoder.attributesDecoder(decoderId);
      for (let j = 0; j < dec.getNumAttributes(); ++j) {
        if (dec.getAttributeId(j) === attId) {
          return this._attributeData[i].encodingData;
        }
      }
    }
    return this._posEncodingData;
  }

  createAttributesDecoder(attDecoderId) {
    const attDataId = this._decoder.buffer().decodeInt8();
    if (attDataId === undefined) return false;

    const decoderType = this._decoder.buffer().decodeUint8();
    if (decoderType === undefined) return false;

    if (attDataId >= 0) {
      if (attDataId >= this._attributeData.length) {
        return false; // Unexpected attribute data.
      }
      if (this._attributeData[attDataId].decoderId >= 0) {
        return false;
      }
      this._attributeData[attDataId].decoderId = attDecoderId;
    } else {
      if (this._posDataDecoderId >= 0) {
        return false;
      }
      this._posDataDecoderId = attDecoderId;
    }

    let traversalMethod = MeshTraversalMethod.MESH_TRAVERSAL_DEPTH_FIRST;
    if (this._decoder.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(1, 2)) {
      const traversalMethodEncoded = this._decoder.buffer().decodeUint8();
      if (traversalMethodEncoded === undefined) return false;
      if (traversalMethodEncoded >= MeshTraversalMethod.NUM_TRAVERSAL_METHODS) {
        return false;
      }
      traversalMethod = traversalMethodEncoded;
    }

    const mesh = this._decoder.mesh();
    let sequencer = null;

    if (decoderType === MeshAttributeElementType.MESH_VERTEX_ATTRIBUTE) {
      // Per-vertex attribute decoder.
      let encodingData = null;
      if (attDataId < 0) {
        encodingData = this._posEncodingData;
      } else {
        encodingData = this._attributeData[attDataId].encodingData;
        this._attributeData[attDataId].isConnectivityUsed = false;
      }

      // Create vertex traversal sequencer using the main corner table.
      sequencer = this._createVertexTraversalSequencer(
        encodingData, this._cornerTable, mesh);
    } else {
      // Per-corner attribute decoder.
      if (traversalMethod !== MeshTraversalMethod.MESH_TRAVERSAL_DEPTH_FIRST) {
        return false;
      }
      if (attDataId < 0) {
        return false;
      }

      const encodingData = this._attributeData[attDataId].encodingData;
      const attCornerTable = this._attributeData[attDataId].connectivityData;

      sequencer = this._createVertexTraversalSequencer(
        encodingData, attCornerTable, mesh);
    }

    if (!sequencer) {
      return false;
    }

    const attController = new SequentialAttributeDecodersController(sequencer);
    return this._decoder.setAttributesDecoder(attDecoderId, attController);
  }

  _createVertexTraversalSequencer(encodingData, cornerTable, mesh) {
    const traversalSequencer = new MeshTraversalSequencer(
      mesh, encodingData, this._vertexTraversalCache);

    const observer = new MeshAttributeIndicesEncodingObserver(
      cornerTable, mesh, traversalSequencer, encodingData);

    const traverser = new DepthFirstTraverser();
    traverser.init(cornerTable, observer);

    traversalSequencer.setTraverser(traverser);
    return traversalSequencer;
  }

  decodeConnectivity() {
    this._numNewVertices = 0;
    this._newToParentVertexMap.clear();

    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      let numNewVerts;
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
        numNewVerts = this._decoder.buffer().decodeUint32();
        if (numNewVerts === undefined) return false;
      } else {
        numNewVerts = decodeVarint(this._decoder.buffer());
        if (numNewVerts === undefined) return false;
      }
      this._numNewVertices = numNewVerts;
    }

    let numEncodedVertices;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numEncodedVertices = this._decoder.buffer().decodeUint32();
      if (numEncodedVertices === undefined) return false;
    } else {
      numEncodedVertices = decodeVarint(this._decoder.buffer());
      if (numEncodedVertices === undefined) return false;
    }
    this._numEncodedVertices = numEncodedVertices;

    let numFaces;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numFaces = this._decoder.buffer().decodeUint32();
      if (numFaces === undefined) return false;
    } else {
      numFaces = decodeVarint(this._decoder.buffer());
      if (numFaces === undefined) return false;
    }

    if (numFaces > 0x7FFFFFFF / 3) {
      return false; // Draco cannot handle this many faces.
    }
    if (this._numEncodedVertices > numFaces * 3) {
      return false; // There cannot be more vertices than 3 * numFaces.
    }

    // Minimum number of edges of the mesh assuming each edge is shared between
    // two faces.
    const minNumFaceEdges = Math.floor(3 * numFaces / 2);
    // Maximum number of edges that can exist between numEncodedVertices.
    const maxNumVertexEdges = this._numEncodedVertices *
      (this._numEncodedVertices - 1) / 2;
    if (maxNumVertexEdges < minNumFaceEdges) {
      return false; // Impossible to construct a manifold mesh.
    }

    const numAttributeData = this._decoder.buffer().decodeUint8();
    if (numAttributeData === undefined) return false;

    let numEncodedSymbols;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numEncodedSymbols = this._decoder.buffer().decodeUint32();
      if (numEncodedSymbols === undefined) return false;
    } else {
      numEncodedSymbols = decodeVarint(this._decoder.buffer());
      if (numEncodedSymbols === undefined) return false;
    }

    if (numFaces < numEncodedSymbols) {
      return false;
    }
    const maxEncodedFaces = numEncodedSymbols + Math.floor(numEncodedSymbols / 3);
    if (numFaces > maxEncodedFaces) {
      return false;
    }

    let numEncodedSplitSymbols;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numEncodedSplitSymbols = this._decoder.buffer().decodeUint32();
      if (numEncodedSplitSymbols === undefined) return false;
    } else {
      numEncodedSplitSymbols = decodeVarint(this._decoder.buffer());
      if (numEncodedSplitSymbols === undefined) return false;
    }

    if (numEncodedSplitSymbols > numEncodedSymbols) {
      return false; // Split symbols are a sub-set of all symbols.
    }
    // Decode topology (connectivity).
    this._vertexTraversalLength = [];
    this._cornerTable = new CornerTable();
    this._vertexTraversalCache = new Map();
    this._processedCornerIds = [];
    this._processedConnectivityCorners = [];
    this._topologySplitData = [];
    this._holeEventData = [];
    this._initFaceConfigurations = [];
    this._initCorners = [];

    this._lastSymbolId = -1;
    this._lastFaceId = -1;
    this._lastVertId = -1;

    this._attributeData = [];
    for (let i = 0; i < numAttributeData; ++i) {
      const ad = new AttributeData();
      ad.attributeSeamCorners = new Int32Array(numFaces * 3);
      ad.numSeamCorners = 0;
      this._attributeData.push(ad);
    }

    if (!this._cornerTable.reset(
      numFaces, this._numEncodedVertices + numEncodedSplitSymbols)) {
      return false;
    }

    // Start with all vertices marked as holes (boundaries). Uint8Array (1=hole)
    // keeps the per-vertex reads/writes in _decodeConnectivity and
    // _assignPointsToCorners monomorphic. The vertex count never exceeds this
    // length (enforced via maxNumVertices), so fixed-size storage is safe.
    this._isVertHole = new Uint8Array(
      this._numEncodedVertices + numEncodedSplitSymbols).fill(1);

    let topologySplitDecodedBytes = -1;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      let encodedConnectivitySize;
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
        encodedConnectivitySize = this._decoder.buffer().decodeUint32();
        if (encodedConnectivitySize === undefined) return false;
      } else {
        encodedConnectivitySize = decodeVarint(this._decoder.buffer());
        if (encodedConnectivitySize === undefined) return false;
      }
      if (encodedConnectivitySize === 0 ||
          encodedConnectivitySize > this._decoder.buffer().remainingSize) {
        return false;
      }
      const eventBuffer = new DecoderBuffer();
      const head = this._decoder.buffer().dataHead;
      eventBuffer.init(
        head.subarray(encodedConnectivitySize),
        this._decoder.buffer().remainingSize - encodedConnectivitySize,
        this._decoder.buffer().bitstreamVersion
      );
      topologySplitDecodedBytes =
        this._decodeHoleAndTopologySplitEvents(eventBuffer);
      if (topologySplitDecodedBytes === -1) {
        return false;
      }
    } else {
      if (this._decodeHoleAndTopologySplitEvents(this._decoder.buffer()) === -1) {
        return false;
      }
    }

    this._traversalDecoder.init(this);
    // Add one extra vertex for each split symbol.
    this._traversalDecoder.setNumEncodedVertices(
      this._numEncodedVertices + numEncodedSplitSymbols);
    this._traversalDecoder.setNumAttributeData(numAttributeData);

    const traversalEndBuffer = new DecoderBuffer();
    if (!this._traversalDecoder.start(traversalEndBuffer)) {
      return false;
    }

    const numConnectivityVerts = this._decodeConnectivity(numEncodedSymbols);
    if (numConnectivityVerts === -1) {
      return false;
    }

    // Set the main buffer to the end of the traversal.
    this._decoder.buffer().init(
      traversalEndBuffer.dataHead,
      traversalEndBuffer.remainingSize,
      this._decoder.buffer().bitstreamVersion
    );

    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
      // Skip topology split data that was already decoded earlier.
      this._decoder.buffer().advance(topologySplitDecodedBytes);
    }

    // Decode connectivity of non-position attributes.
    if (this._attributeData.length > 0) {
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 1)) {
        for (let ci = 0; ci < this._cornerTable.numCorners(); ci += 3) {
          if (!this._decodeAttributeConnectivitiesOnFaceLegacy(ci)) {
            return false;
          }
        }
      } else {
        for (let ci = 0; ci < this._cornerTable.numCorners(); ci += 3) {
          if (!this._decodeAttributeConnectivitiesOnFace(ci)) {
            return false;
          }
        }
      }
    }
    this._traversalDecoder.done();

    // Decode attribute connectivity.
    for (let i = 0; i < this._attributeData.length; ++i) {
      const connectivityData = this._attributeData[i].connectivityData;
      connectivityData.initEmpty(this._cornerTable);
      // Add all seams (indexed loop — avoids a for..of iterator per seam).
      const seamCorners = this._attributeData[i].attributeSeamCorners;
      const seamCount = this._attributeData[i].numSeamCorners;
      for (let s = 0; s < seamCount; ++s) {
        connectivityData.addSeamEdge(seamCorners[s]);
      }
      // Recompute vertices from the newly added seam edges.
      if (!connectivityData.recomputeVertices(null, null)) {
        return false;
      }
    }

    this._posEncodingData.init(this._cornerTable.numVertices());
    for (let i = 0; i < this._attributeData.length; ++i) {
      let attConnectivityVerts =
        this._attributeData[i].connectivityData.numVertices();
      if (attConnectivityVerts < this._cornerTable.numVertices()) {
        attConnectivityVerts = this._cornerTable.numVertices();
      }
      this._attributeData[i].encodingData.init(attConnectivityVerts);
    }
    if (!this._assignPointsToCorners(numConnectivityVerts)) {
      return false;
    }
    return true;
  }

  onAttributesDecoded() {
    return true;
  }

  // --- Private methods ---

  _isTopologySplit(encoderSymbolId, outResult) {
    if (this._topologySplitData.length === 0) {
      return false;
    }
    const back = this._topologySplitData[this._topologySplitData.length - 1];
    if (back.sourceSymbolId > encoderSymbolId) {
      // Something is wrong; the desired source symbol is greater than the
      // current encoder_symbol_id.
      outResult.encoderSplitSymbolId = -1;
      return true;
    }
    if (back.sourceSymbolId !== encoderSymbolId) {
      return false;
    }
    outResult.faceEdge = back.sourceEdge;
    outResult.encoderSplitSymbolId = back.splitSymbolId;
    // Remove the latest split event.
    this._topologySplitData.pop();
    return true;
  }

  _setOppositeCorners(corner0, corner1) {
    this._cornerTable.setOppositeCorner(corner0, corner1);
    this._cornerTable.setOppositeCorner(corner1, corner0);
  }

  _isFaceVisited(cornerId) {
    if (cornerId < 0) {
      return true; // Invalid corner signalizes that the face does not exist.
    }
    return this._visitedFaces[this._cornerTable.face(cornerId)];
  }

  _decodeConnectivity(numSymbols) {
    // Algorithm does the reverse decoding of the symbols encoded with the
    // edgebreaker method.
    const activeCornerStack = [];
    const topologySplitActiveCorners = new Map();
    const invalidVertices = [];
    const removeInvalidVertices = this._attributeData.length === 0;

    let maxNumVertices = this._isVertHole.length;
    let numFacesDecoded = 0;

    // Hoist the two corner-indexed flat arrays. Unlike _vertexCorners (grown by
    // addNewVertex), these are sized once in reset() and never reallocated, so
    // direct indexed writes are safe here and skip the per-call method dispatch
    // (mapCornerToVertex / setOppositeCorner) that showed up in profiles. All
    // corners written below are freshly constructed (>= 0), so no guard needed.
    const cornerToVertex = this._cornerTable._cornerToVertex;
    const oppositeCorners = this._cornerTable._oppositeCorners;
    const numCorners = this._cornerTable.numCorners();

    // Safe, inlinable arrow functions for CornerTable accessors that correctly
    // handle negative indices and avoid polymorphic method dispatch.
    const next = (c) => c < 0 ? -1 : ((c % 3 === 2) ? c - 2 : c + 1);
    const prev = (c) => c < 0 ? -1 : ((c % 3 === 0) ? c + 2 : c - 1);
    const vertex = (c) => (c < 0 || c >= numCorners) ? -1 : cornerToVertex[c];
    const opposite = (c) => (c < 0 || c >= numCorners) ? -1 : oppositeCorners[c];
    const leftMostCorner = (v) => (v < 0 || v >= this._cornerTable._vertexCorners.length) ? -1 : this._cornerTable._vertexCorners[v];

    const swingLeft = (c) => {
      const n = next(c);
      const o = opposite(n);
      return o < 0 ? -1 : next(o);
    };
    const swingRight = (c) => {
      const p = prev(c);
      const o = opposite(p);
      return o < 0 ? -1 : prev(o);
    };

    // Hot loop: the CornerTable accessors are inlined directly as flat-array
    // reads + corner-triple arithmetic rather than calling the next/prev/vertex/
    // opposite/leftMostCorner helpers above. _decodeConnectivity is far larger
    // than V8's inlining budget, so those helpers stayed real (monomorphic)
    // calls and cost ~15% of total decode in profiles. All corners reached here
    // during a well-formed stream are valid (>= 0, < numCorners) and the flat
    // arrays are -1-initialized, so the helpers' negative/bounds guards are not
    // needed -- except the swing-left boundary terminator, kept below. The
    // helpers remain defined for the (cold) post-loop cleanup code.
    const vc = this._cornerTable; // _vertexCorners is re-read (addNewVertex may realloc).
    for (let symbolId = 0; symbolId < numSymbols; ++symbolId) {
      const faceIndex = numFacesDecoded++;
      let checkTopologySplit = false;
      const symbol = this._traversalDecoder.decodeSymbol();

      if (symbol === TOPOLOGY_C) {
        // Create a new face between two edges on the open boundary.
        if (activeCornerStack.length === 0) return -1;

        const cornerA = activeCornerStack[activeCornerStack.length - 1];
        const nA = cornerA % 3 === 2 ? cornerA - 2 : cornerA + 1; // next(cornerA)
        const vertexX = cornerToVertex[nA];
        const lmcX = vc._vertexCorners[vertexX];                  // leftMostCorner(vertexX)
        const cornerB = lmcX % 3 === 2 ? lmcX - 2 : lmcX + 1;     // next(lmcX)

        if (cornerA === cornerB) return -1;
        if (oppositeCorners[cornerA] !== kInvalidCornerIndex ||
            oppositeCorners[cornerB] !== kInvalidCornerIndex) {
          return -1;
        }

        const corner = 3 * faceIndex;
        oppositeCorners[cornerA] = corner + 1;
        oppositeCorners[corner + 1] = cornerA;
        oppositeCorners[cornerB] = corner + 2;
        oppositeCorners[corner + 2] = cornerB;

        const pA = cornerA % 3 === 0 ? cornerA + 2 : cornerA - 1; // prev(cornerA)
        const nB = cornerB % 3 === 2 ? cornerB - 2 : cornerB + 1; // next(cornerB)
        const vertAPrev = cornerToVertex[pA];
        const vertBNext = cornerToVertex[nB];

        if (vertexX === vertAPrev || vertexX === vertBNext) return -1;

        cornerToVertex[corner] = vertexX;
        cornerToVertex[corner + 1] = vertBNext;
        cornerToVertex[corner + 2] = vertAPrev;
        vc._vertexCorners[vertAPrev] = corner + 2;
        // Mark the vertex x as interior.
        this._isVertHole[vertexX] = 0;
        activeCornerStack[activeCornerStack.length - 1] = corner;

      } else if (symbol === TOPOLOGY_R || symbol === TOPOLOGY_L) {
        // Create a new face extending from the open boundary edge.
        if (activeCornerStack.length === 0) return -1;

        const cornerA = activeCornerStack[activeCornerStack.length - 1];
        if (oppositeCorners[cornerA] !== kInvalidCornerIndex) {
          return -1;
        }

        const corner = 3 * faceIndex;
        let oppCorner, cornerL, cornerR;
        if (symbol === TOPOLOGY_R) {
          oppCorner = corner + 2;
          cornerL = corner + 1;
          cornerR = corner;
        } else {
          oppCorner = corner + 1;
          cornerL = corner;
          cornerR = corner + 2;
        }
        oppositeCorners[oppCorner] = cornerA;
        oppositeCorners[cornerA] = oppCorner;

        const newVertIndex = this._cornerTable.addNewVertex();
        if (this._cornerTable.numVertices() > maxNumVertices) return -1;

        cornerToVertex[oppCorner] = newVertIndex;
        vc._vertexCorners[newVertIndex] = oppCorner;

        const pA = cornerA % 3 === 0 ? cornerA + 2 : cornerA - 1; // prev(cornerA)
        const vertexR = cornerToVertex[pA];
        cornerToVertex[cornerR] = vertexR;
        vc._vertexCorners[vertexR] = cornerR;

        const nA = cornerA % 3 === 2 ? cornerA - 2 : cornerA + 1; // next(cornerA)
        cornerToVertex[cornerL] = cornerToVertex[nA];

        activeCornerStack[activeCornerStack.length - 1] = corner;
        checkTopologySplit = true;

      } else if (symbol === TOPOLOGY_S) {
        // Create a new face that merges two last active edges from the active
        // stack.
        if (activeCornerStack.length === 0) return -1;

        const cornerB = activeCornerStack[activeCornerStack.length - 1];
        activeCornerStack.pop();

        // Corner "a" can correspond to a normal active edge, or to an edge
        // created from the topology split event.
        const splitCorner = topologySplitActiveCorners.get(symbolId);
        if (splitCorner !== undefined) {
          activeCornerStack.push(splitCorner);
        }
        if (activeCornerStack.length === 0) return -1;

        const cornerA = activeCornerStack[activeCornerStack.length - 1];
        if (cornerA === cornerB) return -1;
        if (oppositeCorners[cornerA] !== kInvalidCornerIndex ||
            oppositeCorners[cornerB] !== kInvalidCornerIndex) {
          return -1;
        }

        const corner = 3 * faceIndex;
        oppositeCorners[cornerA] = corner + 2;
        oppositeCorners[corner + 2] = cornerA;
        oppositeCorners[cornerB] = corner + 1;
        oppositeCorners[corner + 1] = cornerB;

        const pA = cornerA % 3 === 0 ? cornerA + 2 : cornerA - 1; // prev(cornerA)
        const vertexP = cornerToVertex[pA];
        cornerToVertex[corner] = vertexP;
        const nA = cornerA % 3 === 2 ? cornerA - 2 : cornerA + 1; // next(cornerA)
        cornerToVertex[corner + 1] = cornerToVertex[nA];

        const pB = cornerB % 3 === 0 ? cornerB + 2 : cornerB - 1; // prev(cornerB)
        const vertBPrev = cornerToVertex[pB];
        cornerToVertex[corner + 2] = vertBPrev;
        vc._vertexCorners[vertBPrev] = corner + 2;

        let cornerN = cornerB % 3 === 2 ? cornerB - 2 : cornerB + 1; // next(cornerB)
        const vertexN = cornerToVertex[cornerN];
        this._traversalDecoder.mergeVertices(vertexP, vertexN);
        // Update the left most corner on the newly merged vertex.
        vc._vertexCorners[vertexP] = vc._vertexCorners[vertexN]; // leftMostCorner(vertexN)

        // Update vertex id at corner "n" and all corners connected to it
        // in the CCW direction. swingLeft(c) = next(opposite(next(c))).
        const firstCorner = cornerN;
        while (cornerN !== kInvalidCornerIndex) {
          cornerToVertex[cornerN] = vertexP;
          const sn = cornerN % 3 === 2 ? cornerN - 2 : cornerN + 1; // next(cornerN)
          const so = oppositeCorners[sn];                           // opposite(sn)
          cornerN = so < 0 ? -1 : (so % 3 === 2 ? so - 2 : so + 1); // next(so) or boundary
          if (cornerN === firstCorner) {
            // We reached the start again which should not happen for split
            // symbols.
            return -1;
          }
        }
        // Make the old vertex n isolated.
        vc._vertexCorners[vertexN] = -1;
        if (removeInvalidVertices) {
          invalidVertices.push(vertexN);
        }
        activeCornerStack[activeCornerStack.length - 1] = corner;

      } else if (symbol === TOPOLOGY_E) {
        const corner = 3 * faceIndex;
        const firstVertIndex = this._cornerTable.addNewVertex();
        // Create three new vertices at the corners of the new face.
        this._cornerTable.addNewVertex();
        this._cornerTable.addNewVertex();

        if (this._cornerTable.numVertices() > maxNumVertices) return -1;

        cornerToVertex[corner] = firstVertIndex;
        cornerToVertex[corner + 1] = firstVertIndex + 1;
        cornerToVertex[corner + 2] = firstVertIndex + 2;

        vc._vertexCorners[firstVertIndex] = corner;
        vc._vertexCorners[firstVertIndex + 1] = corner + 1;
        vc._vertexCorners[firstVertIndex + 2] = corner + 2;
        // Add the tip corner to the active stack.
        activeCornerStack.push(corner);
        checkTopologySplit = true;

      } else {
        // Unknown symbol.
        return -1;
      }

      // Inform the traversal decoder that a new corner has been reached.
      this._traversalDecoder.newActiveCornerReached(
        activeCornerStack[activeCornerStack.length - 1]);

      if (checkTopologySplit) {
        // Check for topology splits.
        const encoderSymbolId = numSymbols - symbolId - 1;
        const splitResult = { faceEdge: 0, encoderSplitSymbolId: 0 };
        while (this._isTopologySplit(encoderSymbolId, splitResult)) {
          if (splitResult.encoderSplitSymbolId < 0) return -1;

          const actTopCorner = activeCornerStack[activeCornerStack.length - 1];
          let newActiveCorner;
          if (splitResult.faceEdge === RIGHT_FACE_EDGE) {
            // next(actTopCorner)
            newActiveCorner = actTopCorner % 3 === 2 ? actTopCorner - 2 : actTopCorner + 1;
          } else {
            // prev(actTopCorner)
            newActiveCorner = actTopCorner % 3 === 0 ? actTopCorner + 2 : actTopCorner - 1;
          }
          // Convert the encoder split symbol id to decoder symbol id.
          const decoderSplitSymbolId =
            numSymbols - splitResult.encoderSplitSymbolId - 1;
          topologySplitActiveCorners.set(decoderSplitSymbolId, newActiveCorner);
        }
      }
    }

    if (this._cornerTable.numVertices() > maxNumVertices) {
      return -1;
    }

    // Decode start faces and connect them to the faces from the active stack.
    while (activeCornerStack.length > 0) {
      const corner = activeCornerStack[activeCornerStack.length - 1];
      activeCornerStack.pop();

      const interiorFace =
        this._traversalDecoder.decodeStartFaceConfiguration();

      if (interiorFace) {
        if (numFacesDecoded >= this._cornerTable.numFaces()) {
          return -1;
        }

        const cornerA = corner;
        const vertN = vertex(next(cornerA));
        const cornerB = next(leftMostCorner(vertN));

        const vertX = vertex(next(cornerB));
        const cornerC = next(leftMostCorner(vertX));

        if (corner === cornerB || corner === cornerC || cornerB === cornerC) {
          return -1;
        }
        if (opposite(corner) !== kInvalidCornerIndex ||
            opposite(cornerB) !== kInvalidCornerIndex ||
            opposite(cornerC) !== kInvalidCornerIndex) {
          return -1;
        }

        const vertP = vertex(prev(cornerC));

        const faceIndex = numFacesDecoded++;
        const newCorner = 3 * faceIndex;
        oppositeCorners[newCorner] = corner;
        oppositeCorners[corner] = newCorner;
        oppositeCorners[newCorner + 1] = cornerB;
        oppositeCorners[cornerB] = newCorner + 1;
        oppositeCorners[newCorner + 2] = cornerC;
        oppositeCorners[cornerC] = newCorner + 2;

        cornerToVertex[newCorner] = vertX;
        cornerToVertex[newCorner + 1] = vertP;
        cornerToVertex[newCorner + 2] = vertN;

        // Mark all three vertices as interior.
        this._isVertHole[vertX] = 0;
        this._isVertHole[vertP] = 0;
        this._isVertHole[vertN] = 0;

        this._initFaceConfigurations.push(true);
        this._initCorners.push(newCorner);
      } else {
        // The initial face wasn't interior.
        this._initFaceConfigurations.push(false);
        this._initCorners.push(corner);
      }
    }

    if (numFacesDecoded !== this._cornerTable.numFaces()) {
      return -1;
    }

    let numVertices = this._cornerTable.numVertices();
    // Remove invalid (isolated) vertices by swapping them with the last valid
    // vertex in the table. Matches C++ mesh_edgebreaker_decoder_impl.cc.
    // Must iterate forward (not reverse) to match C++ iteration order.
    for (let ivIdx = 0; ivIdx < invalidVertices.length; ++ivIdx) {
      const invalidVert = invalidVertices[ivIdx];
      // Find the last valid vertex.
      let srcVert = numVertices - 1;
      while (leftMostCorner(srcVert) === kInvalidCornerIndex) {
        srcVert = --numVertices - 1;
      }
      if (srcVert < invalidVert) continue;

      // Remap all corners mapped to srcVert to invalidVert.
      // Use VertexCornersIterator logic: swing left first, then swing right
      // on boundary to cover all corners around the vertex.
      const startCid = leftMostCorner(srcVert);
      let cid = startCid;
      let leftTraversal = true;
      while (cid !== kInvalidCornerIndex) {
        if (vertex(cid) !== srcVert) {
          return -1;
        }
        cornerToVertex[cid] = invalidVert;
        // Advance to the next corner around the vertex.
        if (leftTraversal) {
          const nextC = swingLeft(cid);
          if (nextC === kInvalidCornerIndex) {
            // Open boundary reached, switch to right traversal from start.
            leftTraversal = false;
            cid = swingRight(startCid);
          } else if (nextC === startCid) {
            // Closed fan, we're done.
            break;
          } else {
            cid = nextC;
          }
        } else {
          cid = swingRight(cid);
        }
      }

      this._cornerTable._vertexCorners[invalidVert] = leftMostCorner(srcVert);
      this._cornerTable._vertexCorners[srcVert] = -1;
      this._isVertHole[invalidVert] = this._isVertHole[srcVert];
      this._isVertHole[srcVert] = 0;
      numVertices--;
    }
    return numVertices;
  }

  _decodeHoleAndTopologySplitEvents(decoderBuffer) {
    let numTopologySplits;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numTopologySplits = decoderBuffer.decodeUint32();
      if (numTopologySplits === undefined) return -1;
    } else {
      numTopologySplits = decodeVarint(decoderBuffer);
      if (numTopologySplits === undefined) return -1;
    }

    if (numTopologySplits > 0) {
      if (numTopologySplits > this._cornerTable.numFaces()) {
        return -1;
      }
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(1, 2)) {
        for (let i = 0; i < numTopologySplits; ++i) {
          const eventData = new TopologySplitEventData();
          eventData.splitSymbolId = decoderBuffer.decodeUint32();
          if (eventData.splitSymbolId === undefined) return -1;
          eventData.sourceSymbolId = decoderBuffer.decodeUint32();
          if (eventData.sourceSymbolId === undefined) return -1;
          const edgeData = decoderBuffer.decodeUint8();
          if (edgeData === undefined) return -1;
          eventData.sourceEdge = edgeData & 1;
          this._topologySplitData.push(eventData);
        }
      } else {
        // Decode source and split symbol ids using delta and varint coding.
        let lastSourceSymbolId = 0;
        for (let i = 0; i < numTopologySplits; ++i) {
          const eventData = new TopologySplitEventData();
          const delta = decodeVarint(decoderBuffer);
          if (delta === undefined) return -1;
          eventData.sourceSymbolId = delta + lastSourceSymbolId;
          const delta2 = decodeVarint(decoderBuffer);
          if (delta2 === undefined) return -1;
          if (delta2 > eventData.sourceSymbolId) return -1;
          eventData.splitSymbolId = eventData.sourceSymbolId - delta2;
          lastSourceSymbolId = eventData.sourceSymbolId;
          this._topologySplitData.push(eventData);
        }
        // Split edges are decoded from a direct bit decoder.
        decoderBuffer.startBitDecoding(false);
        for (let i = 0; i < numTopologySplits; ++i) {
          let edgeData;
          if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 2)) {
            edgeData = decoderBuffer.decodeLeastSignificantBits32(2);
          } else {
            edgeData = decoderBuffer.decodeLeastSignificantBits32(1);
          }
          this._topologySplitData[i].sourceEdge = edgeData & 1;
        }
        decoderBuffer.endBitDecoding();
      }
    }

    let numHoleEvents = 0;
    if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
      numHoleEvents = decoderBuffer.decodeUint32();
      if (numHoleEvents === undefined) return -1;
    } else if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 1)) {
      numHoleEvents = decodeVarint(decoderBuffer);
      if (numHoleEvents === undefined) return -1;
    }

    if (numHoleEvents > 0) {
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(1, 2)) {
        for (let i = 0; i < numHoleEvents; ++i) {
          const symbolId = decoderBuffer.decodeInt32();
          if (symbolId === undefined) return -1;
          this._holeEventData.push(new HoleEventData(symbolId));
        }
      } else {
        let lastSymbolId = 0;
        for (let i = 0; i < numHoleEvents; ++i) {
          const delta = decodeVarint(decoderBuffer);
          if (delta === undefined) return -1;
          const eventData = new HoleEventData(delta + lastSymbolId);
          lastSymbolId = eventData.symbolId;
          this._holeEventData.push(eventData);
        }
      }
    }
    return decoderBuffer.decodedSize;
  }

  _decodeAttributeConnectivitiesOnFaceLegacy(corner) {
    const corners = [
      corner,
      this._cornerTable.next(corner),
      this._cornerTable.previous(corner)
    ];

    for (let c = 0; c < 3; ++c) {
      const oppCorner = this._cornerTable.opposite(corners[c]);
      if (oppCorner === kInvalidCornerIndex) {
        // Boundary edge is automatically an attribute seam.
        for (let i = 0; i < this._attributeData.length; ++i) {
          const ad = this._attributeData[i];
          ad.attributeSeamCorners[ad.numSeamCorners++] = corners[c];
        }
        continue;
      }
      for (let i = 0; i < this._attributeData.length; ++i) {
        const isSeam = this._traversalDecoder.decodeAttributeSeam(i);
        if (isSeam) {
          const ad = this._attributeData[i];
          ad.attributeSeamCorners[ad.numSeamCorners++] = corners[c];
        }
      }
    }
    return true;
  }

  _decodeAttributeConnectivitiesOnFace(corner) {
    // corner is the first corner of a face (a multiple of 3), so its three
    // corners are corner, corner+1, corner+2. Iterate them without allocating a
    // [corner, next, prev] array, reading opposites from the flat array.
    const ct = this._cornerTable;
    const oppositeCorners = ct.oppositeCornerArray();
    const attributeData = this._attributeData;
    const numAttrData = attributeData.length;
    const srcFaceId = (corner / 3) | 0;
    const faceBase = srcFaceId * 3;

    // Visit the face's corners in the order [corner, next(corner),
    // previous(corner)] to match the encoder's edge order exactly.
    const rem = corner - faceBase;
    const nextCorner = rem === 2 ? corner - 2 : corner + 1;
    const prevCorner = rem === 0 ? corner + 2 : corner - 1;

    const connectivityDecoders = this._traversalDecoder._attributeConnectivityDecoders;

    // --- cc = corner ---
    {
      const cc = corner;
      const oppCorner = oppositeCorners[cc];
      if (oppCorner === kInvalidCornerIndex) {
        for (let i = 0; i < numAttrData; ++i) {
          const ad = attributeData[i];
          ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
        }
      } else {
        const oppFaceId = (oppCorner / 3) | 0;
        if (oppFaceId >= srcFaceId) {
          for (let i = 0; i < numAttrData; ++i) {
            if (connectivityDecoders[i].decodeNextBit()) {
              const ad = attributeData[i];
              ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
            }
          }
        }
      }
    }

    // --- cc = nextCorner ---
    {
      const cc = nextCorner;
      const oppCorner = oppositeCorners[cc];
      if (oppCorner === kInvalidCornerIndex) {
        for (let i = 0; i < numAttrData; ++i) {
          const ad = attributeData[i];
          ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
        }
      } else {
        const oppFaceId = (oppCorner / 3) | 0;
        if (oppFaceId >= srcFaceId) {
          for (let i = 0; i < numAttrData; ++i) {
            if (connectivityDecoders[i].decodeNextBit()) {
              const ad = attributeData[i];
              ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
            }
          }
        }
      }
    }

    // --- cc = prevCorner ---
    {
      const cc = prevCorner;
      const oppCorner = oppositeCorners[cc];
      if (oppCorner === kInvalidCornerIndex) {
        for (let i = 0; i < numAttrData; ++i) {
          const ad = attributeData[i];
          ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
        }
      } else {
        const oppFaceId = (oppCorner / 3) | 0;
        if (oppFaceId >= srcFaceId) {
          for (let i = 0; i < numAttrData; ++i) {
            if (connectivityDecoders[i].decodeNextBit()) {
              const ad = attributeData[i];
              ad.attributeSeamCorners[ad.numSeamCorners++] = cc;
            }
          }
        }
      }
    }

    return true;
  }

  _assignPointsToCorners(numConnectivityVerts) {
    // Map between the existing and deduplicated point ids.
    this._decoder.mesh().setNumFaces(this._cornerTable.numFaces());

    const mesh = this._decoder.mesh();
    const ct = this._cornerTable;

    if (this._attributeData.length === 0) {
      // We have connectivity for position only. In this case all vertex indices
      // are equal to point indices.
      const numFaces = mesh.numFaces();
      const faces = mesh.faces_;
      const baseCornerToVertex = ct.cornerToVertexArray();
      for (let f = 0; f < numFaces; ++f) {
        const startCorner = 3 * f;
        faces[startCorner] = baseCornerToVertex[startCorner];
        faces[startCorner + 1] = baseCornerToVertex[startCorner + 1];
        faces[startCorner + 2] = baseCornerToVertex[startCorner + 2];
      }
      this._decoder.pointCloud().setNumPoints(numConnectivityVerts);
      return true;
    }

    // Else we need to deduplicate multiple attributes. pointToCornerMap is only
    // ever used for its length (the running point id), so track that as a
    // counter instead of growing an array.
    const attributeData = this._attributeData;
    const numAttrData = attributeData.length;
    let numPoints = 0;
    const cornerToPointMap = new Int32Array(ct.numCorners());

    const numVertices = ct.numVertices();
    // Flat connectivity for the inlined swingRight ring walk and per-attribute
    // vertex / seam lookups — avoids method dispatch on the (polymorphic) corner
    // tables for every corner of every vertex ring. swingRight(x) here is the
    // base table's: previous(baseOpp[previous(x)]).
    const vertexLeftmost = ct.vertexLeftmostCornerArray();
    const baseOpp = ct.oppositeCornerArray();
    const baseCornerToVertex = ct.cornerToVertexArray();
    const isVertHole = this._isVertHole;
    const attCornerToVertex = new Array(numAttrData);
    const attVertexOnSeam = new Array(numAttrData);
    for (let i = 0; i < numAttrData; ++i) {
      attCornerToVertex[i] = attributeData[i].connectivityData.cornerToVertexArray();
      attVertexOnSeam[i] = attributeData[i].connectivityData.vertexOnSeamArray();
    }

    // Precalculate a unified anyAttVertexOnSeam flag for each vertex
    const anyAttVertexOnSeam = new Uint8Array(numVertices);
    for (let i = 0; i < numAttrData; ++i) {
      const attSeam = attVertexOnSeam[i];
      for (let v = 0; v < numVertices; ++v) {
        if (attSeam[v]) {
          anyAttVertexOnSeam[v] = 1;
        }
      }
    }

    for (let v = 0; v < numVertices; ++v) {
      let c = vertexLeftmost[v];
      if (c === kInvalidCornerIndex) continue; // Isolated vertex.

      const isSeamVertex = isVertHole[v] || anyAttVertexOnSeam[v];

      if (!isSeamVertex) {
        // Fast path for non-seam vertices: all corners in this ring get the same point ID
        const initialC = c;
        const pointId = numPoints++;
        cornerToPointMap[initialC] = pointId;
        // swingRight (c = prev(baseOpp[prev(c)]))
        let rem = initialC % 3;
        let pv = rem === 0 ? initialC + 2 : initialC - 1;
        let opp = baseOpp[pv];
        c = opp < 0 ? kInvalidCornerIndex : ((opp % 3) === 0 ? opp + 2 : opp - 1);
        while (c !== kInvalidCornerIndex && c !== initialC) {
          cornerToPointMap[c] = pointId;
          rem = c % 3;
          pv = rem === 0 ? c + 2 : c - 1;
          opp = baseOpp[pv];
          c = opp < 0 ? kInvalidCornerIndex : ((opp % 3) === 0 ? opp + 2 : opp - 1);
        }
      } else {
        let deduplicationFirstCorner = c;
        let rem, pv, opp;
        if (!isVertHole[v]) {
          // Find the first seam (of any attribute).
          for (let i = 0; i < numAttrData; ++i) {
            if (!attVertexOnSeam[i][v]) {
              continue;
            }
            const attC2V = attCornerToVertex[i];
            const vertId = attC2V[c];
            rem = c % 3;
            pv = rem === 0 ? c + 2 : c - 1;
            opp = baseOpp[pv];
            let actC = opp < 0 ? kInvalidCornerIndex
              : ((opp % 3) === 0 ? opp + 2 : opp - 1);
            let seamFound = false;
            while (actC !== c) {
              if (actC === kInvalidCornerIndex) return false;
              if (attC2V[actC] !== vertId) {
                deduplicationFirstCorner = actC;
                seamFound = true;
                break;
              }
              rem = actC % 3;
              pv = rem === 0 ? actC + 2 : actC - 1;
              opp = baseOpp[pv];
              actC = opp < 0 ? kInvalidCornerIndex
                : ((opp % 3) === 0 ? opp + 2 : opp - 1);
            }
            if (seamFound) break;
          }
        }

        // Deduplication pass over corners on the processed vertex.
        c = deduplicationFirstCorner;
        cornerToPointMap[c] = numPoints++;
        // Traverse in CW direction (swingRight inlined).
        let prevC = c;
        rem = c % 3;
        pv = rem === 0 ? c + 2 : c - 1;
        opp = baseOpp[pv];
        c = opp < 0 ? kInvalidCornerIndex
          : ((opp % 3) === 0 ? opp + 2 : opp - 1);
        while (c !== kInvalidCornerIndex && c !== deduplicationFirstCorner) {
          let attributeSeam = false;
          for (let i = 0; i < numAttrData; ++i) {
            const attC2V = attCornerToVertex[i];
            if (attC2V[c] !== attC2V[prevC]) {
              attributeSeam = true;
              break;
            }
          }
          if (attributeSeam) {
            cornerToPointMap[c] = numPoints++;
          } else {
            cornerToPointMap[c] = cornerToPointMap[prevC];
          }
          prevC = c;
          rem = c % 3;
          pv = rem === 0 ? c + 2 : c - 1;
          opp = baseOpp[pv];
          c = opp < 0 ? kInvalidCornerIndex
            : ((opp % 3) === 0 ? opp + 2 : opp - 1);
        }
      }
    }

    // Add faces.
    const numFaces = mesh.numFaces();
    const faces = mesh.faces_;
    for (let f = 0; f < numFaces; ++f) {
      const o = 3 * f;
      faces[o] = cornerToPointMap[o];
      faces[o + 1] = cornerToPointMap[o + 1];
      faces[o + 2] = cornerToPointMap[o + 2];
    }
    this._decoder.pointCloud().setNumPoints(numPoints);
    return true;
  }

}

// Helper class for mesh attribute indices encoding data.
class MeshAttributeIndicesEncodingData {

  constructor() {
    this._vertexToEncodedAttributeValueIndexMap = new Int32Array(0);
    this._encodedAttributeValueIndexToCornerMap = new Int32Array(0);
    this._numValues = 0;
  }

  init(numVertices) {
    // Int32Array: written by index only (encoding observer) and read in every
    // parallelogram/texcoord/normal prediction lookup; values are non-negative
    // data indices, so keeping it typed keeps those hot reads monomorphic.
    this._vertexToEncodedAttributeValueIndexMap = new Int32Array(numVertices);
    this._encodedAttributeValueIndexToCornerMap = new Int32Array(numVertices);
    this._numValues = 0;
  }

  // Adopts a traversal result computed for an identical corner table, avoiding a
  // redundant full mesh traversal. These maps depend only on connectivity (not
  // on attribute values) and are read-only downstream, so they can be shared.
  adoptTraversalResult(vertexToEncodedMap, encodedToCornerMap, numValues) {
    this._vertexToEncodedAttributeValueIndexMap = vertexToEncodedMap;
    this._encodedAttributeValueIndexToCornerMap = encodedToCornerMap;
    this._numValues = numValues;
  }

  get vertexToEncodedAttributeValueIndexMap() {
    return this._vertexToEncodedAttributeValueIndexMap;
  }

  get encodedAttributeValueIndexToCornerMap() {
    return this._encodedAttributeValueIndexToCornerMap;
  }

  get numValues() {
    return this._numValues;
  }

  set numValues(val) {
    this._numValues = val;
  }

}

// Per-attribute data used by the edgebreaker decoder.
class AttributeData {

  constructor() {
    this.decoderId = -1;
    this.connectivityData = new MeshAttributeCornerTable();
    this.isConnectivityUsed = true;
    this.encodingData = new MeshAttributeIndicesEncodingData();
    this.attributeSeamCorners = new Int32Array(0);
    this.numSeamCorners = 0;
  }

}

// Minimal CornerTable class for use within the decoder.
// The full CornerTable would be in the mesh module.
class CornerTable {

  constructor() {
    this._numFaces = 0;
    this._numCorners = 0;
    this._numVertices = 0;
    // For each corner, the vertex it maps to.
    this._cornerToVertex = null;
    // For each corner, the opposite corner.
    this._oppositeCorners = null;
    // For each vertex, the left-most corner.
    this._vertexCorners = null;
  }

  reset(numFaces, numVertices) {
    this._numFaces = numFaces;
    this._numCorners = numFaces * 3;
    // C++ uses reserve() which allocates capacity but keeps size at 0.
    // Vertices are added incrementally via addNewVertex().
    this._numVertices = 0;
    this._cornerToVertex = new Int32Array(this._numCorners).fill(-1);
    this._oppositeCorners = new Int32Array(this._numCorners).fill(-1);
    this._vertexCorners = new Int32Array(numVertices).fill(-1);
    return true;
  }

  numFaces() {
    return this._numFaces;
  }

  numCorners() {
    return this._numCorners;
  }

  numVertices() {
    return this._numVertices;
  }

  // Corner traversal.
  next(corner) {
    if (corner < 0) return -1;
    const rem = corner - ((corner / 3) | 0) * 3;
    return rem === 2 ? corner - 2 : corner + 1;
  }

  previous(corner) {
    if (corner < 0) return -1;
    const rem = corner - ((corner / 3) | 0) * 3;
    return rem === 0 ? corner + 2 : corner - 1;
  }

  face(corner) {
    if (corner < 0) return -1;
    return (corner / 3) | 0;
  }

  // Get the vertex at a corner.
  vertex(corner) {
    if (corner < 0 || corner >= this._numCorners) return -1;
    return this._cornerToVertex[corner];
  }

  // Get the opposite corner.
  opposite(corner) {
    if (corner < 0 || corner >= this._numCorners) return -1;
    return this._oppositeCorners[corner];
  }

  // Get the left-most corner of a vertex.
  leftMostCorner(vertex) {
    if (vertex < 0 || vertex >= this._numVertices) return -1;
    return this._vertexCorners[vertex];
  }

  // --- Flat-array accessors used by DepthFirstTraverser to avoid polymorphic
  // per-corner method dispatch in the traversal hot loop. ---
  cornerToVertexArray() {
    return this._cornerToVertex;
  }
  oppositeCornerArray() {
    return this._oppositeCorners;
  }
  vertexLeftmostCornerArray() {
    return this._vertexCorners;
  }

  // Map a corner to a vertex.
  mapCornerToVertex(corner, vertex) {
    this._cornerToVertex[corner] = vertex;
  }

  // Set the opposite corner.
  setOppositeCorner(corner, opposite) {
    this._oppositeCorners[corner] = opposite;
  }

  // Set the left-most corner of a vertex.
  setLeftMostCorner(vertex, corner) {
    if (vertex >= 0 && vertex < this._numVertices) {
      this._vertexCorners[vertex] = corner;
    }
  }

  // Add a new vertex. Mirrors C++ CornerTable::AddNewVertex() which does
  // vertex_corners_.push_back(kInvalidCornerIndex).
  addNewVertex() {
    const newVertex = this._numVertices;
    this._numVertices++;
    // The array was pre-allocated with capacity in reset().
    // Extend only if we exceed that capacity.
    if (newVertex >= this._vertexCorners.length) {
      const newArr = new Int32Array(this._vertexCorners.length + 64);
      newArr.fill(-1);
      newArr.set(this._vertexCorners);
      this._vertexCorners = newArr;
    }
    this._vertexCorners[newVertex] = -1;
    return newVertex;
  }

  // Make a vertex isolated (no corners point to it).
  makeVertexIsolated(vertex) {
    if (vertex >= 0 && vertex < this._numVertices) {
      this._vertexCorners[vertex] = -1;
    }
  }

  // GetLeftCorner(c) = Opposite(Previous(c))
  getLeftCorner(corner) {
    if (corner < 0) return -1;
    return this.opposite(this.previous(corner));
  }

  // GetRightCorner(c) = Opposite(Next(c))
  getRightCorner(corner) {
    if (corner < 0) return -1;
    return this.opposite(this.next(corner));
  }

  isOnBoundary(vert) {
    const corner = this.leftMostCorner(vert);
    if (corner < 0) return true;
    return this.swingLeft(corner) < 0;
  }

  // Swing left: go to the next corner around a vertex in the CCW direction.
  // SwingLeft(c) = Next(Opposite(Next(c)))
  swingLeft(corner) {
    const nextCorner = this.next(corner);
    const oppCorner = this.opposite(nextCorner);
    if (oppCorner < 0) return -1;
    return this.next(oppCorner);
  }

  // Swing right: go to the next corner around a vertex in the CW direction.
  // SwingRight(c) = Previous(Opposite(Previous(c)))
  swingRight(corner) {
    const prevCorner = this.previous(corner);
    const oppCorner = this.opposite(prevCorner);
    if (oppCorner < 0) return -1;
    return this.previous(oppCorner);
  }

}

export {
  MeshEdgebreakerDecoderImpl,
  MeshAttributeIndicesEncodingData,
  AttributeData,
  CornerTable
};
