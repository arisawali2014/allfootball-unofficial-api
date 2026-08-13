// Pure HTML string parsers for allfootballapp.com standings page.
// No network, no DOM — the anchor shapes are fixed and verified:
//   leagues: <a href="/id/data/?cid=<n>&..."><img src="..." alt="Name" class="dp-league-item__logo"><span>Name</span></a>
//   teams:   <a href="/id/teams/<id>-<slug>" class="dp-team-link">Name</a> with a sibling
//            <img src="..." alt="Name" class="dp-team-logo"> right before it.
//
// The upstream anchor href is only used to extract cid / team id / slug; it is
// deliberately NOT part of the output. Responses expose an `href` pointing at
// this API instead, injected per-request by linkLeagues/linkTeams in routes.js
// (it depends on the request host, so it must never be baked into a cached
// parser result).

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

export function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m);
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const LEAGUE_ANCHOR_RE = /<a[^>]*href="(\/id\/data\/\?cid=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const TEAM_ANCHOR_RE = /<a[^>]*href="(\/id\/teams\/(\d+)-([a-z0-9-]+))"[^>]*>([\s\S]*?)<\/a>/g;
const IMG_SRC_RE = /<img[^>]*src="([^"]+)"/;
const TEAM_LOGO_IMG_RE = /<img([^>]*class="dp-team-logo"[^>]*)>/g;

export function parseLeagues(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(LEAGUE_ANCHOR_RE)) {
    const [, , cid, inner] = m;
    if (seen.has(cid)) continue;
    const logoMatch = inner.match(IMG_SRC_RE);
    const logo = logoMatch ? logoMatch[1] : null;
    const name = decodeEntities(stripTags(inner));
    if (!name) continue;
    seen.add(cid);
    out.push({ cid, name, logo });
  }
  return out;
}

export function parseTeams(html) {
  // Build name -> logo map from the dp-team-logo imgs that precede team links.
  const logoByName = new Map();
  for (const m of html.matchAll(TEAM_LOGO_IMG_RE)) {
    const tag = m[1];
    const src = tag.match(/src="([^"]+)"/);
    const alt = tag.match(/alt="([^"]+)"/);
    if (src && alt) logoByName.set(alt[1], src[1]);
  }

  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(TEAM_ANCHOR_RE)) {
    const [, , id, slug, inner] = m;
    if (seen.has(id)) continue;
    const name = decodeEntities(stripTags(inner));
    if (!name) continue;
    seen.add(id);
    out.push({ team_id: id, name, slug, logo: logoByName.get(name) ?? null });
  }
  return out;
}
