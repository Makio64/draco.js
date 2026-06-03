// core/DataBuffer.js - ported from data_buffer.h/cc

export class DataBuffer {

  constructor() {
    this._data = new Uint8Array(0);
    this._updateCount = 0;
  }

  update(data, size, offset = 0) {
    if (data === null || data === undefined) {
      if (size + offset < 0) return false;
      this._resize(size + offset);
    } else {
      if (size < 0) return false;
      if (size + offset > this._data.length) {
        this._resize(size + offset);
      }
      const src = new Uint8Array(data.buffer || data, data.byteOffset || 0, size);
      this._data.set(src, offset);
    }
    this._updateCount++;
    return true;
  }

  resize(newSize) {
    this._resize(newSize);
    this._updateCount++;
  }

  read(bytePos, outArray, dataSize) {
    outArray.set(this._data.subarray(bytePos, bytePos + dataSize));
  }

  write(bytePos, inArray, dataSize) {
    // Fast path: the overwhelmingly common caller passes a Uint8Array view of
    // exactly dataSize bytes (one attribute entry). Avoid allocating a wrapper
    // view on every value, which otherwise dominates attribute storage time and
    // GC pressure.
    if (inArray instanceof Uint8Array) {
      this._data.set(inArray.length === dataSize ? inArray : inArray.subarray(0, dataSize), bytePos);
      return;
    }
    const src = new Uint8Array(inArray.buffer || inArray, inArray.byteOffset || 0, dataSize);
    this._data.set(src, bytePos);
  }

  copy(dstOffset, srcBuf, srcOffset, size) {
    this._data.set(srcBuf._data.subarray(srcOffset, srcOffset + size), dstOffset);
  }

  get data() { return this._data; }
  get dataSize() { return this._data.length; }
  get updateCount() { return this._updateCount; }

  _resize(newSize) {
    if (newSize === this._data.length) return;
    const newData = new Uint8Array(newSize);
    newData.set(this._data.subarray(0, Math.min(this._data.length, newSize)));
    this._data = newData;
  }

}
