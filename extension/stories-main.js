// Runs in Instagram's own page context (world: MAIN) so it can see the
// page's requests. When "Watch stories anonymously" is on, the request that
// tells Instagram a story was seen is answered here instead of being sent, so
// the story's owner doesn't see you in their viewers list. Everything else
// goes through untouched. The setting arrives from stories.js as an attribute
// on <html>.
(() => {
  // Instagram has used these for "story seen" (web GraphQL mutation names and
  // the older REST endpoint). Matched against the request's URL and body.
  const SEEN = /Stories\w*SeenMutation|StoryViewerSeen\w*Mutation|ReelSeen\w*Mutation|\/stories\/reel\/seen|\/api\/v1\/media\/seen/i;
  const FAKE = '{"data":{},"status":"ok"}';

  const enabled = () => document.documentElement.dataset.keepkeepAnonStories === '1';

  function bodyText(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      let out = '';
      for (const [k, v] of body) out += `${k}=${typeof v === 'string' ? v : ''}&`;
      return out;
    }
    return '';
  }

  function isSeen(url, body) {
    if (!enabled()) return false;
    const text = bodyText(body);
    const hit = String(url).match(SEEN) || text.match(SEEN);
    if (hit) console.info('[KeepKeep] story seen not sent:', hit[0]);
    return !!hit;
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (isSeen(url, init?.body)) {
      return Promise.resolve(new Response(FAKE, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return origFetch.apply(this, arguments);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__keepkeepUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (!isSeen(this.__keepkeepUrl, body)) return origSend.apply(this, arguments);
    // Answer as if Instagram had said "ok".
    const define = (k, v) => Object.defineProperty(this, k, { configurable: true, get: () => v });
    define('readyState', 4);
    define('status', 200);
    define('statusText', 'OK');
    define('responseText', FAKE);
    define('response', this.responseType === 'json' ? JSON.parse(FAKE) : FAKE);
    setTimeout(() => {
      for (const type of ['readystatechange', 'load', 'loadend']) {
        const ev = new ProgressEvent(type);
        this.dispatchEvent(ev);
        this['on' + type]?.call(this, ev);
      }
    }, 0);
  };
})();
