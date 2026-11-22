import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function copyDir(from, to, label) {
  if (!existsSync(from)) {
    console.warn("Missing", from);
    return;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`Copied ${label}`);
}

copyDir(
  join(root, "src", "templates"),
  join(root, "dist", "templates"),
  "templates → dist/templates",
);

copyDir(
  join(root, "src", "admin", "public"),
  join(root, "dist", "admin", "public"),
  "admin UI → dist/admin/public",
);
