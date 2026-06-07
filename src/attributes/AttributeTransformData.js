// attributes/AttributeTransformData.js - ported from attributes/attribute_transform_data.h

import { AttributeTransformType } from './AttributeTransformType.js';
import { DataBuffer } from '../core/DataBuffer.js';

class AttributeTransformData {

  constructor() {
    this._transformType = AttributeTransformType.INVALID;
    this._buffer = new DataBuffer();
  }

  get transformType() {
    return this._transformType;
  }

  set transformType(type) {
    this._transformType = type;
  }

  setParameterValue(byteOffset, value, type) {
    const sizeNeeded = byteOffset + this._typeSize(type);
    if (sizeNeeded > this._buffer.dataSize) {
      this._buffer.resize(sizeNeeded);
    }
    const data = this._buffer.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    switch (type) {
      case 'int32': view.setInt32(byteOffset, value, true); break;
      case 'uint32': view.setUint32(byteOffset, value, true); break;
      case 'float32': view.setFloat32(byteOffset, value, true); break;
      case 'float64': view.setFloat64(byteOffset, value, true); break;
      case 'int8': view.setInt8(byteOffset, value); break;
      case 'uint8': view.setUint8(byteOffset, value); break;
      case 'int16': view.setInt16(byteOffset, value, true); break;
      case 'uint16': view.setUint16(byteOffset, value, true); break;
      default: view.setInt32(byteOffset, value, true); break;
    }
  }

  appendParameterValue(value, type) {
    this.setParameterValue(this._buffer.dataSize, value, type);
  }

  _typeSize(type) {
    switch (type) {
      case 'int8': case 'uint8': return 1;
      case 'int16': case 'uint16': return 2;
      case 'int32': case 'uint32': case 'float32': return 4;
      case 'float64': return 8;
      default: return 4;
    }
  }

}

export { AttributeTransformData };
