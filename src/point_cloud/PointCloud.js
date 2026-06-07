// point_cloud/PointCloud.js - ported from point_cloud/point_cloud.h/cc

// Must match the C++ GeometryAttribute::Type enum count.
const NAMED_ATTRIBUTES_COUNT = 8;

class PointCloud {

  constructor() {

    this.num_points_ = 0;
    this.attributes_ = [];

    // named_attribute_index_[type] = [att_id, ...]
    this.named_attribute_index_ = [];
    for (let i = 0; i < NAMED_ATTRIBUTES_COUNT; ++i) {

      this.named_attribute_index_.push([]);

    }

  }

  numNamedAttributes(type) {

    if (type < 0 || type >= NAMED_ATTRIBUTES_COUNT) {
      return 0;
    }

    return this.named_attribute_index_[type].length;

  }

  getNamedAttributeId(type, i) {

    if (i === undefined) i = 0;
    if (this.numNamedAttributes(type) <= i) {
      return -1;
    }

    return this.named_attribute_index_[type][i];

  }

  getNamedAttribute(type, i) {

    if (i === undefined) i = 0;
    const attId = this.getNamedAttributeId(type, i);
    if (attId === -1) {
      return null;
    }

    return this.attributes_[attId];

  }

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

  addAttribute(pa) {

    this.setAttribute(this.attributes_.length, pa);
    return this.attributes_.length - 1;

  }

  setAttribute(attId, pa) {

    if (this.attributes_.length <= attId) {

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
