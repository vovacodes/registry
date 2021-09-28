/**
 * @param arrayString {{ bytes: Array, len: import("@project-serum/anchor").BN }}
 * @return {string}
 */
export function stringFromArrayString(arrayString) {
  const decoder = new TextDecoder();
  return decoder.decode(
    Uint8Array.from(arrayString.bytes.slice(0, arrayString.len.toNumber()))
  );
}
