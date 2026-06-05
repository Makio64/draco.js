// compression/Decode.js - ported from compression/decode.h/cc

import {
  EncodedGeometryType,
  PointCloudEncodingMethod,
  MeshEncoderMethod,
  DracoHeader
} from './config/CompressionShared.js';
import { DecoderOptions } from './config/DecoderOptions.js';
import { DecoderBuffer } from '../core/DecoderBuffer.js';
import { PointCloud } from '../point_cloud/PointCloud.js';
import { Mesh } from '../mesh/Mesh.js';

import { PointCloudSequentialDecoder } from './point_cloud/PointCloudSequentialDecoder.js';
import { PointCloudKdTreeDecoder } from './point_cloud/PointCloudKdTreeDecoder.js';
import { MeshSequentialDecoder } from './mesh/MeshSequentialDecoder.js';
import { MeshEdgebreakerDecoder } from './mesh/MeshEdgebreakerDecoder.js';

// Decodes the Draco header from the buffer. Returns { header, ok, message }.
function decodeHeader(buffer) {

  const header = new DracoHeader();

  // Read 5-byte magic string "DRACO"
  for (let i = 0; i < 5; ++i) {

    const byte = buffer.decodeInt8();
    if (byte === undefined) {
      return { header: null, ok: false, message: 'Failed to read header magic bytes.' };
    }

    header.dracoString[i] = byte;

  }

  // Verify magic string
  const magic = String.fromCharCode(
    header.dracoString[0] & 0xFF,
    header.dracoString[1] & 0xFF,
    header.dracoString[2] & 0xFF,
    header.dracoString[3] & 0xFF,
    header.dracoString[4] & 0xFF
  );

  if (magic !== 'DRACO') {
    return { header: null, ok: false, message: 'Not a Draco encoded file.' };
  }

  // Read version
  header.versionMajor = buffer.decodeUint8();
  if (header.versionMajor === undefined) {
    return { header: null, ok: false, message: 'Failed to read version major.' };
  }

  header.versionMinor = buffer.decodeUint8();
  if (header.versionMinor === undefined) {
    return { header: null, ok: false, message: 'Failed to read version minor.' };
  }

  // Read encoder type
  header.encoderType = buffer.decodeUint8();
  if (header.encoderType === undefined) {
    return { header: null, ok: false, message: 'Failed to read encoder type.' };
  }

  // Read encoder method
  header.encoderMethod = buffer.decodeUint8();
  if (header.encoderMethod === undefined) {
    return { header: null, ok: false, message: 'Failed to read encoder method.' };
  }

  // Read flags
  header.flags = buffer.decodeUint16();
  if (header.flags === undefined) {
    return { header: null, ok: false, message: 'Failed to read flags.' };
  }

  return { header, ok: true, message: '' };

}

// Creates a point cloud decoder based on the encoding method.
function createPointCloudDecoder(method) {

  if (method === PointCloudEncodingMethod.POINT_CLOUD_SEQUENTIAL_ENCODING) {

    return new PointCloudSequentialDecoder();

  } else if (method === PointCloudEncodingMethod.POINT_CLOUD_KD_TREE_ENCODING) {

    return new PointCloudKdTreeDecoder();

  }

  throw new Error('Unsupported point cloud encoding method.');

}

// Creates a mesh decoder based on the encoding method.
function createMeshDecoder(method) {

  if (method === MeshEncoderMethod.MESH_SEQUENTIAL_ENCODING) {

    return new MeshSequentialDecoder();

  } else if (method === MeshEncoderMethod.MESH_EDGEBREAKER_ENCODING) {

    return new MeshEdgebreakerDecoder();

  }

  throw new Error('Unsupported mesh encoding method.');

}

// Class responsible for decoding meshes and point clouds that were
// compressed by a Draco encoder.
class Decoder {

  constructor() {

    this.options_ = new DecoderOptions();

  }

  // Returns the geometry type encoded in the input buffer.
  // The return value is one of EncodedGeometryType values:
  // POINT_CLOUD, TRIANGULAR_MESH, or INVALID_GEOMETRY_TYPE on error.
  static getEncodedGeometryType(inBuffer) {

    // Use a copy of the buffer so we don't advance the original position.
    const tempBuffer = new DecoderBuffer();
    tempBuffer.init(inBuffer.data, inBuffer.data.length);
    tempBuffer.bitstreamVersion = inBuffer.bitstreamVersion;
    // Restore position to match the original buffer's current position.
    tempBuffer.advance(inBuffer.decodedSize);

    const result = decodeHeader(tempBuffer);
    if (!result.ok) {
      return EncodedGeometryType.INVALID_GEOMETRY_TYPE;
    }

    if (result.header.encoderType >= EncodedGeometryType.NUM_ENCODED_GEOMETRY_TYPES) {
      return EncodedGeometryType.INVALID_GEOMETRY_TYPE;
    }

    return result.header.encoderType;

  }

  // Decodes point cloud from the provided buffer. If the input contains a
  // mesh, the returned instance will be a Mesh (which extends PointCloud).
  // Returns { pointCloud, ok, message }.
  decodePointCloudFromBuffer(inBuffer) {

    const type = Decoder.getEncodedGeometryType(inBuffer);

    if (type === EncodedGeometryType.POINT_CLOUD) {

      const pointCloud = new PointCloud();
      const status = this.decodeBufferToPointCloud(inBuffer, pointCloud);
      if (!status.ok) {
        return { pointCloud: null, ok: false, message: status.message };
      }

      return { pointCloud, ok: true, message: '' };

    } else if (type === EncodedGeometryType.TRIANGULAR_MESH) {

      const mesh = new Mesh();
      const status = this.decodeBufferToMesh(inBuffer, mesh);
      if (!status.ok) {
        return { pointCloud: null, ok: false, message: status.message };
      }

      return { pointCloud: mesh, ok: true, message: '' };

    }

    return { pointCloud: null, ok: false, message: 'Unsupported geometry type.' };

  }

  // Decodes a triangular mesh from the provided buffer.
  // Returns { mesh, ok, message }.
  decodeMeshFromBuffer(inBuffer) {

    const mesh = new Mesh();
    const status = this.decodeBufferToMesh(inBuffer, mesh);
    if (!status.ok) {
      return { mesh: null, ok: false, message: status.message };
    }

    return { mesh, ok: true, message: '' };

  }

  // Decodes the buffer into a provided PointCloud geometry.
  // Returns { ok, message }.
  decodeBufferToPointCloud(inBuffer, outGeometry) {

    // Read header from a temporary copy to check type without advancing inBuffer.
    const tempBuffer = new DecoderBuffer();
    tempBuffer.init(inBuffer.data, inBuffer.data.length);
    tempBuffer.bitstreamVersion = inBuffer.bitstreamVersion;
    tempBuffer.advance(inBuffer.decodedSize);

    const result = decodeHeader(tempBuffer);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    if (result.header.encoderType !== EncodedGeometryType.POINT_CLOUD) {
      return { ok: false, message: 'Input is not a point cloud.' };
    }

    const decoder = createPointCloudDecoder(result.header.encoderMethod);
    return decoder.decode(this.options_, inBuffer, outGeometry);

  }

  // Decodes the buffer into a provided Mesh geometry.
  // Returns { ok, message }.
  decodeBufferToMesh(inBuffer, outGeometry) {

    // Read header from a temporary copy to check type without advancing inBuffer.
    const tempBuffer = new DecoderBuffer();
    tempBuffer.init(inBuffer.data, inBuffer.data.length);
    tempBuffer.bitstreamVersion = inBuffer.bitstreamVersion;
    tempBuffer.advance(inBuffer.decodedSize);

    const result = decodeHeader(tempBuffer);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    if (result.header.encoderType !== EncodedGeometryType.TRIANGULAR_MESH) {
      return { ok: false, message: 'Input is not a mesh.' };
    }

    const decoder = createMeshDecoder(result.header.encoderMethod);
    return decoder.decodeMesh(this.options_, inBuffer, outGeometry);

  }

  // Returns the options instance used by the decoder.
  options() {

    return this.options_;

  }

}

export { Decoder, decodeHeader };
