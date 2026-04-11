import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const targetTheme = process.argv[2] ?? "2077";
const outputRoot = "profile-summary-card-output";
const languageCardFile = join(outputRoot, targetTheme, "2-most-commit-language.svg");

const manualLanguageCard = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200">
  <style>
    * { font-family: 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; }
    .title { fill: #ff0055; font-size: 22px; }
    .label { fill: #03d8f3; font-size: 14px; }
    .tiny { fill: #8ca3ba; font-size: 10px; }
    .track { fill: #1b2232; }
  </style>
  <rect x="1" y="1" rx="5" ry="5" height="99%" width="99.41176470588235%" stroke="#141321" stroke-width="1" fill="#141321" stroke-opacity="1"/>
  <text x="30" y="40" class="title">Top Languages by Commit</text>

  <g transform="translate(30,58)">
    <rect y="0" width="12" height="12" fill="#26fc00"/>
    <text x="20" y="11" class="label">Python</text>
    <rect x="128" y="0" width="164" height="12" rx="6" class="track"/>
    <rect x="128" y="0" width="164" height="12" rx="6" fill="#26fc00"/>

    <rect y="26" width="12" height="12" fill="#0059ff"/>
    <text x="20" y="37" class="label">C++</text>
    <rect x="128" y="26" width="164" height="12" rx="6" class="track"/>
    <rect x="128" y="26" width="136" height="12" rx="6" fill="#0059ff"/>

    <rect y="52" width="12" height="12" fill="#E38C00"/>
    <text x="20" y="63" class="label">SQL</text>
    <rect x="128" y="52" width="164" height="12" rx="6" class="track"/>
    <rect x="128" y="52" width="112" height="12" rx="6" fill="#E38C00"/>

    <rect y="78" width="12" height="12" fill="#F1E05A"/>
    <text x="20" y="89" class="label">JavaScript</text>
    <rect x="128" y="78" width="164" height="12" rx="6" class="track"/>
    <rect x="128" y="78" width="90" height="12" rx="6" fill="#F1E05A"/>

    <rect y="104" width="12" height="12" fill="#c60fdf"/>
    <text x="20" y="115" class="label">Rust</text>
    <rect x="128" y="104" width="164" height="12" rx="6" class="track"/>
    <rect x="128" y="104" width="72" height="12" rx="6" fill="#c60fdf"/>
  </g>
</svg>
`;

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

await writeFile(languageCardFile, manualLanguageCard, "utf8");
