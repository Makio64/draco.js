// compression/mesh/MeshEdgebreakerShared.js - ported from mesh/mesh_edgebreaker_shared.h

// Edgebreaker topology bit patterns.
// Variable length encoding for storing all possible topology configurations
// during traversal of mesh's surface.
export const TOPOLOGY_C = 0x0;  // 0
export const TOPOLOGY_S = 0x1;  // 1 0 0
export const TOPOLOGY_L = 0x3;  // 1 1 0
export const TOPOLOGY_R = 0x5;  // 1 0 1
export const TOPOLOGY_E = 0x7;  // 1 1 1
// Special symbol for the initial face that triggers encoding of a single
// connected component.
export const TOPOLOGY_INIT_FACE = 8;
// Special value used to indicate an invalid symbol.
export const TOPOLOGY_INVALID = 9;

// Edgebreaker symbol indices (zero-indexed).
export const EDGEBREAKER_SYMBOL_C = 0;
export const EDGEBREAKER_SYMBOL_S = 1;
export const EDGEBREAKER_SYMBOL_L = 2;
export const EDGEBREAKER_SYMBOL_R = 3;
export const EDGEBREAKER_SYMBOL_E = 4;
export const EDGEBREAKER_SYMBOL_INVALID = 5;

// Bit-length of symbols in the EdgebreakerTopologyBitPattern stored as a
// lookup table for faster indexing.
export const edgeBreakerTopologyBitPatternLength = [1, 3, 0, 3, 0, 3, 0, 3];

// Zero-indexed symbol id for each topology pattern.
export const edgeBreakerTopologyToSymbolId = [
  EDGEBREAKER_SYMBOL_C,       // 0 -> C
  EDGEBREAKER_SYMBOL_S,       // 1 -> S
  EDGEBREAKER_SYMBOL_INVALID, // 2 -> invalid
  EDGEBREAKER_SYMBOL_L,       // 3 -> L
  EDGEBREAKER_SYMBOL_INVALID, // 4 -> invalid
  EDGEBREAKER_SYMBOL_R,       // 5 -> R
  EDGEBREAKER_SYMBOL_INVALID, // 6 -> invalid
  EDGEBREAKER_SYMBOL_E        // 7 -> E
];

// Reverse mapping between symbol id and topology pattern symbol.
export const edgeBreakerSymbolToTopologyId = [
  TOPOLOGY_C, TOPOLOGY_S, TOPOLOGY_L, TOPOLOGY_R, TOPOLOGY_E
];

// Types of edges used during mesh traversal relative to the tip vertex of a
// visited triangle.
export const LEFT_FACE_EDGE = 0;
export const RIGHT_FACE_EDGE = 1;

// Struct used for storing data about a source face that connects to an
// already traversed face that was either the initial face or a face encoded
// with the topology S (split) symbol.
export class TopologySplitEventData {

  constructor() {
    this.splitSymbolId = 0;
    this.sourceSymbolId = 0;
    this.sourceEdge = 0; // 0 = LEFT_FACE_EDGE, 1 = RIGHT_FACE_EDGE
  }

}

// Hole event is used to store info about the first symbol that reached a
// vertex of a so far unvisited hole.
export class HoleEventData {

  constructor(symbolId) {
    this.symbolId = symbolId !== undefined ? symbolId : 0;
  }

}

// List of supported modes for valence based edgebreaker coding.
export const EDGEBREAKER_VALENCE_MODE_2_7 = 0;
