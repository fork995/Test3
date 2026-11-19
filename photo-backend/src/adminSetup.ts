import { readFileSync, writeFileSync } from "node:fs";
import { hashAdminPassword } from "./admin.js";

const destination = process.argv[2];
if (!destination) throw Error("Pass destination outside repository as first argument");
process.umask(0o077);
const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
const record = await hashAdminPassword(password);
writeFileSync(destination, record + "\n", { mode: 0o600, flag: "wx" });
process.stdout.write("Admin password hash saved.\n");
