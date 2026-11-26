// First admin. Run once after schema.sql is applied:
//   DATABASE_URL=... ADMIN_NAME="..." ADMIN_EMAIL=... ADMIN_PASSWORD_FILE=/path/to/file node scripts/create-admin.mjs
// The password is read from a file (never from the command line or chat). The admin must change it at first login.
import fs from "fs";import { neon } from "@neondatabase/serverless";
const enc = new TextEncoder(), hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD_FILE } = process.env;
if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD_FILE) { console.error("missing env"); process.exit(1); }
const pw = fs.readFileSync(ADMIN_PASSWORD_FILE, "utf8").trim();
if (pw.length < 8) { console.error("password too short"); process.exit(1); }
const salt = hex(crypto.getRandomValues(new Uint8Array(8)));
const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
const h = salt + ":" + hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256));
const sql = neon(DATABASE_URL);
await sql`insert into users(name,email,password_hash,is_admin,must_change) values(${ADMIN_NAME},${ADMIN_EMAIL.toLowerCase()},${h},true,true) on conflict (email) do nothing`;
console.log("admin ready:", ADMIN_EMAIL.toLowerCase());
