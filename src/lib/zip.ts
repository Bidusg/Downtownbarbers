/**
 * Passordbeskyttet ZIP (kun server / Node-runtime).
 *
 * Pakker en PDF-buffer i en ZIP kryptert med ZipCrypto (`zip20`). Denne
 * krypteringsmetoden åpnes universelt av Windows Utforsker, macOS og
 * telefon uten ekstra programvare – i motsetning til AES-ZIP.
 *
 * Formatet registreres kun én gang per prosess.
 */
import archiver from "archiver";
import encrypted from "archiver-zip-encrypted";

let registered = false;
function ensureFormat() {
  if (!registered) {
    try {
      archiver.registerFormat("zip-encrypted", encrypted);
    } catch {
      // Allerede registrert i denne prosessen – trygt å ignorere.
    }
    registered = true;
  }
}

/**
 * Pakker `pdf` i en passordbeskyttet ZIP med filnavnet `filename` inni.
 * Returnerer den ferdige ZIP-en som Buffer.
 */
export async function zipWithPassword(
  pdf: Buffer,
  filename: string,
  password: string,
): Promise<Buffer> {
  ensureFormat();
  const a = archiver("zip-encrypted", {
    zlib: { level: 8 },
    encryptionMethod: "zip20",
    password,
  });
  const chunks: Buffer[] = [];
  a.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    a.on("end", () => res(Buffer.concat(chunks)));
    a.on("error", rej);
  });
  a.append(pdf, { name: filename });
  await a.finalize();
  return done;
}
