// A 401 account error must not revoke the independent device pairing.
export async function readAccountAuthError(response, signal) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers?.get("content-type") ?? "") || !response.body?.getReader) return null;
  const reader = response.body.getReader();
  try {
    const chunks = []; let size = 0;
    while (true) {
      const part = await reader.read();
      if (signal?.aborted) return null;
      if (part.done) break;
      if (!(part.value instanceof Uint8Array) || (size += part.value.byteLength) > 1024) return null;
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && Object.keys(value).join() === "error" && ["authentication-required", "unauthorized"].includes(value.error) ? value.error : null;
  } catch { return null; }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
