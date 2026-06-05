// metadata/MetadataDecoder.js - ported from metadata/metadata_decoder.h/cc
//
// The decoder does not surface metadata on the output geometry, so this only
// parses the metadata structure far enough to consume the exact bytes it
// occupies, keeping the rest of the bitstream aligned. (A full port that builds
// Metadata objects lives in the git history if the content is ever needed.)

import { decodeVarint } from '../core/VarintDecoding.js';

// Limit metadata nesting depth to avoid stack overflow.
const kMaxSubmetadataLevel = 1000;

class MetadataDecoder {

  constructor() {
    this.buffer_ = null;
  }

  // Skips the geometry metadata (per-attribute metadata followed by the
  // geometry-level metadata) in the buffer. Returns true on success.
  skipGeometryMetadata(inBuffer) {
    this.buffer_ = inBuffer;

    const numAttMetadata = decodeVarint(this.buffer_);
    if (numAttMetadata === undefined) {
      return false;
    }

    for (let i = 0; i < numAttMetadata; ++i) {
      // Attribute unique id, then the attribute's metadata block.
      if (decodeVarint(this.buffer_) === undefined) {
        return false;
      }
      if (!this._skipMetadata(0)) {
        return false;
      }
    }

    return this._skipMetadata(0);
  }

  // Reads (and discards) one metadata block: its key-value entries and any
  // nested sub-metadata. Mirrors the byte layout decoded by the C++
  // MetadataDecoder. Sub-blocks are read depth-first in stream order, matching
  // the reference's stack-based traversal.
  _skipMetadata(level) {
    if (level > kMaxSubmetadataLevel) {
      return false;
    }

    const numEntries = decodeVarint(this.buffer_);
    if (numEntries === undefined) {
      return false;
    }
    for (let i = 0; i < numEntries; ++i) {
      if (!this._skipEntry()) {
        return false;
      }
    }

    const numSubMetadata = decodeVarint(this.buffer_);
    if (numSubMetadata === undefined) {
      return false;
    }
    if (numSubMetadata > this.buffer_.remainingSize) {
      // The decoded number of metadata items is unreasonably high.
      return false;
    }
    for (let i = 0; i < numSubMetadata; ++i) {
      // Sub-metadata name, then the sub-metadata block.
      if (!this._skipName()) {
        return false;
      }
      if (!this._skipMetadata(level + 1)) {
        return false;
      }
    }

    return true;
  }

  // Skips a single key-value entry: name followed by a length-prefixed value.
  _skipEntry() {
    if (!this._skipName()) {
      return false;
    }
    const dataSize = decodeVarint(this.buffer_);
    if (dataSize === undefined || dataSize === 0) {
      return false;
    }
    if (dataSize > this.buffer_.remainingSize) {
      return false;
    }
    return this.buffer_.decodeBytes(dataSize) !== undefined;
  }

  // Skips a name (uint8 length prefix followed by that many bytes).
  _skipName() {
    const nameLen = this.buffer_.decodeUint8();
    if (nameLen === undefined) {
      return false;
    }
    if (nameLen === 0) {
      return true;
    }
    return this.buffer_.decodeBytes(nameLen) !== undefined;
  }

}

export { MetadataDecoder };
