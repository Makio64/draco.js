// compression/attributes/AttributesDecoder.js - ported from compression/attributes/attributes_decoder.h/cc

import { AttributesDecoderInterface } from './AttributesDecoderInterface.js';
import { GeometryAttribute, GeometryAttributeType } from '../../attributes/GeometryAttribute.js';
import { PointAttribute } from '../../attributes/PointAttribute.js';
import { DataType, dataTypeLength } from '../../core/DracoTypes.js';
import { decodeVarint } from '../../core/VarintDecoding.js';
import { DRACO_BITSTREAM_VERSION } from '../config/CompressionShared.js';

// Base class for decoding one or more attributes that were encoded with a
// matching AttributesEncoder. It is a basic implementation of
// AttributesDecoderInterface that provides functionality that is shared between
// all AttributesDecoders.
class AttributesDecoder extends AttributesDecoderInterface {

  constructor() {
    super();
    // List of attribute ids that need to be decoded with this decoder.
    this._pointAttributeIds = [];
    // Map between point attribute id and the local id (inverse of _pointAttributeIds).
    this._pointAttributeToLocalIdMap = [];
    this._pointCloudDecoder = null;
    this._pointCloud = null;
  }

  // Called after all attribute decoders are created.
  init(decoder, pointCloud) {
    this._pointCloudDecoder = decoder;
    this._pointCloud = pointCloud;
    return true;
  }

  // Decodes any attribute decoder specific data from the buffer.
  decodeAttributesDecoderData(buffer) {
    // Decode and create attributes.
    let numAttributes;

    if (this._pointCloudDecoder.bitstreamVersion() <
        DRACO_BITSTREAM_VERSION(2, 0)) {
      numAttributes = buffer.decodeUint32();
      if (numAttributes === undefined) return false;
    } else {
      numAttributes = decodeVarint(buffer, false);
      if (numAttributes === undefined) return false;
    }

    // Check that decoded number of attributes is valid.
    if (numAttributes === 0) {
      return false;
    }
    if (numAttributes > 5 * buffer.remainingSize) {
      // The decoded number of attributes is unreasonably high.
      return false;
    }

    // Decode attribute descriptor data.
    this._pointAttributeIds.length = numAttributes;
    const pc = this._pointCloud;

    for (let i = 0; i < numAttributes; i++) {
      // Decode attribute descriptor data.
      const attType = buffer.decodeUint8();
      if (attType === undefined) return false;

      const dataType = buffer.decodeUint8();
      if (dataType === undefined) return false;

      const numComponents = buffer.decodeUint8();
      if (numComponents === undefined) return false;

      const normalized = buffer.decodeUint8();
      if (normalized === undefined) return false;

      if (attType >= GeometryAttributeType.NAMED_ATTRIBUTES_COUNT) {
        return false;
      }
      if (dataType === DataType.INVALID || dataType >= DataType.TYPES_COUNT) {
        return false;
      }

      // Check decoded attribute descriptor data.
      if (numComponents === 0) {
        return false;
      }

      // Create a GeometryAttribute and init it.
      const ga = new GeometryAttribute();
      ga.init(
        attType, null, numComponents, dataType,
        normalized > 0,
        dataTypeLength(dataType) * numComponents, 0
      );

      let uniqueId;
      if (this._pointCloudDecoder.bitstreamVersion() <
          DRACO_BITSTREAM_VERSION(1, 3)) {
        uniqueId = buffer.decodeUint16();
        if (uniqueId === undefined) return false;
        ga.uniqueId = uniqueId;
      } else {
        uniqueId = decodeVarint(buffer, false);
        if (uniqueId === undefined) return false;
        ga.uniqueId = uniqueId;
      }

      // Add the attribute to the point cloud.
      const pa = new PointAttribute(ga);
      const attId = pc.addAttribute(pa);
      pc.attribute(attId).uniqueId = uniqueId;
      this._pointAttributeIds[i] = attId;

      // Update the inverse map.
      if (attId >= this._pointAttributeToLocalIdMap.length) {
        const oldLen = this._pointAttributeToLocalIdMap.length;
        this._pointAttributeToLocalIdMap.length = attId + 1;
        for (let j = oldLen; j <= attId; j++) {
          this._pointAttributeToLocalIdMap[j] = -1;
        }
      }
      this._pointAttributeToLocalIdMap[attId] = i;
    }
    return true;
  }

  getAttributeId(i) {
    return this._pointAttributeIds[i];
  }

  getNumAttributes() {
    return this._pointAttributeIds.length;
  }

  getDecoder() {
    return this._pointCloudDecoder;
  }

  // Decodes attribute data from the source buffer.
  decodeAttributes(buffer) {
    if (!this.decodePortableAttributes(buffer)) {
      return false;
    }
    if (!this.decodeDataNeededByPortableTransforms(buffer)) {
      return false;
    }
    if (!this.transformAttributesToOriginalFormat()) {
      return false;
    }
    return true;
  }

  getLocalIdForPointAttribute(pointAttributeId) {
    if (pointAttributeId >= this._pointAttributeToLocalIdMap.length) {
      return -1;
    }
    return this._pointAttributeToLocalIdMap[pointAttributeId];
  }

  // Must be overridden.
  decodePortableAttributes(buffer) {
    return false;
  }

  decodeDataNeededByPortableTransforms(buffer) {
    return true;
  }

  transformAttributesToOriginalFormat() {
    return true;
  }

}

export { AttributesDecoder };
