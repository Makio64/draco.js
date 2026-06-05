// compression/config/DracoOptions.js - ported from compression/config/draco_options.h

// Base option class used to control encoding and decoding. The geometry coding
// can be controlled through the following options:
//   1. Global options - Options specific to overall geometry or options common
//                       for all attributes
//   2. Per attribute options - Options specific to a given attribute.
//                              Each attribute is identified by a key (e.g.
//                              attribute type or attribute id).
export class DracoOptions {

  constructor() {
    // Global options stored as a Map of string -> value
    this._globalOptions = new Map();
    // Per-attribute options stored as a Map of attributeKey -> Map(string -> value)
    this._attributeOptions = new Map();
  }

  // --- Global option accessors ---

  getGlobalBool(name, defaultVal) {
    if (this._globalOptions.has(name)) {
      return !!this._globalOptions.get(name);
    }
    return defaultVal;
  }

  // --- Attribute-specific option accessors ---

  findAttributeOptions(attKey) {
    if (this._attributeOptions.has(attKey)) {
      return this._attributeOptions.get(attKey);
    }
    return null;
  }

  getAttributeBool(attKey, name, defaultVal) {
    const attOpts = this.findAttributeOptions(attKey);
    if (attOpts !== null && attOpts.has(name)) {
      return !!attOpts.get(name);
    }
    return this.getGlobalBool(name, defaultVal);
  }

}
