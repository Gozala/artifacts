const inbox = {
    onScraped(data) {
        return { type: "scraped", scraped: data };
    },
    logError(error) {
        return { type: "logError", logError: error };
    }
};
const init = (_context) => {
    const channel = new MessageChannel();
    return { state: { status: "loading", channel }, fx: [] };
};
const update = (state, message) => {
    switch (message.type) {
        case "loaded": {
            return { state: { ...state, status: "loaded" }, fx: [] };
        }
        case "scraped": {
            return {
                state,
                fx: [Task.perform(() => service.send(state.channel, message))]
            };
        }
        case "client": {
            return updateClient(state, message.message);
        }
        case "logError": {
            return { state, fx: [Task.perform(() => console.log(message.logError))] };
        }
        default: {
            return { state, fx: [] };
        }
    }
};
const updateClient = (state, message) => {
    switch (message.type) {
        case "ready": {
            return { state: { ...state, status: "ready" }, fx: [] };
        }
        case "close": {
            return { state, fx: [Task.perform(Program.deactivate)] };
        }
        case "scrape": {
            return {
                state,
                fx: [Task.perform(service.scrape, inbox.onScraped, inbox.logError)]
            };
        }
        default: {
            return { state, fx: [] };
        }
    }
};
const statusStyle = (status) => {
    switch (status) {
        case "loading": {
            return { pointerEvents: "none", opacity: 0 };
        }
        default: {
            return { pointerEvents: "all", opacity: 1 };
        }
    }
};
const style = (state) => ({
    transition: "opacity ease-in 0.3s",
    display: "block",
    position: "fixed",
    height: "100%",
    width: "100%",
    inset: "0px",
    margin: "0px",
    border: "none",
    "z-index": 99999999,
    pointerEvents: "none",
    ...statusStyle(state.status)
});
const receive = (context) => {
    const { event } = context;
    switch (event.type) {
        case "load": {
            return { type: "loaded" };
        }
        case "message": {
            return { type: "client", message: event.data };
        }
        default: {
            return null;
        }
    }
};
const view = (context) => {
    switch (context.state.status) {
        case "loading": {
            return viewLoading(context);
        }
        case "loaded": {
            return viewLoaded(context);
        }
        case "ready": {
            return viewReady(context);
        }
        default: {
            return viewUnknown(context);
        }
    }
};
const viewUnknown = (context) => {
    const view = context.document.createElement("pre");
    view.textContent = `View is in unexpected state:\n${JSON.stringify(context.state)}`;
    return view;
};
const viewLoading = (context) => {
    if (context.node) {
        Object.assign(context.node, style(context.state));
        return context.node;
    }
    else {
        const frame = context.document.createElement("iframe");
        frame.src = `${window.ARTIFACTS_DEV_URL ||
            "https://gozala.io/artifacts/"}bookmarklet.html`;
        Object.assign(frame.style, style(context.state));
        frame.addEventListener("load", context);
        return frame;
    }
};
const viewLoaded = (context) => {
    if (context.node == null) {
        return viewLoading(context);
    }
    else if (!context.node.hasAttribute("data-connected")) {
        context.node.setAttribute("data-connected", "");
        context.state.channel.port1.start();
        context.state.channel.port1.addEventListener("message", context);
        const frame = context.node;
        frame.contentWindow.postMessage({ port: context.state.channel.port2 }, frame.src, [context.state.channel.port2]);
    }
    return context.node;
};
const viewReady = (context) => {
    if (!context.node) {
        return viewUnknown(context);
    }
    else if (!context.node.hasAttribute("data-ready")) {
        context.node.setAttribute("data-ready", "");
        Object.assign(context.node.style, style(context.state));
        return context.node;
    }
    else {
        return context.node;
    }
};
const save = (tr) => tr.state;
const effect = (tr) => tr.fx;
class Program {
    constructor(config, target) {
        this.config = config;
        this.event = window.event;
        this.target = target;
        const transaction = this.config.init(this);
        const state = this.config.save(transaction);
        const fx = this.config.effect(transaction);
        this.state = state;
        this.node = this.config.view(this);
        this.target.append(this.node);
        this.perform(fx);
    }
    static deactivate() {
        program.deactivate();
    }
    async perform(fx) {
        for (const task of fx) {
            const message = await task();
            if (message != null) {
                this.transact(message);
            }
        }
    }
    handleEvent(event) {
        this.event = event;
        const message = this.config.receive(this);
        delete this.event;
        if (message) {
            this.transact(message);
        }
    }
    transact(message) {
        const transaction = this.config.update(this.state, message);
        this.state = this.config.save(transaction);
        this.perform(this.config.effect(transaction));
        const node = this.config.view(this);
        if (this.node !== node) {
            this.node.replaceWith(node);
            this.node = node;
        }
    }
    deactivate() {
        this.node.remove();
    }
    get document() {
        return this.target.ownerDocument;
    }
}
class Task {
    static perform(task, ok = (_value) => null, error = (_error) => null) {
        return async () => {
            try {
                const value = await task();
                return ok(value);
            }
            catch (reason) {
                return error(reason);
            }
        };
    }
    static succeed(message) {
        return async () => message;
    }
}
const service = {
    async scrape(document = window.document) {
        /*
            Pull structured content out of the DOM.
            - Hero images
            - Title
            - Summary
            - Site name
            - Article content
            Things we can use:
            - `<title>`
            - meta description
            - Twitter card meta tags
            - Facebook Open Graph tags
            - Win8 Tile meta tags
            - meta description
            - Search snippet things like schema.org
            - microformats
            https://github.com/mozilla/readability
            http://schema.org/CreativeWork
            https://dev.twitter.com/cards/markup
            https://developers.facebook.com/docs/sharing/webmasters#markup
            https://developer.apple.com/library/ios/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
            http://blogs.msdn.com/b/ie/archive/2014/05/21/support-a-live-tile-for-your-website-on-windows-and-windows-phone-8-1.aspx
            http://www.oembed.com/
            https://developer.chrome.com/multidevice/android/installtohomescreen
            */
        // Utils
        // -----------------------------------------------------------------------------
        // Scraping and content scoring helpers
        // -----------------------------------------------------------------------------
        // @TODO need some methods for scaling and cropping images.
        await service.loaded();
        return {
            url: document.URL,
            icon: scrapeIcon(document.documentElement),
            hero: [...scrapeHeroImgUrls(document.documentElement)],
            title: scrapeTitle(document.documentElement, ""),
            description: scrapeDescription(document.documentElement, ""),
            name: scrapeSiteName(document.documentElement, "")
        };
    },
    loaded() {
        return new window.Promise(resolve => {
            if (document.readyState === "complete") {
                resolve();
            }
            else {
                const listener = (_event) => {
                    window.removeEventListener("load", listener);
                    resolve();
                };
                window.addEventListener("load", listener);
            }
        });
    },
    send(channel, message) {
        channel.port1.postMessage(message);
    }
};
export const program = (window.program = new Program({ init, update, view, receive, effect, save }, document.body));
// Function
const identity = (x) => x;
// Iterables
const filter = function* (p, source) {
    for (const item of source) {
        if (p(item)) {
            yield item;
        }
    }
};
const map = function* (f, source) {
    for (const item of source) {
        yield f(item);
    }
};
const reduce = (reducer, state, items) => {
    let result = state;
    for (const item of items) {
        result = reducer(item, state);
    }
    return result;
};
const concat = function* (iterables) {
    for (const iterable of iterables) {
        for (const item of iterable) {
            yield item;
        }
    }
};
const take = function* (n, iterable) {
    if (n > 0) {
        let count = 0;
        for (const item of iterable) {
            yield item;
            if (++count >= n) {
                break;
            }
        }
    }
};
const first = (iterable, fallback) => {
    for (const item of iterable) {
        return item;
    }
    return fallback;
};
// DOM
const query = function* (selector, decode, root) {
    const elements = [
        ...root.querySelectorAll(selector)
    ];
    for (const element of elements) {
        const data = decode(element);
        if (data != null) {
            yield data;
        }
    }
};
const getText = ({ textContent }) => textContent || "";
const getContent = (metaEl) => metaEl instanceof HTMLMetaElement ? metaEl.content : null;
const getSrc = (imgEl) => imgEl.src;
const getHref = (linkEl) => linkEl instanceof HTMLLinkElement ? linkEl.href : null;
// Does element match a particular tag name?
const matchesTag = (el, pattern) => el.tagName.search(pattern) !== -1;
const matchesClass = (el, pattern) => el.className.search(pattern) !== -1;
// Scraper
// Score the content-y-ness of a string. Note that this is an imperfect score
// and you'll be better off if you combine it with other heuristics like
// element classname, etc.
const scoreContentyness = (text) => {
    // If paragraph is less than 25 characters, don't count it.
    if (text.length < 25)
        return 0;
    // Ok, we've weeded out the no-good cases. Start score at one.
    var score = 1;
    // Add points for any commas within.
    score = score + text.split(",").length;
    // For every 100 characters in this paragraph, add another point.
    // Up to 3 points.
    score = score + Math.min(Math.floor(text.length / 100), 3);
    return score;
};
// Score a child element to find out how "content-y" it is.
// A score is determined by things like number of commas, etc.
// Maybe eventually link density.
const scoreElContentyness = (el) => scoreContentyness(getText(el));
const isSufficientlyContenty = (el, base = 3) => scoreElContentyness(el) > base;
const UNLIKELY_CONTENT_CLASSNAMES = /date|social|community|remark|discuss|disqus|e[\-]?mail|rss|print|extra|share|login|sign|reply|combx|comment|com-|contact|header|menu|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i;
const isUnlikelyCandidate = (el) => matchesClass(el, UNLIKELY_CONTENT_CLASSNAMES);
const countWords = (text) => text.split(/\s/).length;
// Is text long enough to be content?
const isSufficientlyLong = (text) => text.length > 25;
const isTextSufficientlyLong = (el) => isSufficientlyLong(getText(el));
const isntEmpty = (text) => text != "";
const getElTextLength = (el) => getText(el).length;
const sum = (a, b) => a + b;
// Calculat the density of links in content.
const calcLinkDensity = (el) => {
    const linkSizes = query("a", getElTextLength, el);
    const linkSize = reduce(sum, 0, linkSizes);
    const textSize = getElTextLength(el);
    return linkSize / textSize;
};
// Is the link density of this element high?
const isHighLinkDensity = (el) => calcLinkDensity(el) > 0.5;
// Extract a clean title from text that has been littered with separator
// garbage.
const cleanTitle = (text) => {
    var title = text;
    if (text.match(/\s[\|\-:]\s/)) {
        title = text.replace(/(.*)[\|\-:] .*/gi, "$1");
        if (countWords(title) < 3) {
            title = text.replace(/[^\|\-]*[\|\-](.*)/gi, "$1");
        }
        // Fall back to title if word count is too short.
        if (countWords(title) < 5) {
            title = text;
        }
    }
    // Trim spaces.
    return title.trim();
};
const getCleanText = (el) => cleanTitle(getText(el));
// Content scrapers
// -----------------------------------------------------------------------------
// Find a good title within page.
// Usage: `scrapeTitle(htmlEl, 'Untitled')`.
const scrapeTitle = (el, fallback = "Untitled") => {
    const candidates = concat([
        query('meta[property="og:title"], meta[name="twitter:title"]', getContent, el),
        // Query hentry Microformats. Note that we just grab the blog title,
        // even on a blog listing page. You're going to associate the first title
        // with the identity of the page because it's the first thing you see on
        // the page when it loads.
        query(".entry-title, .h-entry .p-name", getText, el),
        // @TODO look at http://schema.org/Article `[itemprop=headline]`
        query("title", getCleanText, el),
        // If worst comes to worst, fall back on headings.
        query("h1, h2, h3", getText, el),
        [fallback]
    ]);
    return first(candidates, fallback);
};
const scrapeDescriptionFromContent = (pageEl, fallback) => {
    // Query for all paragraphs on the page.
    // Trim down paragraphs to the ones we deem likely to be content.
    // Then map to `textContent`.
    const paragraphs = query("p", identity, pageEl);
    const isQualified = (p) => {
        const qualified = !isUnlikelyCandidate(p) &&
            isTextSufficientlyLong(p) &&
            !isHighLinkDensity(p) &&
            isSufficientlyContenty(p);
        return qualified;
    };
    const qualified = filter(isQualified, paragraphs);
    return map(getText, qualified);
};
// Find a good description for the page.
// Usage: `scrapeDescription(htmlEl, '')`.
const scrapeDescription = (el, fallback) => {
    const candidates = concat([
        // Prefer social media descriptions to `meta[name=description]` because they
        // are curated for readers, not search bots.
        query('meta[name="twitter:description"]', getContent, el),
        query('meta[property="og:description"]', getContent, el),
        // Scrape hentry Microformat description.
        query(".entry-summary, .h-entry .p-summary", getText, el),
        // @TODO process description to remove garbage from descriptions.
        query("meta[name=description]", getContent, el),
        // @TODO look at http://schema.org/Article `[itemprop=description]`
        scrapeDescriptionFromContent(el, fallback)
    ]);
    return first(candidates, fallback);
};
// You probably want to use the base URL as fallback.
const scrapeSiteName = (el, fallback) => {
    const candidates = concat([
        // Prefer the standard meta tag.
        query('meta[name="application-name"]', getContent, el),
        query('meta[property="og:site_name"]', getContent, el),
        // Note that this one is an `@name`.
        query('meta[name="twitter:site"]', getContent, el),
        [fallback]
    ]);
    return first(candidates, fallback);
};
const isImgSizeAtLeast = (imgEl, w, h) => imgEl.naturalWidth > w && imgEl.naturalHeight > h;
const isImgHeroSize = (imgEl) => isImgSizeAtLeast(imgEl, 480, 300);
// Collect Twitter image urls from meta tags.
// Returns an array of 1 or more Twitter img urls, or null.
// See https://dev.twitter.com/cards/markup.
const queryTwitterImgUrls = (pageEl) => query(`
    meta[name="twitter:image"],
    meta[name="twitter:image:src"],
    meta[name="twitter:image0"],
    meta[name="twitter:image1"],
    meta[name="twitter:image2"],
    meta[name="twitter:image3"]
    `, getContent, pageEl);
// Collect Facebook Open Graph image meta tags.
// Returns an aray of 0 or more meta elements.
// These 2 meta tags are equivalent. If the first doesn't exist, look for
// the second.
// See https://developers.facebook.com/docs/sharing/webmasters#images.
const queryOpenGraphImgUrls = (el) => query(`
    meta[property="og:image"],
    meta[property="og:image:url"]
    `, getContent, el);
const findHeroImgUrls = (pageEl) => {
    const candidates = query("img", identity, pageEl);
    const heroSized = filter(isImgHeroSize, candidates);
    const urls = map(getSrc, heroSized);
    // can be a lot of images we limit to 4
    return take(4, filter(isntEmpty, urls));
};
// Scrape up to 4 featured images.
// We favor meta tags like `twitter:image` and `og:image` because those are
// hand-curated. If we don't them, we'll dig through the content ourselves.
// Returns an array of image urls.
// @TODO it might be better just to grab everything, then de-dupe URLs.
const scrapeHeroImgUrls = (el) => {
    // Note that Facebook OpenGraph image queries are kept seperate from Twitter
    // image queries. This is to prevent duplicates when sites include both.
    // If we find Twitter first, we'll return it and never look for Facebook.
    // We'll favor Twitter image URLs, since there can be more than one.
    const all = concat([
        queryOpenGraphImgUrls(el),
        queryTwitterImgUrls(el),
        findHeroImgUrls(el)
    ]);
    return all;
};
const scrapeIcon = (el) => {
    const candidates = query(`
    link[rel="shortcut icon"],
    link[rel="apple-touch-icon"],
    link[rel="mask-icon"],
    link[rel="icon"]
    `, getHref, el);
    return first(candidates, null);
};
// If we have 4 or more images, we show 4 images in combination.
// Otherwise, use the first featured image only.
const isImgCombo = (imgUrls) => imgUrls.length > 3;
// @TODO
// https://developers.google.com/search/docs/guides/intro-structured-data
//# sourceMappingURL=bookmarklet.js.map