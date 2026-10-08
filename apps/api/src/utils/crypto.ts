import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [scheme, salt64, hash64] = encoded.split("$");
  if (scheme !== "scrypt" || !salt64 || !hash64) return false;
  const derived = (await scrypt(
    password,
    Buffer.from(salt64, "base64url"),
    64,
  )) as Buffer;
  const expected = Buffer.from(hash64, "base64url");
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(secret: string, plaintext: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(secret: string, encoded: string): string {
  const [iv64, tag64, cipher64] = encoded.split(".");
  if (!iv64 || !tag64 || !cipher64) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFromSecret(secret),
    Buffer.from(iv64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipher64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
