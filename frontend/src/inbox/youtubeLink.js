// The video id in anything YouTube-shaped someone might paste: watch URLs
// (www / m. / music.), youtu.be short links, /shorts/, /embed/, /live/ - or a
// bare 11-character id. Returns null for anything else.
const ID = /^[A-Za-z0-9_-]{11}$/;

export function videoIdFromText(text) {
  const raw = (text || '').trim();
  if (ID.test(raw)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && ID.test(id) ? id : null;
}
