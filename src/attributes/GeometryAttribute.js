// attributes/GeometryAttribute.js - ported from attributes/geometry_attribute.h/cc

import { DataType, dataTypeLength } from '../core/DracoTypes.js';
import { DataBuffer } from '../core/DataBuffer.js';

const Type = {
  INVALID: -1,
  POSITION: 0,
  NORMAL: 1,
  COLOR: 2,
  TEX_COORD: 3,
  GENERIC: 4,
  NAMED_ATTRIBUTES_COUNT: 5
};

class GeometryAttribute {

  constructor() {
    this._buffer = null;
    this._numComponents = 1;
    this._dataType = DataType.FLOAT32;
    this._normalized = false;
    this._byteStride = 0;
    this._byteOffset = 0;
    this._attributeType = Type.INVALID;
    this._uniqueId = 0;
  }

  init(attributeType, buffer, numComponents, dataType, normalized, byteStride, byteOffset) {
    this._buffer = buffer;
    this._numComponents = numComponents;
    this._dataType = dataType;
    this._normalized = normalized;
    this._byteStride = byteStride;
    this._byteOffset = byteOffset;
    this._attributeType = attributeType;
  }

  // Returns a Uint8Array subarray pointing to the attribute entry in the buffer.
  getAddress(attIndex) {
    const bytePos = this._byteOffset + this._byteStride * attIndex;
    return this._buffer.data.subarray(bytePos);
  }

  // Sets a value of an attribute entry. value should be a Uint8Array or typed array.
  setAttributeValue(entryIndex, value) {
    const bytePos = entryIndex * this._byteStride;
    this._buffer.write(bytePos, value, this._byteStride);
  }

  // Copies data from the source attribute to this attribute.
  copyFrom(srcAtt) {
    this._numComponents = srcAtt._numComponents;
    this._dataType = srcAtt._dataType;
    this._normalized = srcAtt._normalized;
    this._byteStride = srcAtt._byteStride;
    this._byteOffset = srcAtt._byteOffset;
    this._attributeType = srcAtt._attributeType;
    this._uniqueId = srcAtt._uniqueId;

    if (srcAtt._buffer === null) {
      this._buffer = null;
    } else {
      if (this._buffer === null) {
        return false;
      }
      this._buffer.update(srcAtt._buffer.data, srcAtt._buffer.dataSize);
    }
    return true;
  }

  // Sets a new internal storage for the attribute.
  resetBuffer(buffer, byteStride, byteOffset) {
    this._buffer = buffer;
    this._byteStride = byteStride;
    this._byteOffset = byteOffset;
  }

  get attributeType() { return this._attributeType; }

  get dataType() { return this._dataType; }

  get numComponents() { return this._numComponents; }

  get buffer() { return this._buffer; }

  get byteStride() { return this._byteStride; }

  get byteOffset() { return this._byteOffset; }

  get uniqueId() { return this._uniqueId; }
  set uniqueId(id) { this._uniqueId = id; }

}

export { GeometryAttribute, Type as GeometryAttributeType };
