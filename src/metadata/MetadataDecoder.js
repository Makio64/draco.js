// metadata/MetadataDecoder.js - ported from metadata/metadata_decoder.h/cc

import { Metadata } from './Metadata.js';
import { AttributeMetadata } from './GeometryMetadata.js';
import { decodeVarint } from '../core/VarintDecoding.js';

// Class for decoding the metadata.
class MetadataDecoder {

  constructor() {

    this.buffer_ = null;

  }

  // Decodes metadata from the buffer into the provided Metadata object.
  // Returns true on success.
  decodeMetadata(inBuffer, metadata) {

    if (!metadata) {
      return false;
    }

    this.buffer_ = inBuffer;
    return this._decodeMetadata(metadata);

  }

  // Decodes geometry metadata (including attribute metadata) from the buffer.
  // Returns true on success.
  decodeGeometryMetadata(inBuffer, metadata) {

    if (!metadata) {
      return false;
    }

    this.buffer_ = inBuffer;

    const numAttMetadata = decodeVarint(this.buffer_);
    if (numAttMetadata === undefined) {
      return false;
    }

    // Decode attribute metadata.
    for (let i = 0; i < numAttMetadata; ++i) {

      const attUniqueId = decodeVarint(this.buffer_);
      if (attUniqueId === undefined) {
        return false;
      }

      const attMetadata = new AttributeMetadata();
      attMetadata.setAttUniqueId(attUniqueId);

      if (!this._decodeMetadata(attMetadata)) {
        return false;
      }

      metadata.addAttributeMetadata(attMetadata);

    }

    return this._decodeMetadata(metadata);

  }

  // Internal iterative metadata decoder using a stack to avoid deep recursion.
  _decodeMetadata(metadata) {

    // Limit metadata nesting depth to avoid stack overflow.
    const kMaxSubmetadataLevel = 1000;

    const metadataStack = [];
    metadataStack.push({
      parentMetadata: null,
      decodedMetadata: metadata,
      level: 0
    });

    while (metadataStack.length > 0) {

      const mp = metadataStack.pop();
      let currentMetadata = mp.decodedMetadata;

      if (mp.parentMetadata !== null) {

        if (mp.level > kMaxSubmetadataLevel) {
          return false;
        }

        const subMetadataName = this._decodeName();
        if (subMetadataName === null) {
          return false;
        }

        const subMetadata = new Metadata();
        currentMetadata = subMetadata;

        if (!mp.parentMetadata.addSubMetadata(subMetadataName, subMetadata)) {
          return false;
        }

      }

      if (currentMetadata === null) {
        return false;
      }

      // Decode entries.
      const numEntries = decodeVarint(this.buffer_);
      if (numEntries === undefined) {
        return false;
      }

      for (let i = 0; i < numEntries; ++i) {

        if (!this._decodeEntry(currentMetadata)) {
          return false;
        }

      }

      // Decode sub-metadata count.
      const numSubMetadata = decodeVarint(this.buffer_);
      if (numSubMetadata === undefined) {
        return false;
      }

      if (numSubMetadata > this.buffer_.remainingSize) {
        // The decoded number of metadata items is unreasonably high.
        return false;
      }

      for (let i = 0; i < numSubMetadata; ++i) {

        metadataStack.push({
          parentMetadata: currentMetadata,
          decodedMetadata: null,
          level: mp.parentMetadata ? mp.level + 1 : mp.level
        });

      }

    }

    return true;

  }

  // Decodes a single key-value entry and adds it to the metadata.
  _decodeEntry(metadata) {

    const entryName = this._decodeName();
    if (entryName === null) {
      return false;
    }

    const dataSize = decodeVarint(this.buffer_);
    if (dataSize === undefined) {
      return false;
    }

    if (dataSize === 0) {
      return false;
    }

    if (dataSize > this.buffer_.remainingSize) {
      return false;
    }

    const entryValue = this.buffer_.decodeBytes(dataSize);
    if (entryValue === undefined) {
      return false;
    }

    metadata.addEntryBinary(entryName, entryValue);
    return true;

  }

  // Decodes a name string (uint8 length prefix followed by ASCII bytes).
  _decodeName() {

    const nameLen = this.buffer_.decodeUint8();
    if (nameLen === undefined) {
      return null;
    }

    if (nameLen === 0) {
      return '';
    }

    const nameBytes = this.buffer_.decodeBytes(nameLen);
    if (nameBytes === undefined) {
      return null;
    }

    const decoder = new TextDecoder();
    return decoder.decode(nameBytes);

  }

}

export { MetadataDecoder };
