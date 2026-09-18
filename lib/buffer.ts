/**
 * A view over the same memory - no copy. Only safe for consumers that read the
 * bytes and do not take ownership. byteOffset/byteLength are required: Node
 * pools small buffers, so `buf.buffer` is often a larger shared block.
 */
export function toUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * An independent copy. pdf.js transfers and detaches the buffer it is given, so
 * anything parsing a PDF must hand over a copy or the cached original becomes
 * unusable for every later read.
 */
export function copyToUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}
