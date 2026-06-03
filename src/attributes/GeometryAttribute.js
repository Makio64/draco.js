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

  isValid() {
    return this._buffer !== null;
  }

  // Returns the byte position of the attribute entry in the data buffer.
  getBytePos(attIndex) {
    return this._byteOffset + this._byteStride * attIndex;
  }

  // Returns a Uint8Array subarray pointing to the attribute entry in the buffer.
  getAddress(attIndex) {
    const bytePos = this.getBytePos(attIndex);
    return this._buffer.data.subarray(bytePos);
  }

  // Fills outData (Uint8Array) with the raw value of the requested attribute entry.
  getValue(attIndex, outData) {
    const bytePos = this._byteOffset + this._byteStride * attIndex;
    this._buffer.read(bytePos, outData, this._byteStride);
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
  set attributeType(type) { this._attributeType = type; }

  get dataType() { return this._dataType; }

  get numComponents() { return this._numComponents; }

  get normalized() { return this._normalized; }
  set normalized(value) { this._normalized = value; }

  get buffer() { return this._buffer; }

  get byteStride() { return this._byteStride; }

  get byteOffset() { return this._byteOffset; }
  set byteOffset(value) { this._byteOffset = value; }

  get uniqueId() { return this._uniqueId; }
  set uniqueId(id) { this._uniqueId = id; }

}

export { GeometryAttribute, Type as GeometryAttributeType };
