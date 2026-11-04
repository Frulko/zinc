import * as storage from 'zinc:storage';
import { Document, initialDocument, readDocument } from '../model';

const DOCUMENT_KEY = 'dev.zinc.clear.document.v1';

export function loadDocument(): Document {
  const text = storage.get(DOCUMENT_KEY);
  return text === '' ? initialDocument() : readDocument(text);
}

export function saveDocument(document: Document): void {
  storage.set(DOCUMENT_KEY, JSON.stringify(document));
}
