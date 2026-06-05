// compression/config/DecoderOptions.js - ported from compression/config/decoder_options.h

// C++ typedefs this as DracoOptions<GeometryAttribute::Type>; here attribute keys
// are plain integers handled natively by Map, so a bare subclass suffices.

import { DracoOptions } from './DracoOptions.js';

export class DecoderOptions extends DracoOptions {

  constructor() {
    super();
  }

}
