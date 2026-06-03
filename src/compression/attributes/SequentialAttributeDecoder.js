// compression/attributes/SequentialAttributeDecoder.js - ported from compression/attributes/sequential_attribute_decoder.h/cc

import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// A base class for decoding attribute values encoded by the
// SequentialAttributeEncoder.
class SequentialAttributeDecoder {

  constructor() {
    this._decoder = null;
    this._attribute = null;
    this._attributeId = -1;
    // Storage for decoded portable attribute (after lossless decoding).
    this._portableAttribute = null;
  }

  init(decoder, attributeId) {
    this._decoder = decoder;
    this._attribute = decoder.pointCloud().attribute(attributeId);
    this._attributeId = attributeId;
    return true;
  }

  // Initialization for a specific attribute. This can be used mostly for
  // standalone decoding of an attribute without a PointCloudDecoder.
  initializeStandalone(attribute) {
    this._attribute = attribute;
    this._attributeId = -1;
    return true;
  }

  // Performs lossless decoding of the portable attribute data.
  decodePortableAttribute(pointIds, buffer) {
    if (this._attribute.numComponents <= 0) {
      return false;
    }
    if (!this._attribute.reset(pointIds.length)) {
      return false;
    }
    return this.decodeValues(pointIds, buffer);
  }

  // Decodes any data needed to revert portable transform of the decoded attribute.
  decodeDataNeededByPortableTransform(pointIds, buffer) {
    // Default implementation does not apply any transform.
    return true;
  }

  // Reverts transformation performed by encoder.
  transformAttributeToOriginalFormat(pointIds) {
    // Default implementation does not apply any transform.
    return true;
  }

  getPortableAttribute() {
    // If needed, copy point to attribute value index mapping from the final
    // attribute to the portable attribute. Both maps are Uint32Array (the
    // source is explicit here), so copy in one shot instead of per-entry
    // mappedIndex()/setPointMapEntry() calls.
    if (!this._attribute.isMappingIdentity && this._portableAttribute &&
        this._portableAttribute.isMappingIdentity) {
      const size = this._attribute.indicesMapSize;
      this._portableAttribute.setExplicitMapping(size);
      const src = this._attribute.indicesMap;
      const dst = this._portableAttribute.indicesMap;
      if (src.length === size) {
        dst.set(src);
      } else {
        dst.set(src.subarray(0, size));
      }
    }
    return this._portableAttribute;
  }

  get attribute() {
    return this._attribute;
  }

  get attributeId() {
    return this._attributeId;
  }

  get decoder() {
    return this._decoder;
  }

  // Should be used to initialize newly created prediction scheme.
  initPredictionScheme(ps) {
    for (let i = 0; i < ps.getNumParentAttributes(); i++) {
      const attId = this._decoder.pointCloud().getNamedAttributeId(
        ps.getParentAttributeType(i)
      );
      if (attId === -1) {
        return false; // Requested attribute does not exist.
      }
      if (this._decoder.bitstreamVersion() < DRACO_BITSTREAM_VERSION(2, 0)) {
        if (!ps.setParentAttribute(this._decoder.pointCloud().attribute(attId))) {
          return false;
        }
      } else {
        const pa = this._decoder.getPortableAttribute(attId);
        if (pa === null || !ps.setParentAttribute(pa)) {
          return false;
        }
      }
    }
    return true;
  }

  // The actual implementation of the attribute decoding.
  decodeValues(pointIds, buffer) {
    const numValues = pointIds.length;
    const entrySize = this._attribute.byteStride;
    let outBytePos = 0;
    // Decode raw attribute values in their original format.
    for (let i = 0; i < numValues; i++) {
      const valueData = buffer.decodeBytes(entrySize);
      if (valueData === undefined) {
        return false;
      }
      this._attribute.buffer.write(outBytePos, valueData, entrySize);
      outBytePos += entrySize;
    }
    return true;
  }

  setPortableAttribute(att) {
    this._portableAttribute = att;
  }

  get portableAttribute() {
    return this._portableAttribute;
  }

}

export { SequentialAttributeDecoder };
