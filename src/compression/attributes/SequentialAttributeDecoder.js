// compression/attributes/SequentialAttributeDecoder.js - ported from compression/attributes/sequential_attribute_decoder.h/cc


// A base class for decoding attribute values encoded by the
// SequentialAttributeEncoder.
class SequentialAttributeDecoder {

  constructor() {
    this._decoder = null;
    this._attribute = null;
    this._attributeId = -1;
    // Decoded portable attribute (after lossless decoding).
    this._portableAttribute = null;
  }

  init(decoder, attributeId) {
    this._decoder = decoder;
    this._attribute = decoder.pointCloud().attribute(attributeId);
    this._attributeId = attributeId;
    return true;
  }

  decodePortableAttribute(pointIds, buffer) {
    if (this._attribute.numComponents <= 0) {
      return false;
    }
    if (!this._attribute.reset(pointIds.length)) {
      return false;
    }
    return this.decodeValues(pointIds, buffer);
  }

  // No-op by default; subclasses with a transform override this.
  decodeDataNeededByPortableTransform(pointIds, buffer) {
    return true;
  }

  // No-op by default; subclasses with a transform override this.
  transformAttributeToOriginalFormat(pointIds) {
    return true;
  }

  getPortableAttribute() {
    // Copy point->value index mapping from the final attribute to the portable
    // one. Both maps are Uint32Array, so copy in one shot instead of per-entry
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

  initPredictionScheme(ps) {
    for (let i = 0; i < ps.getNumParentAttributes(); i++) {
      const attId = this._decoder.pointCloud().getNamedAttributeId(
        ps.getParentAttributeType(i)
      );
      if (attId === -1) {
        return false; // Requested attribute does not exist.
      }
      const pa = this._decoder.getPortableAttribute(attId);
      if (pa === null || !ps.setParentAttribute(pa)) {
        return false;
      }
    }
    return true;
  }

  // Decodes raw attribute values in their original format.
  decodeValues(pointIds, buffer) {
    const numValues = pointIds.length;
    const entrySize = this._attribute.byteStride;
    let outBytePos = 0;
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
