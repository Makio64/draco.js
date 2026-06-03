// core/BitUtils.js - ported from bit_utils.h/cc

// Converts an array of unsigned symbols back to signed int32 values.
// Branchless zigzag decode, inlined: for even val -> val>>>1, for odd val ->
// -(val>>>1)-1. (val >>> 1) ^ -(val & 1) yields exactly that without a per-value
// call or branch.
export function convertSymbolsToSignedInts(input, count, output) {
  for (let i = 0; i < count; i++) {
    const val = input[i];
    output[i] = (val >>> 1) ^ -(val & 1);
  }
}

// Converts a single unsigned symbol back to a signed integer (zigzag decoding).
export function convertSymbolToSignedInt(val) {
  const isPositive = (val & 1) === 0;
  val >>>= 1;
  if (isPositive) {
    return val;
  }
  return -(val) - 1;
}
