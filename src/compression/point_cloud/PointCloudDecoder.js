// compression/point_cloud/PointCloudDecoder.js - ported from point_cloud/point_cloud_decoder.h/cc

import { Status, StatusCode, okStatus } from '../../core/Status.js';
import { DecoderBuffer } from '../../core/DecoderBuffer.js';
import { MetadataDecoder } from '../../metadata/MetadataDecoder.js';
import { GeometryMetadata } from '../../metadata/GeometryMetadata.js';
import {
  DracoHeader,
  EncodedGeometryType,
  DRACO_BITSTREAM_VERSION,
  METADATA_FLAG_MASK,
  kDracoPointCloudBitstreamVersionMajor,
  kDracoPointCloudBitstreamVersionMinor,
  kDracoMeshBitstreamVersionMajor,
  kDracoMeshBitstreamVersionMinor
} from '../config/CompressionShared.js';

// Abstract base class for all point cloud and mesh decoders. It provides a
// basic functionality that is shared between different decoders.
class PointCloudDecoder {

  constructor() {
    this._pointCloud = null;
    this._buffer = null;
    this._versionMajor = 0;
    this._versionMinor = 0;
    this._options = null;
    this._attributesDecoders = [];
    this._attributeToDecoderMap = [];
  }

  getGeometryType() {
    return EncodedGeometryType.POINT_CLOUD;
  }

  // Decodes a Draco header from the provided buffer.
  // Returns a Status. On success, out_header is populated.
  static decodeHeader(buffer, outHeader) {
    const kIoErrorMsg = 'Failed to parse Draco header.';
    const bytes = buffer.decodeBytes(5);
    if (bytes === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    for (let i = 0; i < 5; i++) {
      outHeader.dracoString[i] = bytes[i];
    }
    // Check for "DRACO" magic string
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    if (magic !== 'DRACO') {
      return new Status(StatusCode.DRACO_ERROR, 'Not a Draco file.');
    }
    outHeader.versionMajor = buffer.decodeUint8();
    if (outHeader.versionMajor === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    outHeader.versionMinor = buffer.decodeUint8();
    if (outHeader.versionMinor === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    outHeader.encoderType = buffer.decodeUint8();
    if (outHeader.encoderType === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    outHeader.encoderMethod = buffer.decodeUint8();
    if (outHeader.encoderMethod === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    outHeader.flags = buffer.decodeUint16();
    if (outHeader.flags === undefined) {
      return new Status(StatusCode.IO_ERROR, kIoErrorMsg);
    }
    return okStatus();
  }

  // The main entry point for point cloud decoding.
  decode(options, inBuffer, outPointCloud) {
    this._options = options;
    this._buffer = inBuffer;
    this._pointCloud = outPointCloud;

    const header = new DracoHeader();
    const headerStatus = PointCloudDecoder.decodeHeader(this._buffer, header);
    if (!headerStatus.ok()) {
      return headerStatus;
    }

    // Sanity check that we are using the right decoder.
    if (header.encoderType !== this.getGeometryType()) {
      return new Status(StatusCode.DRACO_ERROR,
        'Using incompatible decoder for the input geometry.');
    }

    this._versionMajor = header.versionMajor;
    this._versionMinor = header.versionMinor;

    const maxSupportedMajorVersion =
      header.encoderType === EncodedGeometryType.POINT_CLOUD
        ? kDracoPointCloudBitstreamVersionMajor
        : kDracoMeshBitstreamVersionMajor;
    const maxSupportedMinorVersion =
      header.encoderType === EncodedGeometryType.POINT_CLOUD
        ? kDracoPointCloudBitstreamVersionMinor
        : kDracoMeshBitstreamVersionMinor;

    // Check for version compatibility (backwards compatibility supported).
    if (this._versionMajor < 1 || this._versionMajor > maxSupportedMajorVersion) {
      return new Status(StatusCode.UNKNOWN_VERSION, 'Unknown major version.');
    }
    if (this._versionMajor === maxSupportedMajorVersion &&
        this._versionMinor > maxSupportedMinorVersion) {
      return new Status(StatusCode.UNKNOWN_VERSION, 'Unknown minor version.');
    }

    this._buffer.bitstreamVersion =
      DRACO_BITSTREAM_VERSION(this._versionMajor, this._versionMinor);

    if (this.bitstreamVersion() >= DRACO_BITSTREAM_VERSION(1, 3) &&
        (header.flags & METADATA_FLAG_MASK)) {
      const metadataStatus = this._decodeMetadata();
      if (!metadataStatus.ok()) {
        return metadataStatus;
      }
    }

    if (!this.initializeDecoder()) {
      return new Status(StatusCode.DRACO_ERROR, 'Failed to initialize the decoder.');
    }
    if (!this.decodeGeometryData()) {
      return new Status(StatusCode.DRACO_ERROR, 'Failed to decode geometry data.');
    }
    if (!this.decodePointAttributes()) {
      return new Status(StatusCode.DRACO_ERROR, 'Failed to decode point attributes.');
    }
    return okStatus();
  }

  bitstreamVersion() {
    return DRACO_BITSTREAM_VERSION(this._versionMajor, this._versionMinor);
  }

  setAttributesDecoder(attDecoderId, decoder) {
    if (attDecoderId < 0) {
      return false;
    }
    while (this._attributesDecoders.length <= attDecoderId) {
      this._attributesDecoders.push(null);
    }
    this._attributesDecoders[attDecoderId] = decoder;
    return true;
  }

  getPortableAttribute(parentAttId) {
    if (parentAttId < 0 || parentAttId >= this._pointCloud.numAttributes()) {
      return null;
    }
    const parentAttDecoderId = this._attributeToDecoderMap[parentAttId];
    return this._attributesDecoders[parentAttDecoderId].getPortableAttribute(parentAttId);
  }

  attributesDecoder(decId) {
    return this._attributesDecoders[decId];
  }

  numAttributesDecoders() {
    return this._attributesDecoders.length;
  }

  pointCloud() {
    return this._pointCloud;
  }

  buffer() {
    return this._buffer;
  }

  options() {
    return this._options;
  }

  // -- Protected virtual methods (override in subclasses) --

  initializeDecoder() {
    return true;
  }

  // Must be implemented by derived classes.
  createAttributesDecoder(/* attDecoderId */) {
    return false;
  }

  decodeGeometryData() {
    return true;
  }

  decodePointAttributes() {
    const numAttributesDecoders = this._buffer.decodeUint8();
    if (numAttributesDecoders === undefined) {
      return false;
    }
    // Create all attribute decoders.
    for (let i = 0; i < numAttributesDecoders; ++i) {
      if (!this.createAttributesDecoder(i)) {
        return false;
      }
    }
    // Initialize all attributes decoders.
    for (let i = 0; i < this._attributesDecoders.length; ++i) {
      if (!this._attributesDecoders[i].init(this, this._pointCloud)) {
        return false;
      }
    }
    // Decode data needed by the attribute decoders.
    for (let i = 0; i < numAttributesDecoders; ++i) {
      if (!this._attributesDecoders[i].decodeAttributesDecoderData(this._buffer)) {
        return false;
      }
    }
    // Create map between attribute and decoder ids.
    for (let i = 0; i < numAttributesDecoders; ++i) {
      const numAttributes = this._attributesDecoders[i].getNumAttributes();
      for (let j = 0; j < numAttributes; ++j) {
        const attId = this._attributesDecoders[i].getAttributeId(j);
        while (this._attributeToDecoderMap.length <= attId) {
          this._attributeToDecoderMap.push(0);
        }
        this._attributeToDecoderMap[attId] = i;
      }
    }
    // Decode the actual attributes.
    if (!this.decodeAllAttributes()) {
      return false;
    }
    if (!this.onAttributesDecoded()) {
      return false;
    }
    return true;
  }

  decodeAllAttributes() {
    for (let i = 0; i < this._attributesDecoders.length; i++) {
      if (!this._attributesDecoders[i].decodeAttributes(this._buffer)) {
        return false;
      }
    }
    return true;
  }

  onAttributesDecoded() {
    return true;
  }

  _decodeMetadata() {
    // Decode the geometry metadata from the bitstream. The content is not
    // surfaced on the output geometry, but it must be decoded so the bytes are
    // consumed and the rest of the bitstream stays aligned (otherwise a file
    // with metadata decodes to garbage / empty geometry).
    const metadata = new GeometryMetadata();
    const metadataDecoder = new MetadataDecoder();
    if (!metadataDecoder.decodeGeometryMetadata(this._buffer, metadata)) {
      return new Status(StatusCode.DRACO_ERROR, 'Failed to decode metadata.');
    }
    return okStatus();
  }

}

export { PointCloudDecoder };
