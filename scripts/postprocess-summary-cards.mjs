import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const targetTheme = process.argv[2] ?? "2077";
const outputRoot = "profile-summary-card-output";

const replacements = [
  {
    file: join(outputRoot, targetTheme, "4-productive-time.svg"),
    search: />Commits \(UTC [^<]+\)</g,
    replace: ">Commits<",
  },
  {
    file: join(outputRoot, targetTheme, "0-profile-details.svg"),
    search: />[^<]+ \([^)]+\)</g,
    replace: ">Contributions<",
  },
];

for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== targetTheme) {
    await rm(join(outputRoot, entry.name), { recursive: true, force: true });
  }
}

await rm(join(outputRoot, "README.md"), { force: true });
await rm(join(outputRoot, targetTheme, "README.md"), { force: true });
await rm(join(outputRoot, targetTheme, "1-repos-per-language.svg"), { force: true });

for (const item of replacements) {
  const source = await readFile(item.file, "utf8");
  await writeFile(item.file, source.replace(item.search, item.replace), "utf8");
}
