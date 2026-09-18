/**
 * unpdf rejects a Node Buffer, but `new Uint8Array(buf)` copies the whole file.
 * This is a view over the same memory. byteOffset/byteLength are required:
 * Node pools small buffers, so `buf.buffer` is often a larger shared block.
 */
export function toUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
}
