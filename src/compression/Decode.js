// compression/Decode.js - ported from compression/decode.h/cc

import {
  EncodedGeometryType,
  MeshEncoderMethod,
  DracoHeader
} from './config/CompressionShared.js';
import { DecoderOptions } from './config/DecoderOptions.js';
import { DecoderBuffer } from '../core/DecoderBuffer.js';
import { PointCloud } from '../point_cloud/PointCloud.js';
import { Mesh } from '../mesh/Mesh.js';

import { MeshSequentialDecoder } from './mesh/MeshSequentialDecoder.js';
import { MeshEdgebreakerDecoder } from './mesh/MeshEdgebreakerDecoder.js';
import { PointCloudDecoder } from './point_cloud/PointCloudDecoder.js';

// Reads the Draco header from a read-only copy of inBuffer (without advancing
// the original), so the geometry type can be checked before picking a decoder.
// Reuses PointCloudDecoder.decodeHeader and adapts its Status to a plain object.
// Returns { ok, header, message }.
function peekHeader(inBuffer) {

  const tempBuffer = new DecoderBuffer();
  tempBuffer.init(inBuffer.data, inBuffer.data.length);
  tempBuffer.bitstreamVersion = inBuffer.bitstreamVersion;
  // Restore position to match the original buffer's current position.
  tempBuffer.advance(inBuffer.decodedSize);

  const header = new DracoHeader();
  const status = PointCloudDecoder.decodeHeader(tempBuffer, header);
  return { ok: status.ok(), header, message: status.errorMsg };

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

    const result = peekHeader(inBuffer);
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

  // Point-cloud geometry decoding is not implemented (only triangle meshes are
  // supported). The point-cloud-specific decoders are intentionally absent; the
  // shared PointCloudDecoder base only backs the mesh decoders.
  // Returns { ok, message }.
  decodeBufferToPointCloud() {

    return { ok: false, message: 'Point cloud decoding is not supported.' };

  }

  // Decodes the buffer into a provided Mesh geometry.
  // Returns { ok, message }.
  decodeBufferToMesh(inBuffer, outGeometry) {

    const result = peekHeader(inBuffer);
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

export { Decoder };
