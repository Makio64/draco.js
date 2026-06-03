// metadata/Metadata.js - ported from metadata/metadata.h/cc

// EntryValue wraps a Uint8Array buffer that stores arbitrary typed data.
class EntryValue {

  constructor(data) {

    if (data instanceof Uint8Array) {

      this.data = new Uint8Array(data);

    } else if (typeof data === 'string') {

      const encoder = new TextEncoder();
      this.data = encoder.encode(data);

    } else if (ArrayBuffer.isView(data)) {

      this.data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    } else if (typeof data === 'number') {

      // Store as int32 by default
      const buf = new ArrayBuffer(4);
      new Int32Array(buf)[0] = data;
      this.data = new Uint8Array(buf);

    } else {

      this.data = new Uint8Array(0);

    }

  }

  getValueAsInt32() {

    if (this.data.length !== 4) return null;
    return new Int32Array(this.data.buffer, this.data.byteOffset, 1)[0];

  }

  getValueAsDouble() {

    if (this.data.length !== 8) return null;
    return new Float64Array(this.data.buffer, this.data.byteOffset, 1)[0];

  }

  getValueAsString() {

    if (this.data.length === 0) return null;
    const decoder = new TextDecoder();
    return decoder.decode(this.data);

  }

  getValueAsBinary() {

    return this.data;

  }

}

class Metadata {

  constructor(other) {

    // entries_: Map<string, EntryValue>
    this.entries_ = new Map();
    // sub_metadatas_: Map<string, Metadata>
    this.sub_metadatas_ = new Map();

    if (other instanceof Metadata) {

      for (const [key, value] of other.entries_) {

        this.entries_.set(key, new EntryValue(value.data));

      }

      for (const [key, value] of other.sub_metadatas_) {

        this.sub_metadatas_.set(key, new Metadata(value));

      }

    }

  }

  addEntryInt(name, value) {

    const buf = new ArrayBuffer(4);
    new Int32Array(buf)[0] = value;
    this.entries_.set(name, new EntryValue(new Uint8Array(buf)));

  }

  getEntryInt(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    return entry.getValueAsInt32();

  }

  addEntryIntArray(name, values) {

    const buf = new Int32Array(values);
    this.entries_.set(name, new EntryValue(new Uint8Array(buf.buffer)));

  }

  getEntryIntArray(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    if (entry.data.length === 0 || entry.data.length % 4 !== 0) return null;
    const result = new Int32Array(entry.data.buffer, entry.data.byteOffset, entry.data.length / 4);
    return Array.from(result);

  }

  addEntryDouble(name, value) {

    const buf = new ArrayBuffer(8);
    new Float64Array(buf)[0] = value;
    this.entries_.set(name, new EntryValue(new Uint8Array(buf)));

  }

  getEntryDouble(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    return entry.getValueAsDouble();

  }

  addEntryDoubleArray(name, values) {

    const buf = new Float64Array(values);
    this.entries_.set(name, new EntryValue(new Uint8Array(buf.buffer)));

  }

  getEntryDoubleArray(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    if (entry.data.length === 0 || entry.data.length % 8 !== 0) return null;
    const result = new Float64Array(entry.data.buffer, entry.data.byteOffset, entry.data.length / 8);
    return Array.from(result);

  }

  addEntryString(name, value) {

    this.entries_.set(name, new EntryValue(value));

  }

  getEntryString(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    return entry.getValueAsString();

  }

  addEntryBinary(name, value) {

    this.entries_.set(name, new EntryValue(new Uint8Array(value)));

  }

  getEntryBinary(name) {

    const entry = this.entries_.get(name);
    if (entry === undefined) return null;
    return entry.getValueAsBinary();

  }

  addSubMetadata(name, subMetadata) {

    if (this.sub_metadatas_.has(name)) {
      return false;
    }

    this.sub_metadatas_.set(name, subMetadata);
    return true;

  }

  getSubMetadata(name) {

    return this.sub_metadatas_.get(name) || null;

  }

  removeEntry(name) {

    this.entries_.delete(name);

  }

  numEntries() {

    return this.entries_.size;

  }

  entries() {

    return this.entries_;

  }

  subMetadatas() {

    return this.sub_metadatas_;

  }

}

export { EntryValue, Metadata };
