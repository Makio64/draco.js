// point_cloud/PointCloud.js - ported from point_cloud/point_cloud.h/cc

// Mirrors GeometryAttribute::Type enum values used for named attribute indexing.
// These must match the C++ GeometryAttribute::Type enum.
const NAMED_ATTRIBUTES_COUNT = 8;

class PointCloud {

  constructor() {

    this.num_points_ = 0;
    this.attributes_ = [];

    // Array of arrays: named_attribute_index_[type] = [att_id, ...]
    this.named_attribute_index_ = [];
    for (let i = 0; i < NAMED_ATTRIBUTES_COUNT; ++i) {

      this.named_attribute_index_.push([]);

    }

  }

  // Returns the number of named attributes of a given type.
  numNamedAttributes(type) {

    if (type < 0 || type >= NAMED_ATTRIBUTES_COUNT) {
      return 0;
    }

    return this.named_attribute_index_[type].length;

  }

  // Returns attribute id of the i-th named attribute with a given type or -1.
  getNamedAttributeId(type, i) {

    if (i === undefined) i = 0;
    if (this.numNamedAttributes(type) <= i) {
      return -1;
    }

    return this.named_attribute_index_[type][i];

  }

  // Returns the first or i-th named attribute of a given type or null.
  getNamedAttribute(type, i) {

    if (i === undefined) i = 0;
    const attId = this.getNamedAttributeId(type, i);
    if (attId === -1) {
      return null;
    }

    return this.attributes_[attId];

  }

  // Returns the attribute with a given unique id.
  getAttributeByUniqueId(uniqueId) {

    const attId = this.getAttributeIdByUniqueId(uniqueId);
    if (attId === -1) {
      return null;
    }

    return this.attributes_[attId];

  }

  getAttributeIdByUniqueId(uniqueId) {

    for (let i = 0; i < this.attributes_.length; ++i) {

      if (this.attributes_[i].uniqueId === uniqueId) {
        return i;
      }

    }

    return -1;

  }

  numAttributes() {

    return this.attributes_.length;

  }

  attribute(attId) {

    return this.attributes_[attId];

  }

  // Adds a new attribute to the point cloud. Returns the attribute id.
  addAttribute(pa) {

    this.setAttribute(this.attributes_.length, pa);
    return this.attributes_.length - 1;

  }

  // Assigns an attribute to a given attribute id.
  setAttribute(attId, pa) {

    if (this.attributes_.length <= attId) {

      // Resize the array to accommodate the new attribute id.
      while (this.attributes_.length <= attId) {
        this.attributes_.push(null);
      }

    }

    if (pa.attributeType < NAMED_ATTRIBUTES_COUNT) {

      this.named_attribute_index_[pa.attributeType].push(attId);

    }

    pa.uniqueId = attId;
    this.attributes_[attId] = pa;

  }

  numPoints() {

    return this.num_points_;

  }

  setNumPoints(num) {

    this.num_points_ = num;

  }

}

export { PointCloud };
