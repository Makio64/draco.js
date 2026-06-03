// metadata/GeometryMetadata.js - ported from metadata/geometry_metadata.h/cc

import { Metadata } from './Metadata.js';

class AttributeMetadata extends Metadata {

  constructor(other) {

    if (other instanceof AttributeMetadata) {

      super(other);
      this.att_unique_id_ = other.att_unique_id_;

    } else if (other instanceof Metadata) {

      super(other);
      this.att_unique_id_ = 0;

    } else {

      super();
      this.att_unique_id_ = 0;

    }

  }

  setAttUniqueId(attUniqueId) {

    this.att_unique_id_ = attUniqueId;

  }

  attUniqueId() {

    return this.att_unique_id_;

  }

}

class GeometryMetadata extends Metadata {

  constructor(other) {

    if (other instanceof GeometryMetadata) {

      super(other);
      this.att_metadatas_ = [];

      for (let i = 0; i < other.att_metadatas_.length; ++i) {

        this.att_metadatas_.push(new AttributeMetadata(other.att_metadatas_[i]));

      }

    } else if (other instanceof Metadata) {

      super(other);
      this.att_metadatas_ = [];

    } else {

      super();
      this.att_metadatas_ = [];

    }

  }

  getAttributeMetadataByStringEntry(entryName, entryValue) {

    for (const attMetadata of this.att_metadatas_) {

      const value = attMetadata.getEntryString(entryName);
      if (value === null) continue;
      if (value === entryValue) {
        return attMetadata;
      }

    }

    return null;

  }

  addAttributeMetadata(attMetadata) {

    if (!attMetadata) {
      return false;
    }

    this.att_metadatas_.push(attMetadata);
    return true;

  }

  deleteAttributeMetadataByUniqueId(attUniqueId) {

    if (attUniqueId < 0) return;

    for (let i = 0; i < this.att_metadatas_.length; ++i) {

      if (this.att_metadatas_[i].attUniqueId() === attUniqueId) {

        this.att_metadatas_.splice(i, 1);
        return;

      }

    }

  }

  getAttributeMetadataByUniqueId(attUniqueId) {

    if (attUniqueId < 0) return null;

    for (const attMetadata of this.att_metadatas_) {

      if (attMetadata.attUniqueId() === attUniqueId) {
        return attMetadata;
      }

    }

    return null;

  }

  attributeMetadatas() {

    return this.att_metadatas_;

  }

}

export { AttributeMetadata, GeometryMetadata };
