import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const statsPath = process.argv[2] ?? "assets/generated/stats.svg";
const languagesPath = process.argv[3] ?? "assets/generated/languages.svg";
const username = process.argv[4] ?? process.env.GITHUB_REPOSITORY_OWNER ?? "yeaight7";
const token = process.env.GHRS_PAT ?? process.env.GITHUB_TOKEN ?? "";

const now = new Date();
const yearAgo = new Date(now);
yearAgo.setUTCFullYear(now.getUTCFullYear() - 1);

async function fetchGraphQL(cursor = null) {
  const query = `
    query TelemetryCards($login: String!, $cursor: String, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        followers {
          totalCount
        }
        publicRepos: repositories(
          ownerAffiliations: OWNER
          privacy: PUBLIC
          isFork: false
          first: 1
        ) {
          totalCount
        }
        repositories(
          ownerAffiliations: OWNER
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
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
              edges {
                size
                node {
                  color
                  name
                }
              }
            }
          }
        }
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
          }
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "yeaight7-readme-telemetry",
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

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatValue(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : String(value);
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

async function collectTelemetry() {
  if (!token) {
    return null;
  }

  let cursor = null;
  let followers = 0;
  let repoCount = 0;
  let publicRepoCount = 0;
  let totalStars = 0;
  let totalContributions = 0;
  let commits = 0;
  let issues = 0;
  let pullRequests = 0;
  let reviews = 0;
  const languages = new Map();

  while (true) {
    const user = await fetchGraphQL(cursor);
    followers = user.followers.totalCount;
    repoCount = user.repositories.totalCount;
    publicRepoCount = user.publicRepos.totalCount;
    totalContributions = user.contributionsCollection.contributionCalendar.totalContributions;
    commits = user.contributionsCollection.totalCommitContributions;
    issues = user.contributionsCollection.totalIssueContributions;
    pullRequests = user.contributionsCollection.totalPullRequestContributions;
    reviews = user.contributionsCollection.totalPullRequestReviewContributions;

    for (const repo of user.repositories.nodes) {
      totalStars += repo.stargazerCount;
      for (const edge of repo.languages.edges) {
        const previous = languages.get(edge.node.name) ?? { size: 0, color: edge.node.color || "#8CA3BA" };
        previous.size += edge.size;
        if (!previous.color && edge.node.color) {
          previous.color = edge.node.color;
        }
        languages.set(edge.node.name, previous);
      }
    }

    if (!user.repositories.pageInfo.hasNextPage) {
      break;
    }

    cursor = user.repositories.pageInfo.endCursor;
  }

  return {
    followers,
    repoCount,
    publicRepoCount,
    privateRepoCount: Math.max(0, repoCount - publicRepoCount),
    totalStars,
    totalContributions,
    commits,
    issues,
    pullRequests,
    reviews,
    languages: [...languages.entries()]
      .map(([name, value]) => ({ name, color: value.color || "#8CA3BA", size: value.size }))
      .sort((left, right) => right.size - left.size)
      .slice(0, 6),
  };
}

function renderStatsCard(metrics) {
  const tiles = metrics
    ? [
        { label: "OWNED REPOS", value: formatValue(metrics.repoCount), accent: "#00E7FF" },
        { label: "PRIVATE REPOS", value: formatValue(metrics.privateRepoCount), accent: "#7CFFB2" },
        { label: "STARS EARNED", value: formatValue(metrics.totalStars), accent: "#FFE66D" },
        { label: "FOLLOWERS", value: formatValue(metrics.followers), accent: "#FF4DA6" },
      ]
    : [
        { label: "TOKEN", value: "GHRS_PAT", accent: "#00E7FF" },
        { label: "MODE", value: "BOOT", accent: "#7CFFB2" },
        { label: "SYNC", value: "PENDING", accent: "#FFE66D" },
        { label: "STATE", value: "LOCAL", accent: "#FF4DA6" },
      ];

  const secondary = metrics
    ? [
        { label: "COMMITS 12M", value: formatValue(metrics.commits), accent: "#00E7FF" },
        { label: "PRS 12M", value: formatValue(metrics.pullRequests), accent: "#FF4DA6" },
        { label: "REVIEWS 12M", value: formatValue(metrics.reviews), accent: "#7CFFB2" },
        { label: "ISSUES 12M", value: formatValue(metrics.issues), accent: "#FFE66D" },
      ]
    : [
        { label: "COMMITS 12M", value: "--", accent: "#00E7FF" },
        { label: "PRS 12M", value: "--", accent: "#FF4DA6" },
        { label: "REVIEWS 12M", value: "--", accent: "#7CFFB2" },
        { label: "ISSUES 12M", value: "--", accent: "#FFE66D" },
      ];

  const topTiles = tiles
    .map((tile, index) => {
      const x = 32 + index * 166;
      return `
  <g transform="translate(${x} 96)">
    <rect width="150" height="86" rx="18" fill="#0E1524" stroke="#26374C"/>
    <rect x="18" y="18" width="34" height="6" rx="3" fill="${tile.accent}" opacity="0.95"/>
    <text x="18" y="43" class="tiny">${escapeXml(tile.label)}</text>
    <text x="18" y="72" class="value">${escapeXml(tile.value)}</text>
  </g>`;
    })
    .join("");

  const lowerTiles = secondary
    .map((tile, index) => {
      const x = 42 + index * 162;
      return `
  <g transform="translate(${x} 218)">
    <text x="0" y="0" class="tiny" fill="${tile.accent}">${escapeXml(tile.label)}</text>
    <text x="0" y="28" class="subvalue">${escapeXml(tile.value)}</text>
  </g>`;
    })
    .join("");

  const footer = metrics
    ? `LIVE OWNER METRICS / ${escapeXml(username.toUpperCase())} / GENERATED IN ACTIONS`
    : "BOOTSTRAP PLACEHOLDER / GHRS_PAT REQUIRED FOR PRIVATE TELEMETRY";

  return `<svg width="720" height="282" viewBox="0 0 720 282" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Neon telemetry card</title>
  <desc id="desc">Self-hosted GitHub telemetry card for the profile README.</desc>
  <defs>
    <linearGradient id="bg" x1="20" y1="16" x2="700" y2="266" gradientUnits="userSpaceOnUse">
      <stop stop-color="#101626"/>
      <stop offset="1" stop-color="#070A11"/>
    </linearGradient>
    <linearGradient id="edge" x1="22" y1="18" x2="698" y2="264" gradientUnits="userSpaceOnUse">
      <stop stop-color="#00E7FF"/>
      <stop offset="0.5" stop-color="#FF4DA6"/>
      <stop offset="1" stop-color="#FFE66D"/>
    </linearGradient>
    <style>
      .hud { fill:#FFFFFF; font:900 22px 'Arial Black', 'Segoe UI', sans-serif; letter-spacing:2px; }
      .tiny { fill:#8CA3BA; font:700 12px 'Courier New', monospace; letter-spacing:1.5px; }
      .value { fill:#FFFFFF; font:900 28px 'Arial Black', 'Segoe UI', sans-serif; }
      .subvalue { fill:#E6EDF3; font:800 24px 'Segoe UI', Tahoma, sans-serif; }
      .dash { stroke-dasharray:12 8; animation:dash 18s linear infinite; }
      .pulse { animation:pulse 3s ease-in-out infinite; }
      @keyframes dash { to { stroke-dashoffset:-240; } }
      @keyframes pulse {
        0%, 100% { opacity:0.22; }
        50% { opacity:0.92; }
      }
    </style>
  </defs>
  <rect width="720" height="282" rx="24" fill="url(#bg)"/>
  <rect x="18" y="18" width="684" height="246" rx="18" fill="none" stroke="url(#edge)" stroke-width="2.5" class="dash"/>
  <rect x="32" y="32" width="656" height="218" rx="16" fill="none" stroke="#27364A"/>
  <rect x="28" y="28" width="664" height="10" fill="#00E7FF" opacity="0.07" class="pulse"/>
  <text x="32" y="62" class="hud">NEON TELEMETRY</text>
  <text x="32" y="82" class="tiny">${escapeXml(footer)}</text>
  ${topTiles}
  <line x1="36" y1="202" x2="684" y2="202" stroke="#26374C"/>
  <text x="42" y="242" class="tiny">TOTAL CONTRIBUTIONS 12M</text>
  <text x="42" y="270" class="subvalue">${escapeXml(metrics ? formatValue(metrics.totalContributions) : "--")}</text>
  ${lowerTiles}
</svg>`;
}

function renderLanguagesCard(metrics) {
  const languages = metrics?.languages?.length
    ? metrics.languages
    : [
        { name: "SET GHRS_PAT", color: "#00E7FF", size: 40 },
        { name: "RUN WORKFLOW", color: "#FF4DA6", size: 30 },
        { name: "SYNC CACHE", color: "#FFE66D", size: 20 },
        { name: "SHOW DONUT", color: "#7CFFB2", size: 10 },
      ];

  const total = languages.reduce((sum, language) => sum + language.size, 0);
  let angle = -90;
  const donut = languages
    .map((language) => {
      const share = total === 0 ? 0 : (language.size / total) * 360;
      const gap = Math.min(share * 0.08, 3);
      const startAngle = angle + gap / 2;
      const endAngle = angle + share - gap / 2;
      angle += share;
      return `<path d="${describeArc(172, 150, 74, startAngle, endAngle)}" stroke="${language.color}" stroke-width="26" stroke-linecap="round" fill="none"/>`;
    })
    .join("");

  const bars = languages
    .map((language, index) => {
      const y = 72 + index * 30;
      const percent = total === 0 ? 0 : (language.size / total) * 100;
      const width = Math.max(18, Math.round((percent / 100) * 270));
      return `
  <g transform="translate(344 ${y})">
    <circle cx="8" cy="8" r="5" fill="${language.color}"/>
    <text x="24" y="11" class="lang-name">${escapeXml(language.name)}</text>
    <rect x="0" y="18" width="282" height="10" rx="5" fill="#142033"/>
    <rect x="0" y="18" width="${width}" height="10" rx="5" fill="${language.color}"/>
    <text x="292" y="27" class="lang-value">${escapeXml(`${percent.toFixed(1)}%`)}</text>
  </g>`;
    })
    .join("");

  const footer = metrics
    ? "OWNED REPOS / LANGUAGE WEIGHT BY BYTES / SELF-HOSTED"
    : "BOOTSTRAP PLACEHOLDER / REAL VALUES ARRIVE AFTER ACTIONS SYNC";

  return `<svg width="720" height="282" viewBox="0 0 720 282" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Language radar card</title>
  <desc id="desc">Self-hosted top languages card for the profile README.</desc>
  <defs>
    <linearGradient id="bg" x1="22" y1="18" x2="700" y2="264" gradientUnits="userSpaceOnUse">
      <stop stop-color="#101626"/>
      <stop offset="1" stop-color="#070A11"/>
    </linearGradient>
    <linearGradient id="edge" x1="22" y1="18" x2="698" y2="264" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFE66D"/>
      <stop offset="0.5" stop-color="#00E7FF"/>
      <stop offset="1" stop-color="#FF4DA6"/>
    </linearGradient>
    <style>
      .hud { fill:#FFFFFF; font:900 22px 'Arial Black', 'Segoe UI', sans-serif; letter-spacing:2px; }
      .tiny { fill:#8CA3BA; font:700 12px 'Courier New', monospace; letter-spacing:1.5px; }
      .donut-label { fill:#94F4FF; font:900 16px 'Segoe UI', Tahoma, sans-serif; text-anchor:middle; }
      .donut-value { fill:#FFFFFF; font:900 28px 'Arial Black', 'Segoe UI', sans-serif; text-anchor:middle; }
      .lang-name { fill:#E6EDF3; font:700 13px 'Segoe UI', Tahoma, sans-serif; }
      .lang-value { fill:#8CA3BA; font:700 12px 'Courier New', monospace; text-anchor:end; }
      .dash { stroke-dasharray:12 8; animation:dash 18s linear infinite; }
      .pulse { animation:pulse 3s ease-in-out infinite; }
      @keyframes dash { to { stroke-dashoffset:-240; } }
      @keyframes pulse {
        0%, 100% { opacity:0.2; }
        50% { opacity:0.85; }
      }
    </style>
  </defs>
  <rect width="720" height="282" rx="24" fill="url(#bg)"/>
  <rect x="18" y="18" width="684" height="246" rx="18" fill="none" stroke="url(#edge)" stroke-width="2.5" class="dash"/>
  <rect x="32" y="32" width="656" height="218" rx="16" fill="none" stroke="#27364A"/>
  <rect x="28" y="28" width="664" height="10" fill="#FFE66D" opacity="0.06" class="pulse"/>
  <text x="32" y="62" class="hud">LANGUAGE RADAR</text>
  <text x="32" y="82" class="tiny">${escapeXml(footer)}</text>
  <circle cx="172" cy="150" r="74" stroke="#152133" stroke-width="26" fill="none"/>
  ${donut}
  <text x="172" y="144" class="donut-label">TOP</text>
  <text x="172" y="176" class="donut-value">${escapeXml(String(languages.length))}</text>
  ${bars}
</svg>`;
}

let metrics = null;
try {
  metrics = await collectTelemetry();
} catch (error) {
  console.error(error.message);
}

await mkdir(dirname(statsPath), { recursive: true });
await mkdir(dirname(languagesPath), { recursive: true });
await writeFile(statsPath, renderStatsCard(metrics), "utf8");
await writeFile(languagesPath, renderLanguagesCard(metrics), "utf8");
