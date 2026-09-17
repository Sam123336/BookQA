const pdfStore = new Map<string, Buffer>();

export function fsStorePdf(id: string, buffer: Buffer) {
  pdfStore.set(id, buffer);
}

export function fsGetPdf(id: string): Buffer | undefined {
  return pdfStore.get(id);
}
