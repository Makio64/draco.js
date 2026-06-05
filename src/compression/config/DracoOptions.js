// compression/config/DracoOptions.js - ported from compression/config/draco_options.h

// Base option class with global options and per-attribute options keyed by
// attribute key (e.g. attribute type or id).
export class DracoOptions {

  constructor() {
    this._globalOptions = new Map(); // name -> value
    this._attributeOptions = new Map(); // attributeKey -> Map(name -> value)
  }

  getGlobalBool(name, defaultVal) {
    if (this._globalOptions.has(name)) {
      return !!this._globalOptions.get(name);
    }
    return defaultVal;
  }

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
