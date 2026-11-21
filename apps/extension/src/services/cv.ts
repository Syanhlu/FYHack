/// <reference types="vite/client" />
import { redactText, type UserContext } from '@profile-lens/contracts';

export interface SavedCv {
  name: string;
  text: string;
}
const CHUNK = 600;
const MAX_CHUNKS = 10;

export async function readCv(file: File): Promise<SavedCv> {
  let raw: string;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    // Loaded on demand so pdf.js only ships to the panel when someone uploads a CV.
    const [{ GlobalWorkerOptions, getDocument }, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    raw = pages.join(' ');
  } else raw = await file.text();
  const text = redactText(raw).slice(0, CHUNK * MAX_CHUNKS);
  if (text.length < 40) throw new Error('No readable text was found in that file.');
  return { name: file.name.slice(0, 120), text };
}

/** Splits CV text into cited user-context items at word boundaries. */
export function cvContext(text: string): UserContext {
  const items: UserContext = [];
  let rest = text.trim();
  while (rest && items.length < MAX_CHUNKS) {
    let cut = rest.length <= CHUNK ? rest.length : rest.lastIndexOf(' ', CHUNK);
    if (cut <= 0) cut = CHUNK;
    items.push({ id: `c${items.length + 1}`, kind: 'cv', text: rest.slice(0, cut).trim() });
    rest = rest.slice(cut).trim();
  }
  return items;
}
