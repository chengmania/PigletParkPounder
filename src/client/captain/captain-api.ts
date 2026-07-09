export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

export async function postJson<T = unknown>(path: string, payload: unknown): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export async function getJson<T = unknown>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(path, { credentials: 'same-origin' });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

// For uploading a raw file body (e.g. a CSV) rather than a JSON payload --
// the file name goes in a header since the body itself is the file content.
export async function postFile<T = unknown>(path: string, text: string, fileName: string): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv', 'X-File-Name': fileName },
    body: text,
    credentials: 'same-origin',
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

// Binary-safe sibling of postFile -- for a zip (or any non-text upload),
// reading the file as text first (as postFile does for CSVs) would corrupt
// it via UTF-8 decoding. Passing the Blob/File straight through as the fetch
// body preserves it byte-for-byte. extraHeaders lets a caller pass something
// like a provider/country id alongside the file name.
export async function postBinaryFile<T = unknown>(
  path: string,
  body: Blob,
  fileName: string,
  extraHeaders?: Record<string, string>,
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip', 'X-File-Name': fileName, ...extraHeaders },
    body,
    credentials: 'same-origin',
  });
  let responseBody: T | null = null;
  try {
    responseBody = (await res.json()) as T;
  } catch {
    responseBody = null;
  }
  return { ok: res.ok, status: res.status, body: responseBody };
}
