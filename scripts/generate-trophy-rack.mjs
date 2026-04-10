import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const outputPath = process.argv[2] ?? "assets/generated/trophy-rack.svg";
const username = process.argv[3] ?? process.env.GITHUB_REPOSITORY_OWNER ?? "yeaight7";
const token = process.env.GHRS_PAT ?? process.env.GITHUB_TOKEN ?? "";

const now = new Date();
const yearAgo = new Date(now);
yearAgo.setUTCFullYear(now.getUTCFullYear() - 1);

async function fetchGraphQL(cursor = null) {
  const query = `
    query TrophyRack($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        followers {
          totalCount
        }
        repositories(
          ownerAffiliations: OWNER
          privacy: PUBLIC
          isFork: false
          first: 100
          after: $cursor
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            stargazerCount
          }
        }
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "yeaight7-readme-trophy-rack",
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        cursor,
        from: yearAgo.toISOString(),
        to: now.toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data.user;
}

async function collectMetrics() {
  if (!token) {
    return null;
  }

  let cursor = null;
  let totalStars = 0;
  let followers = 0;
  let publicRepos = 0;
  let contributions = 0;

  while (true) {
    const user = await fetchGraphQL(cursor);
    followers = user.followers.totalCount;
    publicRepos = user.repositories.totalCount;
    contributions = user.contributionsCollection.contributionCalendar.totalContributions;
    totalStars += user.repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);

    if (!user.repositories.pageInfo.hasNextPage) {
      break;
    }

    cursor = user.repositories.pageInfo.endCursor;
  }

  return {
    followers,
    publicRepos,
    stars: totalStars,
    contributions,
    placeholder: false,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatValue(value) {
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }

  return value;
}

function renderTrophyRack(metrics) {
  const tiles = [
    { label: "FOLLOWERS", value: metrics ? formatValue(metrics.followers) : "--", accent: "#00E7FF" },
    { label: "PUBLIC REPOS", value: metrics ? formatValue(metrics.publicRepos) : "--", accent: "#FFE66D" },
    { label: "STARS EARNED", value: metrics ? formatValue(metrics.stars) : "--", accent: "#FF4DA6" },
    { label: "CONTRIBUTIONS 12M", value: metrics ? formatValue(metrics.contributions) : "SYNC", accent: "#7CFFB2" },
  ];

  const tileSvg = tiles
    .map((tile, index) => {
      const x = 28 + index * 172;
      return `
  <g transform="translate(${x} 88)">
    <rect width="148" height="102" rx="18" fill="#0E1524" stroke="#26374C"/>
    <rect x="16" y="18" width="32" height="6" rx="3" fill="${tile.accent}" opacity="0.95"/>
    <text x="16" y="45" class="tile-label">${escapeXml(tile.label)}</text>
    <text x="16" y="82" class="tile-value">${escapeXml(tile.value)}</text>
  </g>`;
    })
    .join("");

  const footer = metrics
    ? "LIVE VALUES / GENERATED FROM GITHUB GRAPHQL"
    : "BOOTSTRAP PLACEHOLDER / SET GHRS_PAT AND RUN THE WORKFLOW";

  return `<svg width="720" height="282" viewBox="0 0 720 282" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Trophy rack</title>
  <desc id="desc">Cyberpunk trophy rack generated for the GitHub profile README.</desc>
  <defs>
    <linearGradient id="bg" x1="24" y1="18" x2="696" y2="264" gradientUnits="userSpaceOnUse">
      <stop stop-color="#101626"/>
      <stop offset="1" stop-color="#070A11"/>
    </linearGradient>
    <linearGradient id="edge" x1="18" y1="18" x2="702" y2="264" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00E7FF"/>
      <stop offset="0.5" stop-color="#FF4DA6"/>
      <stop offset="1" stop-color="#FFE66D"/>
    </linearGradient>
    <style>
      .tiny { fill:#8CA3BA; font:700 12px 'Courier New', monospace; letter-spacing:2px; }
      .hud { fill:#94F4FF; font:800 15px 'Segoe UI', Tahoma, sans-serif; letter-spacing:3px; }
      .tile-label { fill:#93A9C0; font:700 12px 'Courier New', monospace; letter-spacing:1.6px; }
      .tile-value { fill:#FFFFFF; font:900 31px 'Arial Black', 'Segoe UI', sans-serif; }
      .dash { stroke-dasharray:12 8; animation:dash 18s linear infinite; }
      .pulse { animation:pulse 3s ease-in-out infinite; }
      @keyframes dash { to { stroke-dashoffset:-240; } }
      @keyframes pulse {
        0%, 100% { opacity:0.32; }
        50% { opacity:0.95; }
      }
    </style>
  </defs>
  <rect width="720" height="282" rx="24" fill="url(#bg)"/>
  <rect x="18" y="18" width="684" height="246" rx="18" fill="none" stroke="url(#edge)" stroke-width="2.5" class="dash"/>
  <rect x="32" y="32" width="656" height="218" rx="16" fill="none" stroke="#27364A"/>
  <text x="30" y="60" class="hud">TROPHY RACK</text>
  <text x="30" y="79" class="tiny">${escapeXml(footer)}</text>
  <rect x="28" y="30" width="664" height="8" fill="#00E7FF" opacity="0.06" class="pulse"/>
  <line x1="32" y1="206" x2="688" y2="206" stroke="#26374C"/>
  <text x="30" y="236" class="tiny">LIVE SIGNAL / FOLLOWERS + REPOS + STARS + YEARLY OUTPUT</text>
  <text x="30" y="258" class="tiny">SELF-HOSTED SVG / NO THIRD-PARTY TROPHY HOST</text>
  ${tileSvg}
</svg>`;
}

let metrics = null;
try {
  metrics = await collectMetrics();
} catch (error) {
  console.error(error.message);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, renderTrophyRack(metrics), "utf8");
