// core/BitUtils.js - ported from bit_utils.h/cc

// Branchless inlined zigzag decode: (val>>>1) ^ -(val&1) avoids a per-value call/branch.
export function convertSymbolsToSignedInts(input, count, output) {
  for (let i = 0; i < count; i++) {
    const val = input[i];
    output[i] = (val >>> 1) ^ -(val & 1);
  }
}

export function convertSymbolToSignedInt(val) {
  const isPositive = (val & 1) === 0;
  val >>>= 1;
  if (isPositive) {
    return val;
  }
  return -(val) - 1;
}
