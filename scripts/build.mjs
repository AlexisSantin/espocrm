// Builds the static site into dist/: one page per language, with versions,
// dates and download links read from each extension's latest GitHub release.
//
//   GITHUB_TOKEN  optional, raises the GitHub API rate limit
//   SITE_URL      optional, absolute URL of the site (canonical, hreflang,
//                 Open Graph image, sitemap); set by the deploy workflow
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strings } from '../src/strings.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const data = JSON.parse(await readFile(path.join(root, 'data/extensions.json'), 'utf8'));
const siteUrl = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/*$/, '/') : '';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const RECENT_RELEASES = 6;

async function github(pathname, { notFound } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'espocrm-extensions-site',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 404 && notFound !== undefined) {
    return notFound;
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${pathname} answered ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

const repoUrl = (extension) => `https://github.com/${data.owner}/${extension.repo}`;

// The release GitHub shows at /releases/latest, so that the version on the
// card matches the page the "What's new" link opens. Null when the repository
// is private or has no published release yet.
async function loadLatest(extension) {
  const release = await github(`/repos/${data.owner}/${extension.repo}/releases/latest`, { notFound: null });
  if (!release) {
    return null;
  }
  const zip = release.assets.find((asset) => asset.name.endsWith('.zip'));
  return {
    version: release.tag_name.replace(/^v/, ''),
    date: release.published_at,
    zipUrl: zip ? zip.browser_download_url : `${repoUrl(extension)}/releases/latest`,
    zipSize: zip ? zip.size : null,
  };
}

// The license GitHub detects on the default branch; none when it has no
// license file or cannot tell which license it is.
async function loadLicense(extension) {
  const found = await github(`/repos/${data.owner}/${extension.repo}/license`, { notFound: null });
  const spdx = found && found.license && found.license.spdx_id;
  if (!spdx || spdx === 'NOASSERTION') {
    return null;
  }
  return { spdx, url: found.html_url };
}

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => escapeMap[c]);

const svg = (size, body, width = 1.6) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const icons = {
  check: svg(16, '<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.4),
  download: svg(16, '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>', 2),
  mail: svg(40, '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  pencil: svg(40, '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  play: '<svg class="icon-play" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg class="icon-pause" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
};

const versionKey = (version) => version.split('.').map((part) => part.padStart(4, '0')).join('.');

function renderMedia(extension, t, base) {
  const shot = extension.screenshot;
  const text = extension[t.htmlLang];
  if (!shot) {
    return `<div class="card-fallback"><span>${icons[extension.icon || 'mail']}</span></div>`;
  }
  const still = `${base}assets/screenshots/${shot.src}`;
  if (!shot.video) {
    return `<img src="${esc(still)}" alt="${esc(text.alt)}" width="${shot.width}" height="${shot.height}" loading="lazy" decoding="async">`;
  }
  // Without JavaScript, or when the visitor asks for reduced motion, the
  // poster stays; the script plays the loop while the card is on screen.
  return `<video muted loop playsinline preload="none" poster="${esc(still)}" aria-label="${esc(text.alt)}" data-card-video>
              <source src="${esc(`${base}assets/screenshots/${shot.video}`)}" type="video/mp4">
            </video>
            <button type="button" class="media-toggle" data-media-toggle data-state="paused" data-label-play="${esc(t.extensions.play)}" data-label-pause="${esc(t.extensions.pause)}" aria-label="${esc(t.extensions.play)}" hidden>${icons.play}${icons.pause}</button>`;
}

function renderCard(extension, locale, t, base) {
  const text = extension[locale];
  const latest = extension.latest;
  const dateFormat = new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const sizeFormat = new Intl.NumberFormat(t.dateLocale, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 0 });
  const footParts = [
    latest.zipSize ? `${t.extensions.zip} · ${sizeFormat.format(Math.round(latest.zipSize / 1000))}` : t.extensions.zip,
    `EspoCRM ${esc(extension.espocrm)}+`,
    ...(extension.license
      ? [`<a href="${esc(extension.license.url)}">${esc(t.extensions.license(extension.license.spdx))}<span class="visually-hidden">, ${esc(extension.name)}</span></a>`]
      : []),
    `<a href="${esc(`${repoUrl(extension)}/releases/latest`)}">${t.extensions.whatsNew}<span class="visually-hidden">, ${esc(extension.name)}</span></a>`,
  ];
  return `
        <li class="card" id="${esc(extension.slug)}" data-category="${esc(extension.category)}">
          <div class="card-media">
            ${renderMedia(extension, t, base)}
          </div>
          <div class="card-body">
            <div class="card-meta">
              <span class="tag">${esc(data.categories[extension.category][locale])}</span>
              <span>v${esc(latest.version)} · <time datetime="${esc(latest.date)}">${esc(dateFormat.format(new Date(latest.date)))}</time></span>
            </div>
            <h3>${esc(extension.name)}</h3>
            <p class="card-tagline">${esc(text.tagline)}</p>
            <ul class="card-points">
              ${text.points.map((point) => `<li>${icons.check}<span>${esc(point)}</span></li>`).join('\n              ')}
            </ul>
            <div class="card-actions">
              <a class="btn btn-primary" href="${esc(latest.zipUrl)}">${icons.download}${t.extensions.download} v${esc(latest.version)}<span class="visually-hidden">, ${esc(extension.name)}</span></a>
              <a class="btn btn-secondary" href="${esc(`${repoUrl(extension)}#readme`)}">${t.extensions.docs}<span class="visually-hidden">, ${esc(extension.name)}</span></a>
            </div>
            <p class="card-foot">${footParts.join(' · ')}</p>
          </div>
        </li>`;
}

function renderPage(locale, extensions, assetVersion) {
  const t = strings[locale];
  const base = locale === 'en' ? '' : '../';
  const pageUrl = siteUrl ? `${siteUrl}${locale === 'en' ? '' : `${locale}/`}` : '';
  const dateFormat = new Intl.DateTimeFormat(t.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const monthFormat = new Intl.DateTimeFormat(t.dateLocale, { month: 'short', year: 'numeric' });

  // The version from which every extension works: the highest minimum.
  const allFrom = extensions.map((e) => e.espocrm).sort((a, b) => versionKey(b).localeCompare(versionKey(a)))[0];
  const byDate = [...extensions].sort((a, b) => b.latest.date.localeCompare(a.latest.date));

  // One sentence about the license once every extension shares the same one.
  const licenses = new Set(extensions.map((e) => (e.license ? e.license.spdx : null)));
  const sharedLicense = licenses.size === 1 && !licenses.has(null) ? [...licenses][0] : null;
  const extensionsLead = t.extensions.lead(allFrom) + (sharedLicense ? ` ${t.extensions.allLicensed(sharedLicense)}` : '');

  const categories = Object.keys(data.categories).filter((key) => extensions.some((e) => e.category === key));
  const chips = [
    `<button type="button" class="chip" aria-pressed="true" data-filter="all">${t.extensions.all} <span class="chip-count">${extensions.length}</span></button>`,
    ...categories.map((key) => {
      const count = extensions.filter((e) => e.category === key).length;
      return `<button type="button" class="chip" aria-pressed="false" data-filter="${esc(key)}">${esc(data.categories[key][locale])} <span class="chip-count">${count}</span></button>`;
    }),
  ];

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(t.title)}</title>`,
    `<meta name="description" content="${esc(t.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(t.title)}">`,
    `<meta property="og:description" content="${esc(t.description)}">`,
    `<meta property="og:locale" content="${t.ogLocale}">`,
  ];
  if (siteUrl) {
    head.push(
      `<link rel="canonical" href="${esc(pageUrl)}">`,
      `<link rel="alternate" hreflang="en" href="${esc(siteUrl)}">`,
      `<link rel="alternate" hreflang="fr" href="${esc(`${siteUrl}fr/`)}">`,
      `<link rel="alternate" hreflang="x-default" href="${esc(siteUrl)}">`,
      `<meta property="og:url" content="${esc(pageUrl)}">`,
      `<meta property="og:image" content="${esc(`${siteUrl}assets/screenshots/live-dashlets.png`)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    );
  }
  head.push(
    `<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">`,
    `<link rel="preload" href="${base}assets/fonts/lexend-latin-wght.woff2" as="font" type="font/woff2" crossorigin>`,
    `<link rel="stylesheet" href="${base}assets/styles.css?v=${assetVersion}">`,
    `<script src="${base}assets/site.js?v=${assetVersion}" defer></script>`,
  );

  // The latest version of each extension, newest first.
  const releases = byDate.slice(0, RECENT_RELEASES).map((extension) => `
          <li class="release">
            <time datetime="${esc(extension.latest.date)}">${esc(dateFormat.format(new Date(extension.latest.date)))}</time>
            <span class="release-name"><a href="#${esc(extension.slug)}">${esc(extension.name)}</a><span class="release-version">${esc(extension.latest.version)}</span></span>
            <a class="release-notes" href="${esc(`${repoUrl(extension)}/releases/latest`)}">${t.releases.notes}<span class="visually-hidden">, ${esc(extension.name)}</span></a>
          </li>`).join('');

  const steps = t.install.steps.map(([title, text], index) => `
          <li class="step">
            <span class="step-num" aria-hidden="true">${index + 1}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
          </li>`).join('');

  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
${head.join('\n')}
</head>
<body>
<a class="skip-link" href="#main">${esc(t.skip)}</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${t.homeHref}"><span class="brand-mark" aria-hidden="true">AS</span>${esc(data.author)}</a>
    <nav class="site-nav" aria-label="${esc(t.nav.label)}">
      <a href="#extensions">${esc(t.nav.extensions)}</a>
      <a href="#releases">${esc(t.nav.releases)}</a>
      <a href="#install">${esc(t.nav.install)}</a>
      <a class="nav-github" href="https://github.com/${esc(data.owner)}">GitHub</a>
      <a class="lang-switch" href="${t.switchTo.href}" hreflang="${t.switchTo.lang}" lang="${t.switchTo.lang}">${esc(t.switchTo.label)}</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="container hero">
    <div class="hero-text">
      <p class="eyebrow">${esc(t.hero.eyebrow)}</p>
      <h1>${esc(t.hero.title)}</h1>
      <p class="hero-lead">${esc(t.hero.lead)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="#extensions">${esc(t.hero.cta)}</a>
        <a class="btn btn-secondary btn-lg" href="https://github.com/${esc(data.owner)}">${esc(t.hero.github)}</a>
      </div>
      <dl class="facts">
        <div><dt>${esc(t.hero.count)}</dt><dd>${extensions.length}</dd></div>
        <div><dt>${esc(t.hero.supported)}</dt><dd>EspoCRM ${esc(allFrom.split('.')[0])}+</dd></div>
        <div><dt>${esc(t.hero.latest)}</dt><dd><time datetime="${esc(byDate[0].latest.date)}">${esc(monthFormat.format(new Date(byDate[0].latest.date)))}</time></dd></div>
      </dl>
    </div>
    <div class="hero-visual">
      <img class="hero-shot hero-shot-back" src="${base}assets/screenshots/live-dashlets.png" alt="${esc(t.hero.backAlt)}" width="1440" height="648" fetchpriority="high">
      <img class="hero-shot hero-shot-front" src="${base}assets/screenshots/lucid.png" alt="${esc(t.hero.frontAlt)}" width="1440" height="900">
    </div>
  </section>

  <section id="extensions" class="container section" aria-labelledby="extensions-title">
    <div class="section-head">
      <div>
        <h2 id="extensions-title">${esc(t.extensions.title)}</h2>
        <p class="section-lead">${esc(extensionsLead)}</p>
      </div>
      <div class="filters" data-filters hidden>
        <span class="filters-label" id="filters-label">${esc(t.extensions.filter)}</span>
        <div class="chips" role="group" aria-labelledby="filters-label">
          ${chips.join('\n          ')}
        </div>
      </div>
    </div>
    <p class="visually-hidden" aria-live="polite" data-filter-status data-one="${esc(t.extensions.statusOne)}" data-many="${esc(t.extensions.statusMany)}"></p>
    <ul class="cards">${extensions.map((extension) => renderCard(extension, locale, t, base)).join('')}
    </ul>
  </section>

  <section id="releases" class="container section" aria-labelledby="releases-title">
    <h2 id="releases-title">${esc(t.releases.title)}</h2>
    <p class="section-lead">${esc(t.releases.lead)}</p>
    <ol class="releases">${releases}
    </ol>
  </section>

  <section id="install" class="band" aria-labelledby="install-title">
    <div class="container">
      <h2 id="install-title">${esc(t.install.title)}</h2>
      <p class="section-lead">${esc(t.install.lead(data.php))}</p>
      <ol class="steps">${steps}
      </ol>
      <p class="install-help">${esc(t.install.help)}</p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-notes">
      <p>${esc(data.author)} · ${esc(t.footer.line)}</p>
      <p>${esc(t.footer.trademark)}</p>
    </div>
    <nav class="footer-nav" aria-label="${esc(t.footer.label)}">
      <a href="https://github.com/${esc(data.owner)}">GitHub</a>
      <a href="https://github.com/${esc(data.owner)}/${esc(data.siteRepo)}">${esc(t.footer.source)}</a>
      <a href="https://forum.espocrm.com/">${esc(t.footer.forum)}</a>
      <a href="${t.switchTo.href}" hreflang="${t.switchTo.lang}" lang="${t.switchTo.lang}">${esc(t.switchTo.label)}</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;
}

const extensions = [];
for (const extension of data.extensions) {
  const latest = await loadLatest(extension);
  if (!latest) {
    console.warn(`Skipped ${extension.name}: ${extension.repo} is private or has no published release.`);
    continue;
  }
  extensions.push({ ...extension, latest, license: await loadLicense(extension) });
}
if (!extensions.length) {
  throw new Error('No extension could be read from GitHub.');
}

const assetsDir = path.join(root, 'src/assets');
const assetVersion = createHash('sha256')
  .update(await readFile(path.join(assetsDir, 'styles.css')))
  .update(await readFile(path.join(assetsDir, 'site.js')))
  .digest('hex')
  .slice(0, 10);

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'fr'), { recursive: true });
await cp(assetsDir, path.join(dist, 'assets'), { recursive: true });
await writeFile(path.join(dist, 'index.html'), renderPage('en', extensions, assetVersion));
await writeFile(path.join(dist, 'fr/index.html'), renderPage('fr', extensions, assetVersion));

if (siteUrl) {
  const lastmod = extensions.map((e) => e.latest.date).sort().pop().slice(0, 10);
  const urls = [siteUrl, `${siteUrl}fr/`]
    .map((loc) => `  <url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('\n');
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`);
}

for (const extension of extensions) {
  console.log(`${extension.name.padEnd(20)} ${extension.latest.version.padEnd(8)} ${extension.latest.date.slice(0, 10)}  ${extension.license ? extension.license.spdx : 'no license detected'}`);
}
console.log(`Built ${path.relative(root, dist)}/ (en, fr)${siteUrl ? ` for ${siteUrl}` : ''}`);
