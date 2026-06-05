// compression/entropy/ANSCoding.js - ported from compression/entropy/ans.h
// Asymmetric Numeral Systems (rANS), decode-only. http://arxiv.org/abs/1311.2540v2

export const ANS_P8_PRECISION = 256;
export const ANS_L_BASE = 4096;
export const ANS_IO_BASE = 256;

export function memGetLe16(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8);
}

export function memGetLe24(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

export function memGetLe32(buf, offset) {
  return (
    (buf[offset]) |
    (buf[offset + 1] << 8) |
    (buf[offset + 2] << 16) |
    ((buf[offset + 3] << 24) >>> 0) // >>> 0 to stay unsigned
  );
}

export class AnsDecoder {

  constructor() {
    this.buf = null; // Uint8Array
    this.bufOffset = 0;
    this.state = 0;
  }

}

// offset is the number of encoded bytes. Returns 0 on success, 1 on error.
export function ansReadInit(ans, buf, offset) {
  if (offset < 1) {
    return 1;
  }
  ans.buf = buf;
  const x = buf[offset - 1] >> 6;
  if (x === 0) {
    ans.bufOffset = offset - 1;
    ans.state = buf[offset - 1] & 0x3F;
  } else if (x === 1) {
    if (offset < 2) {
      return 1;
    }
    ans.bufOffset = offset - 2;
    ans.state = memGetLe16(buf, offset - 2) & 0x3FFF;
  } else if (x === 2) {
    if (offset < 3) {
      return 1;
    }
    ans.bufOffset = offset - 3;
    ans.state = memGetLe24(buf, offset - 3) & 0x3FFFFF;
  } else {
    return 1;
  }
  ans.state += ANS_L_BASE;
  if (ans.state >= ANS_L_BASE * ANS_IO_BASE) {
    return 1;
  }
  return 0;
}

export function ansReadEnd(ans) {
  return ans.state === ANS_L_BASE;
}

// rABS with descending spread. p0 is l_s from the paper; ANS_P8_PRECISION is m.
export function rabsDescRead(ans, p0) {
  const p = ANS_P8_PRECISION - p0;
  if (ans.state < ANS_L_BASE && ans.bufOffset > 0) {
    ans.state = (ans.state << 8) | ans.buf[--ans.bufOffset];
  }
  const x = ans.state;
  const quot = x >>> 8;  // /256 and %256: ANS_P8_PRECISION is always 256
  const rem = x & 0xFF;
  const xn = quot * p;
  const val = (rem < p) ? 1 : 0;
  if (val) {
    ans.state = xn + rem;
  } else {
    ans.state = x - xn - p;
  }
  return val;
}

export const rabsRead = rabsDescRead;

export class RAnsDecoder {

  constructor(ransPrecisionBits) {
    this.ransPrecisionBits = ransPrecisionBits;
    this.ransPrecision = 1 << ransPrecisionBits;
    this.ransPrecisionMask = this.ransPrecision - 1;
    this.lRansBase = this.ransPrecision * 4;
    this.lutTable = null; // Uint32Array
    this.probTable = null; // Uint32Array, flat
    this.cumProbTable = null; // Uint32Array, flat
    // State inlined (not a nested AnsDecoder) so the ransRead() hot loop touches own props.
    this.buf = null;
    this.bufOffset = 0;
    this.state = 0;
  }

  // offset is the number of bytes encoded. Returns 0 on success, non-zero on error.
  readInit(buf, offset) {
    if (offset < 1) {
      return 1;
    }
    this.buf = buf;
    const x = buf[offset - 1] >> 6;
    if (x === 0) {
      this.bufOffset = offset - 1;
      this.state = buf[offset - 1] & 0x3F;
    } else if (x === 1) {
      if (offset < 2) {
        return 1;
      }
      this.bufOffset = offset - 2;
      this.state = memGetLe16(buf, offset - 2) & 0x3FFF;
    } else if (x === 2) {
      if (offset < 3) {
        return 1;
      }
      this.bufOffset = offset - 3;
      this.state = memGetLe24(buf, offset - 3) & 0x3FFFFF;
    } else if (x === 3) {
      this.bufOffset = offset - 4;
      this.state = memGetLe32(buf, offset - 4) & 0x3FFFFFFF;
    } else {
      return 1;
    }
    this.state += this.lRansBase;
    if (this.state >= this.lRansBase * ANS_IO_BASE) {
      return 1;
    }
    return 0;
  }

  readEnd() {
    return this.state === this.lRansBase;
  }

  ransRead() {
    // Cache state in locals for the renormalization loop: read once, write back once.
    const buf = this.buf;
    const lRansBase = this.lRansBase;
    let state = this.state;
    let bufOffset = this.bufOffset;
    while (state < lRansBase && bufOffset > 0) {
      state = (state << 8) | buf[--bufOffset];
    }
    const quo = state >>> this.ransPrecisionBits;
    const rem = state & this.ransPrecisionMask;
    const symbol = this.lutTable[rem];
    this.state = quo * this.probTable[symbol] + rem - this.cumProbTable[symbol];
    this.bufOffset = bufOffset;
    return symbol;
  }

  // Batch ransRead() into out[0..count): all fields hoisted to locals, state
  // written back once. Removes per-symbol property reads and call indirection.
  decodeSymbols(out, count) {
    const buf = this.buf;
    const lRansBase = this.lRansBase;
    const ransPrecisionBits = this.ransPrecisionBits;
    const ransPrecisionMask = this.ransPrecisionMask;
    const lutTable = this.lutTable;
    const probTable = this.probTable;
    const cumProbTable = this.cumProbTable;
    let state = this.state;
    let bufOffset = this.bufOffset;
    for (let i = 0; i < count; ++i) {
      while (state < lRansBase && bufOffset > 0) {
        state = (state << 8) | buf[--bufOffset];
      }
      const rem = state & ransPrecisionMask;
      const symbol = lutTable[rem];
      out[i] = symbol;
      state = (state >>> ransPrecisionBits) * probTable[symbol] + rem - cumProbTable[symbol];
    }
    this.state = state;
    this.bufOffset = bufOffset;
  }

  // Builds the ransPrecision-entry lookup table. Returns false on bad input data.
  ransBuildLookUpTable(tokenProbs, numSymbols) {
    this.lutTable = new Uint32Array(this.ransPrecision);
    this.probTable = new Uint32Array(numSymbols);
    this.cumProbTable = new Uint32Array(numSymbols);
    let cumProb = 0;
    let actProb = 0;
    for (let i = 0; i < numSymbols; ++i) {
      this.probTable[i] = tokenProbs[i];
      this.cumProbTable[i] = cumProb;
      cumProb += tokenProbs[i];
      if (cumProb > this.ransPrecision) {
        return false;
      }
      this.lutTable.fill(i, actProb, cumProb);
      actProb = cumProb;
    }
    if (cumProb !== this.ransPrecision) {
      return false;
    }
    return true;
  }

}
