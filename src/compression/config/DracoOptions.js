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

  getGlobalInt(name, defaultVal) {
    if (this._globalOptions.has(name)) {
      return this._globalOptions.get(name) | 0;
    }
    return defaultVal;
  }

  setGlobalInt(name, val) {
    this._globalOptions.set(name, val | 0);
  }

  getGlobalFloat(name, defaultVal) {
    if (this._globalOptions.has(name)) {
      return +this._globalOptions.get(name);
    }
    return defaultVal;
  }

  setGlobalFloat(name, val) {
    this._globalOptions.set(name, +val);
  }

  getGlobalBool(name, defaultVal) {
    if (this._globalOptions.has(name)) {
      return !!this._globalOptions.get(name);
    }
    return defaultVal;
  }

  setGlobalBool(name, val) {
    this._globalOptions.set(name, val ? 1 : 0);
  }

  isGlobalOptionSet(name) {
    return this._globalOptions.has(name);
  }

  setGlobalOptions(optionsMap) {
    this._globalOptions = new Map(optionsMap);
  }

  getGlobalOptions() {
    return this._globalOptions;
  }

  // --- Attribute-specific option accessors ---

  _getOrCreateAttributeOptions(attKey) {
    if (!this._attributeOptions.has(attKey)) {
      this._attributeOptions.set(attKey, new Map());
    }
    return this._attributeOptions.get(attKey);
  }

  findAttributeOptions(attKey) {
    if (this._attributeOptions.has(attKey)) {
      return this._attributeOptions.get(attKey);
    }
    return null;
  }

  getAttributeInt(attKey, name, defaultVal) {
    const attOpts = this.findAttributeOptions(attKey);
    if (attOpts !== null && attOpts.has(name)) {
      return attOpts.get(name) | 0;
    }
    return this.getGlobalInt(name, defaultVal);
  }

  setAttributeInt(attKey, name, val) {
    this._getOrCreateAttributeOptions(attKey).set(name, val | 0);
  }

  getAttributeFloat(attKey, name, defaultVal) {
    const attOpts = this.findAttributeOptions(attKey);
    if (attOpts !== null && attOpts.has(name)) {
      return +attOpts.get(name);
    }
    return this.getGlobalFloat(name, defaultVal);
  }

  setAttributeFloat(attKey, name, val) {
    this._getOrCreateAttributeOptions(attKey).set(name, +val);
  }

  getAttributeBool(attKey, name, defaultVal) {
    const attOpts = this.findAttributeOptions(attKey);
    if (attOpts !== null && attOpts.has(name)) {
      return !!attOpts.get(name);
    }
    return this.getGlobalBool(name, defaultVal);
  }

  setAttributeBool(attKey, name, val) {
    this._getOrCreateAttributeOptions(attKey).set(name, val ? 1 : 0);
  }

  isAttributeOptionSet(attKey, name) {
    const attOpts = this.findAttributeOptions(attKey);
    if (attOpts !== null) {
      return attOpts.has(name);
    }
    return this._globalOptions.has(name);
  }

  setAttributeOptions(attKey, optionsMap) {
    this._attributeOptions.set(attKey, new Map(optionsMap));
  }

}
