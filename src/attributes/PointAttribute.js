// attributes/PointAttribute.js - ported from attributes/point_attribute.h/cc

import { GeometryAttribute } from './GeometryAttribute.js';
import { DataBuffer } from '../core/DataBuffer.js';
import { DataType, dataTypeLength } from '../core/DracoTypes.js';
import { kInvalidAttributeValueIndex } from './GeometryIndices.js';

class PointAttribute extends GeometryAttribute {

  constructor(geometryAttribute) {
    super();
    this._identityMapping = false;
    this._numUniqueEntries = 0;
    this._indicesMap = [];
    this._attributeBuffer = null;
    this._attributeTransformData = null;

    // Copy-construct from a GeometryAttribute if provided.
    if (geometryAttribute instanceof GeometryAttribute) {
      this._buffer = geometryAttribute._buffer;
      this._numComponents = geometryAttribute._numComponents;
      this._dataType = geometryAttribute._dataType;
      this._normalized = geometryAttribute._normalized;
      this._byteStride = geometryAttribute._byteStride;
      this._byteOffset = geometryAttribute._byteOffset;
      this._attributeType = geometryAttribute._attributeType;
      this._uniqueId = geometryAttribute._uniqueId;
    }
  }

  // Initializes a point attribute with identity mapping.
  init(attributeType, numComponents, dataType, normalized, numAttributeValues) {
    this._attributeBuffer = new DataBuffer();
    const byteStride = dataTypeLength(dataType) * numComponents;
    super.init(attributeType, this._attributeBuffer, numComponents, dataType, normalized, byteStride, 0);
    this.reset(numAttributeValues);
    this.setIdentityMapping();
  }

  // Prepares the attribute storage for the specified number of entries.
  reset(numAttributeValues) {
    if (this._attributeBuffer === null) {
      this._attributeBuffer = new DataBuffer();
    }
    const entrySize = dataTypeLength(this.dataType) * this.numComponents;
    this._attributeBuffer.update(null, numAttributeValues * entrySize);
    // Assign the new buffer to the parent attribute.
    this.resetBuffer(this._attributeBuffer, entrySize, 0);
    this._numUniqueEntries = numAttributeValues;
    return true;
  }

  // Resizes the attribute storage.
  resize(newNumUniqueEntries) {
    this._numUniqueEntries = newNumUniqueEntries;
    this._attributeBuffer.resize(newNumUniqueEntries * this.byteStride);
  }

  get size() {
    return this._numUniqueEntries;
  }

  // Returns the mapped attribute value index for a given point index.
  mappedIndex(pointIndex) {
    if (this._identityMapping) {
      return pointIndex;
    }
    return this._indicesMap[pointIndex];
  }

  get isMappingIdentity() {
    return this._identityMapping;
  }

  get indicesMapSize() {
    if (this._identityMapping) {
      return 0;
    }
    return this._indicesMap.length;
  }

  // Direct access to the explicit point->value index map (Uint32Array after
  // setExplicitMapping). Lets hot mapping loops write entries without a
  // per-entry setPointMapEntry() dispatch.
  get indicesMap() {
    return this._indicesMap;
  }

  // Sets the mapping to implicit (point indices equal attribute entry indices).
  setIdentityMapping() {
    this._identityMapping = true;
    this._indicesMap = [];
  }

  // Sets the mapping to be explicit using the indicesMap array.
  setExplicitMapping(numPoints) {
    this._identityMapping = false;
    // Uint32Array (rather than a plain Array) keeps mappedIndex() monomorphic
    // and avoids boxed-number storage; it is read once per point per attribute.
    // Must be UNSIGNED so the 0xFFFFFFFF invalid sentinel round-trips intact.
    this._indicesMap = new Uint32Array(numPoints);
    this._indicesMap.fill(kInvalidAttributeValueIndex);
  }

  // Sets an explicit map entry for a specific point index.
  setPointMapEntry(pointIndex, entryIndex) {
    this._indicesMap[pointIndex] = entryIndex;
  }

  // Set attribute transform data for the attribute.
  setAttributeTransformData(transformData) {
    this._attributeTransformData = transformData;
  }

  getAttributeTransformData() {
    return this._attributeTransformData;
  }

  // Converts the attribute value at the given index into the output array.
  // Mirrors C++ PointAttribute::ConvertValue<T>().
  convertValue(attIndex, outVal) {
    const bytePos = this._byteOffset + this._byteStride * attIndex;
    const bufData = this._buffer.data;
    const dt = this._dataType;
    const nc = this._numComponents;

    // Fast path for FLOAT32 (most common case).
    if (dt === DataType.FLOAT32) {
      if (this._cachedFloat32View === undefined || this._cachedFloat32Buffer !== bufData.buffer) {
        this._cachedFloat32Buffer = bufData.buffer;
        this._cachedFloat32View = new Float32Array(bufData.buffer);
      }
      const baseIndex = (bufData.byteOffset + bytePos) >> 2;
      for (let i = 0; i < nc; ++i) {
        outVal[i] = this._cachedFloat32View[baseIndex + i];
      }
      return;
    }

    // Fast path for INT32 — the type of every portable (decoded-integer)
    // attribute, read per-corner by the geometric-normal / texcoords
    // predictors. A cached Int32Array view indexed by element avoids the
    // per-component DataView.getInt32 dispatch. Base byte position is always
    // 4-aligned for these attributes (byteStride is a multiple of 4).
    if (dt === DataType.INT32) {
      if (this._cachedInt32View === undefined || this._cachedInt32Buffer !== bufData.buffer) {
        this._cachedInt32Buffer = bufData.buffer;
        this._cachedInt32View = new Int32Array(bufData.buffer);
      }
      const baseIndex = (bufData.byteOffset + bytePos) >> 2;
      for (let i = 0; i < nc; ++i) {
        outVal[i] = this._cachedInt32View[baseIndex + i];
      }
      return;
    }

    if (dt === DataType.UINT32) {
      if (this._cachedUint32View === undefined || this._cachedUint32Buffer !== bufData.buffer) {
        this._cachedUint32Buffer = bufData.buffer;
        this._cachedUint32View = new Uint32Array(bufData.buffer);
      }
      const baseIndex = (bufData.byteOffset + bytePos) >> 2;
      for (let i = 0; i < nc; ++i) {
        outVal[i] = this._cachedUint32View[baseIndex + i];
      }
      return;
    }

    // General path using cached DataView.
    if (this._cachedDataView === undefined || this._cachedDVBuffer !== bufData.buffer) {
      this._cachedDVBuffer = bufData.buffer;
      this._cachedDataView = new DataView(bufData.buffer, bufData.byteOffset, bufData.byteLength);
    }
    const dv = this._cachedDataView;
    for (let i = 0; i < nc; ++i) {
      switch (dt) {
        case DataType.INT8:
          outVal[i] = dv.getInt8(bytePos + i); break;
        case DataType.UINT8:
          outVal[i] = dv.getUint8(bytePos + i); break;
        case DataType.INT16:
          outVal[i] = dv.getInt16(bytePos + i * 2, true); break;
        case DataType.UINT16:
          outVal[i] = dv.getUint16(bytePos + i * 2, true); break;
        case DataType.INT32:
          outVal[i] = dv.getInt32(bytePos + i * 4, true); break;
        case DataType.UINT32:
          outVal[i] = dv.getUint32(bytePos + i * 4, true); break;
        case DataType.FLOAT64:
          outVal[i] = dv.getFloat64(bytePos + i * 8, true); break;
        default:
          outVal[i] = 0; break;
      }
    }
  }

  // High-performance direct extraction of all values to the output typed array.
  // Replaces the slow point-by-point copy loop that used temporary arrays.
  extractTo(OutputTypedArray, numPoints) {
    const numComponents = this._numComponents;
    const array = new OutputTypedArray(numPoints * numComponents);
    if (this._buffer === null || numPoints === 0) {
      return array;
    }
    const bufData = this._buffer.data;
    const dt = this._dataType;
    const isIdentity = this._identityMapping;
    const indicesMap = this._indicesMap;
    const byteStride = this._byteStride;
    const byteOffset = this._byteOffset;

    let srcView = null;
    let shift = 0;

    if (dt === DataType.FLOAT32) {
      if (this._cachedFloat32View === undefined || this._cachedFloat32Buffer !== bufData.buffer) {
        this._cachedFloat32Buffer = bufData.buffer;
        this._cachedFloat32View = new Float32Array(bufData.buffer);
      }
      srcView = this._cachedFloat32View;
      shift = 2;
    } else if (dt === DataType.INT32) {
      if (this._cachedInt32View === undefined || this._cachedInt32Buffer !== bufData.buffer) {
        this._cachedInt32Buffer = bufData.buffer;
        this._cachedInt32View = new Int32Array(bufData.buffer);
      }
      srcView = this._cachedInt32View;
      shift = 2;
    } else if (dt === DataType.UINT32) {
      if (this._cachedUint32View === undefined || this._cachedUint32Buffer !== bufData.buffer) {
        this._cachedUint32Buffer = bufData.buffer;
        this._cachedUint32View = new Uint32Array(bufData.buffer);
      }
      srcView = this._cachedUint32View;
      shift = 2;
    } else if (dt === DataType.UINT16) {
      if (this._cachedUint16View === undefined || this._cachedUint16Buffer !== bufData.buffer) {
        this._cachedUint16Buffer = bufData.buffer;
        this._cachedUint16View = new Uint16Array(bufData.buffer);
      }
      srcView = this._cachedUint16View;
      shift = 1;
    } else if (dt === DataType.INT16) {
      if (this._cachedInt16View === undefined || this._cachedInt16Buffer !== bufData.buffer) {
        this._cachedInt16Buffer = bufData.buffer;
        this._cachedInt16View = new Int16Array(bufData.buffer);
      }
      srcView = this._cachedInt16View;
      shift = 1;
    } else if (dt === DataType.UINT8) {
      if (this._cachedUint8View === undefined || this._cachedUint8Buffer !== bufData.buffer) {
        this._cachedUint8Buffer = bufData.buffer;
        this._cachedUint8View = new Uint8Array(bufData.buffer);
      }
      srcView = this._cachedUint8View;
      shift = 0;
    } else if (dt === DataType.INT8) {
      if (this._cachedInt8View === undefined || this._cachedInt8Buffer !== bufData.buffer) {
        this._cachedInt8Buffer = bufData.buffer;
        this._cachedInt8View = new Int8Array(bufData.buffer);
      }
      srcView = this._cachedInt8View;
      shift = 0;
    } else if (dt === DataType.FLOAT64) {
      if (this._cachedFloat64View === undefined || this._cachedFloat64Buffer !== bufData.buffer) {
        this._cachedFloat64Buffer = bufData.buffer;
        this._cachedFloat64View = new Float64Array(bufData.buffer);
      }
      srcView = this._cachedFloat64View;
      shift = 3;
    }

    if (srcView !== null) {
      const srcStart = (bufData.byteOffset + byteOffset) >> shift;
      const strideElements = byteStride >> shift;

      // Contiguous fast block copy path.
      if (isIdentity && strideElements === numComponents) {
        const srcEnd = srcStart + numPoints * numComponents;
        if (srcView.constructor === OutputTypedArray) {
          array.set(srcView.subarray(srcStart, srcEnd));
          return array;
        }
      }

      // Fast assignment loop.
      for (let i = 0; i < numPoints; i++) {
        const attIndex = isIdentity ? i : indicesMap[i];
        const srcOffset = srcStart + attIndex * strideElements;
        const dstOffset = i * numComponents;
        for (let j = 0; j < numComponents; j++) {
          array[dstOffset + j] = srcView[srcOffset + j];
        }
      }
      return array;
    }

    // Slow/fallback path.
    const temp = new Array(numComponents);
    for (let i = 0; i < numPoints; i++) {
      const attIndex = isIdentity ? i : indicesMap[i];
      this.convertValue(attIndex, temp);
      const dstOffset = i * numComponents;
      for (let j = 0; j < numComponents; j++) {
        array[dstOffset + j] = temp[j];
      }
    }
    return array;
  }

  // Copies attribute data from the provided source attribute.
  copyFrom(srcAtt) {
    if (this.buffer === null) {
      this._attributeBuffer = new DataBuffer();
      this.resetBuffer(this._attributeBuffer, 0, 0);
    }
    if (!super.copyFrom(srcAtt)) {
      return;
    }
    this._identityMapping = srcAtt._identityMapping;
    this._numUniqueEntries = srcAtt._numUniqueEntries;
    this._indicesMap = srcAtt._indicesMap.slice();
    if (srcAtt._attributeTransformData) {
      // Shallow copy of transform data -- typically set fresh during decode.
      this._attributeTransformData = srcAtt._attributeTransformData;
    } else {
      this._attributeTransformData = null;
    }
  }

}

export { PointAttribute };
