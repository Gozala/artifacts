import { HostMessage } from "../client/main"
import freezeDry from "../freeze-dry/src/index"

type Status = "loading" | "loaded" | "ready"
type Model = {
  channel: MessageChannel
  status: Status
}

type Message =
  | { type: "loaded" }
  | { type: "client"; message: ClientMessaage }
  | { type: "scraped"; scraped: ScrapeData }
  | { type: "archived"; archived: ArchiveData }
  | { type: "logError"; logError: any }

type ClientMessaage =
  | { type: "ready" }
  | { type: "close" }
  | { type: "scrape" }
  | { type: "archive" }
type Transaction = { state: Model; fx: Effect<Message>[] }

const inbox = {
  onScraped(data: ScrapeData): Message {
    return { type: "scraped", scraped: data }
  },
  onArchived: function(data: ArchiveData): Message {
    return { type: "archived", archived: data }
  },
  logError(error: any): Message {
    return { type: "logError", logError: error }
  }
}

const init = (_context: InitContext): Transaction => {
  const channel = new MessageChannel()
  return { state: { status: "loading", channel }, fx: [] }
}

const update = (state: Model, message: Message): Transaction => {
  switch (message.type) {
    case "loaded": {
      return { state: { ...state, status: "loaded" }, fx: [] }
    }
    case "scraped": {
      return {
        state,
        fx: [Task.perform(() => service.send(state.channel, message))]
      }
    }
    case "archived": {
      return {
        state: state,
        fx: [
          Task.perform(function() {
            return service.send(state.channel, message, [message.archived.data])
          })
        ]
      }
    }
    case "client": {
      return updateClient(state, message.message)
    }
    case "logError": {
      return { state, fx: [Task.perform(() => console.log(message.logError))] }
    }
    default: {
      return { state, fx: [] }
    }
  }
}

const updateClient = (state: Model, message: ClientMessaage): Transaction => {
  switch (message.type) {
    case "ready": {
      return { state: { ...state, status: "ready" }, fx: [] }
    }
    case "close": {
      return { state, fx: [Task.perform(Program.deactivate)] }
    }
    case "scrape": {
      return {
        state,
        fx: [Task.perform(service.scrape, inbox.onScraped, inbox.logError)]
      }
    }
    case "archive": {
      debugger
      return {
        state: state,
        fx: [Task.perform(service.archive, inbox.onArchived, inbox.logError)]
      }
    }
    default: {
      return { state, fx: [] }
    }
  }
}

const statusStyle = (status: Status) => {
  switch (status) {
    case "loading": {
      return { pointerEvents: "none", opacity: 0 }
    }
    default: {
      return { pointerEvents: "all", opacity: 1 }
    }
  }
}

const style = (state: Model) => ({
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
})

const receive = (context: EventContext<Message>): Message | null => {
  const { event } = context
  switch (event.type) {
    case "load": {
      return { type: "loaded" }
    }
    case "message": {
      return { type: "client", message: (<MessageEvent>event).data }
    }
    default: {
      return null
    }
  }
}

const view = (context: ViewContext<Model, Message>) => {
  switch (context.state.status) {
    case "loading": {
      return viewLoading(context)
    }
    case "loaded": {
      return viewLoaded(context)
    }
    case "ready": {
      return viewReady(context)
    }
    default: {
      return viewUnknown(context)
    }
  }
}

const viewUnknown = (context: ViewContext<Model, Message>) => {
  const view = context.document.createElement("pre")
  view.textContent = `View is in unexpected state:\n${JSON.stringify(
    context.state
  )}`
  return view
}

const viewLoading = (context: ViewContext<Model, Message>) => {
  if (context.node) {
    Object.assign(context.node, style(context.state))
    return context.node
  } else {
    const frame = context.document.createElement("iframe")
    frame.src = `${(<any>window).ARTIFACTS_DEV_URL ||
      "https://gozala.io/artifacts/"}bookmarklet.html`
    Object.assign(frame.style, style(context.state))
    frame.addEventListener("load", context)

    return frame
  }
}

const viewLoaded = (context: ViewContext<Model, Message>) => {
  if (context.node == null) {
    return viewLoading(context)
  } else if (!context.node.hasAttribute("data-connected")) {
    context.node.setAttribute("data-connected", "")
    context.state.channel.port1.start()
    context.state.channel.port1.addEventListener("message", context)
    const frame: HTMLIFrameElement = <HTMLIFrameElement>context.node
    frame.contentWindow!.postMessage(
      { port: context.state.channel.port2 },
      frame.src,
      [context.state.channel.port2]
    )
  }

  return context.node
}

const viewReady = (context: ViewContext<Model, Message>) => {
  if (!context.node) {
    return viewUnknown(context)
  } else if (!context.node.hasAttribute("data-ready")) {
    context.node.setAttribute("data-ready", "")
    Object.assign((<HTMLElement>context.node).style, style(context.state))
    return context.node
  } else {
    return context.node
  }
}

const save = (tr: Transaction): Model => tr.state

const effect = (tr: Transaction): Effect<Message>[] => tr.fx

interface InitContext {}
interface ViewContext<model, _message> {
  state: model
  node: null | Element
  document: Document
  handleEvent(event: Event): void
}

interface EventContext<_model> {
  event: Event
}

type Effect<message> = () =>
  | message
  | null
  | void
  | Promise<message | null | void>

interface ProgramConfig<model, message, tr> {
  init(context: InitContext): tr
  update(state: model, message: message): tr
  view(context: ViewContext<model, message>): Element
  receive(event: EventContext<message>): message | null
  save(transaction: tr): model
  effect(transaction: tr): Effect<message>[]
}

class Program<model, message, tr> {
  config: ProgramConfig<model, message, tr>
  target: Element
  state: model
  node: Element
  event: Event
  constructor(config: ProgramConfig<model, message, tr>, target: Element) {
    this.config = config
    this.event = <Event>window.event
    this.target = target
    const transaction = this.config.init(this)
    const state = this.config.save(transaction)
    const fx = this.config.effect(transaction)

    this.state = state
    this.node = this.config.view(this)

    this.target.append(this.node)

    this.perform(fx)
  }
  static deactivate() {
    program.deactivate()
  }
  async perform(fx: Effect<message>[]): Promise<void> {
    for (const task of fx) {
      const message = await task()
      if (message != null) {
        this.transact(message)
      }
    }
  }
  handleEvent(event: Event) {
    this.event = event
    const message = this.config.receive(this)
    delete this.event
    if (message) {
      this.transact(message)
    }
  }
  transact(message: message) {
    const transaction = this.config.update(this.state, message)
    this.state = this.config.save(transaction)
    this.perform(this.config.effect(transaction))

    const node = this.config.view(this)
    if (this.node !== node) {
      this.node.replaceWith(node)
      this.node = node
    }
  }
  deactivate() {
    this.node.remove()
  }
  get document(): Document {
    return this.target.ownerDocument!
  }
}

class Task {
  static perform<a, b>(
    task: () => a | Promise<a>,
    ok: (value: a) => b | null = (_value: a) => null,
    error: (error: any) => b | null = (_error: a) => null
  ): Effect<b> {
    return async () => {
      try {
        const value = await task()
        return ok(value)
      } catch (reason) {
        return error(reason)
      }
    }
  }
  static succeed<a>(message: a): Effect<a> {
    return async () => message
  }
}

export type ScrapeData = {
  url: string
  icon: string | null
  hero: string[]
  title: string
  description: string
  name: string
}

export type ArchiveData = {
  url: string
  data: ArrayBuffer
}

const baseURL = (spec: string): string => {
  var url = new URL(spec)
  url.search = ""
  url.hash = ""
  var href = url.href
  return href.endsWith("/") ? href : href + "/"
}

const makeRelative = (url: string): string => "./" + url.replace(/:\/\//g, "/")

const service = {
  async scrape(document: Document = window.document): Promise<ScrapeData> {
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

    await service.loaded()

    return {
      url: document.URL,
      icon: scrapeIcon(document.documentElement),
      hero: <string[]>[...scrapeHeroImgUrls(document.documentElement)],
      title: scrapeTitle(document.documentElement, ""),
      description: scrapeDescription(document.documentElement, ""),
      name: scrapeSiteName(document.documentElement, "")
    }
  },

  async archive(document: Document = window.document): Promise<ArchiveData> {
    const base = baseURL(document.URL)
    const data = new FormData()
    const root = freezeDry(document, {
      signal: null,
      resolveURL: async (resource: { url: string; blob(): Promise<Blob> }) => {
        const blob = await resource.blob()
        const url = new URL(makeRelative(resource.url), base)
        data.set(url.href, blob)
        return url.href
      }
    })
    const blob = root.blob()

    data.set("/", blob)
    const bytes = await new Response(data).arrayBuffer()
    return { url: document.URL, data: bytes }
  },
  loaded() {
    return new window.Promise(resolve => {
      if (document.readyState === "complete") {
        resolve()
      } else {
        const listener = (_event: Event) => {
          window.removeEventListener("load", listener)
          resolve()
        }

        window.addEventListener("load", listener)
      }
    })
  },

  send(
    channel: MessageChannel,
    message: HostMessage,
    transfer: ArrayBuffer[] = []
  ) {
    channel.port1.postMessage(message, transfer)
  }
}

const program = ((<any>window).program = new Program(
  { init, update, view, receive, effect, save },
  document.body
))

// Function

const identity = <a>(x: a): a => x

// Iterables

const filter = function*<a>(
  p: (item: a) => boolean,
  source: Iterable<a>
): Iterable<a> {
  for (const item of source) {
    if (p(item)) {
      yield item
    }
  }
}

const map = function*<a, b>(
  f: (item: a) => b,
  source: Iterable<a>
): Iterable<b> {
  for (const item of source) {
    yield f(item)
  }
}

const reduce = <a, b>(
  reducer: (item: a, state: b) => b,
  state: b,
  items: Iterable<a>
): b => {
  let result = state
  for (const item of items) {
    result = reducer(item, state)
  }
  return result
}

const concat = function*<a>(iterables: Iterable<Iterable<a>>): Iterable<a> {
  for (const iterable of iterables) {
    for (const item of iterable) {
      yield item
    }
  }
}

const take = function*<a>(n: number, iterable: Iterable<a>): Iterable<a> {
  if (n > 0) {
    let count = 0
    for (const item of iterable) {
      yield item
      if (++count >= n) {
        break
      }
    }
  }
}

const first = <a>(iterable: Iterable<a>, fallback: a): a => {
  for (const item of iterable) {
    return item
  }
  return fallback
}

// DOM

const query = function*<a>(
  selector: string,
  decode: (el: Element) => null | a,
  root: Document | Element
): Iterable<a> {
  const elements: Iterable<Element> = [
    ...(<any>root.querySelectorAll(selector))
  ]
  for (const element of elements) {
    const data = decode(element)
    if (data != null) {
      yield data
    }
  }
}

const getText = ({ textContent }: Element): string => textContent || ""

const getContent = (metaEl: Element): string | null =>
  !(metaEl instanceof HTMLMetaElement)
    ? null
    : metaEl.content == ""
    ? null
    : metaEl.content

const getSrc = (imgEl: HTMLImageElement): string => imgEl.src

const getHref = (linkEl: Element): string | null =>
  linkEl instanceof HTMLLinkElement ? linkEl.href : null

// Does element match a particular tag name?
const matchesTag = (el: Element, pattern: RegExp) =>
  el.tagName.search(pattern) !== -1

const matchesClass = (el: Element, pattern: RegExp) =>
  el.className.search(pattern) !== -1

// Scraper

// Score the content-y-ness of a string. Note that this is an imperfect score
// and you'll be better off if you combine it with other heuristics like
// element classname, etc.
const scoreContentyness = (text: string) => {
  // If paragraph is less than 25 characters, don't count it.
  if (text.length < 25) return 0

  // Ok, we've weeded out the no-good cases. Start score at one.
  var score = 1

  // Add points for any commas within.
  score = score + text.split(",").length

  // For every 100 characters in this paragraph, add another point.
  // Up to 3 points.
  score = score + Math.min(Math.floor(text.length / 100), 3)

  return score
}

// Score a child element to find out how "content-y" it is.
// A score is determined by things like number of commas, etc.
// Maybe eventually link density.
const scoreElContentyness = (el: Element) => scoreContentyness(getText(el))
const isSufficientlyContenty = (el: Element, base = 3) =>
  scoreElContentyness(el) > base

const UNLIKELY_CONTENT_CLASSNAMES = /date|social|community|remark|discuss|disqus|e[\-]?mail|rss|print|extra|share|login|sign|reply|combx|comment|com-|contact|header|menu|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i

const isUnlikelyCandidate = (el: Element) =>
  matchesClass(el, UNLIKELY_CONTENT_CLASSNAMES)

const countWords = (text: string) => text.split(/\s/).length

// Is text long enough to be content?
const isSufficientlyLong = (text: string) => text.length > 25
const isTextSufficientlyLong = (el: Element) => isSufficientlyLong(getText(el))
const isntEmpty = (text: string) => text != ""

const getElTextLength = (el: Element) => getText(el).length
const sum = (a: number, b: number) => a + b

// Calculat the density of links in content.
const calcLinkDensity = (el: Element) => {
  const linkSizes = query("a", getElTextLength, el)
  const linkSize = reduce(sum, 0, linkSizes)
  const textSize = getElTextLength(el)

  return linkSize / textSize
}

// Is the link density of this element high?
const isHighLinkDensity = (el: Element) => calcLinkDensity(el) > 0.5

// Extract a clean title from text that has been littered with separator
// garbage.
const cleanTitle = (text: string): string => {
  var title = text
  if (text.match(/\s[\|\-:]\s/)) {
    title = text.replace(/(.*)[\|\-:] .*/gi, "$1")

    if (countWords(title) < 3) {
      title = text.replace(/[^\|\-]*[\|\-](.*)/gi, "$1")
    }

    // Fall back to title if word count is too short.
    if (countWords(title) < 5) {
      title = text
    }
  }

  // Trim spaces.
  return title.trim()
}

const getCleanText = (el: Element) => cleanTitle(getText(el))

// Content scrapers
// -----------------------------------------------------------------------------

// Find a good title within page.
// Usage: `scrapeTitle(htmlEl, 'Untitled')`.
const scrapeTitle = (el: Element, fallback = "Untitled"): string => {
  const candidates = concat([
    query(
      'meta[property="og:title"], meta[name="twitter:title"]',
      getContent,
      el
    ),

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
  ])

  return first(candidates, fallback)
}

const scrapeDescriptionFromContent = (pageEl: Element, fallback: string) => {
  // Query for all paragraphs on the page.
  // Trim down paragraphs to the ones we deem likely to be content.
  // Then map to `textContent`.

  const paragraphs = query("p", identity, pageEl)

  const isQualified = (p: Element) => {
    const qualified =
      !isUnlikelyCandidate(p) &&
      isTextSufficientlyLong(p) &&
      !isHighLinkDensity(p) &&
      isSufficientlyContenty(p)

    return qualified
  }

  const qualified = filter(isQualified, paragraphs)
  return map(getText, qualified)
}

// Find a good description for the page.
// Usage: `scrapeDescription(htmlEl, '')`.
const scrapeDescription = (el: Element, fallback: string) => {
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
  ])

  return first(candidates, fallback)
}

// You probably want to use the base URL as fallback.
const scrapeSiteName = (el: Element, fallback: string) => {
  const candidates = concat([
    // Prefer the standard meta tag.
    query('meta[name="application-name"]', getContent, el),
    query('meta[property="og:site_name"]', getContent, el),
    // Note that this one is an `@name`.
    query('meta[name="twitter:site"]', getContent, el),
    [fallback]
  ])

  return first(candidates, fallback)
}

const isImgSizeAtLeast = (imgEl: HTMLImageElement, w: number, h: number) =>
  imgEl.naturalWidth > w && imgEl.naturalHeight > h

const isImgHeroSize = (imgEl: HTMLImageElement) =>
  isImgSizeAtLeast(imgEl, 480, 300)

// Collect Twitter image urls from meta tags.
// Returns an array of 1 or more Twitter img urls, or null.
// See https://dev.twitter.com/cards/markup.
const queryTwitterImgUrls = (pageEl: Element) =>
  query(
    `
    meta[name="twitter:image"],
    meta[name="twitter:image:src"],
    meta[name="twitter:image0"],
    meta[name="twitter:image1"],
    meta[name="twitter:image2"],
    meta[name="twitter:image3"]
    `,
    getContent,
    pageEl
  )

// Collect Facebook Open Graph image meta tags.
// Returns an aray of 0 or more meta elements.
// These 2 meta tags are equivalent. If the first doesn't exist, look for
// the second.
// See https://developers.facebook.com/docs/sharing/webmasters#images.
const queryOpenGraphImgUrls = (el: Element) =>
  query(
    `
    meta[property="og:image"],
    meta[property="og:image:url"]
    `,
    getContent,
    el
  )

const findHeroImgUrls = (pageEl: Element) => {
  const candidates = <Iterable<HTMLImageElement>>query("img", identity, pageEl)
  const heroSized = filter(isImgHeroSize, candidates)
  const urls = map(getSrc, heroSized)
  // can be a lot of images we limit to 4
  return take(4, filter(isntEmpty, urls))
}

// Scrape up to 4 featured images.
// We favor meta tags like `twitter:image` and `og:image` because those are
// hand-curated. If we don't them, we'll dig through the content ourselves.
// Returns an array of image urls.
// @TODO it might be better just to grab everything, then de-dupe URLs.
const scrapeHeroImgUrls = (el: HTMLElement) => {
  // Note that Facebook OpenGraph image queries are kept seperate from Twitter
  // image queries. This is to prevent duplicates when sites include both.
  // If we find Twitter first, we'll return it and never look for Facebook.
  // We'll favor Twitter image URLs, since there can be more than one.
  const all = concat([
    queryOpenGraphImgUrls(el),
    queryTwitterImgUrls(el),
    findHeroImgUrls(el)
  ])

  return all
}

const scrapeIcon = (el: HTMLElement): string | null => {
  const candidates = query(
    `
    link[rel="shortcut icon"],
    link[rel="apple-touch-icon"],
    link[rel="mask-icon"],
    link[rel="icon"]
    `,
    getHref,
    el
  )
  return first(candidates, null)
}
// If we have 4 or more images, we show 4 images in combination.
// Otherwise, use the first featured image only.
const isImgCombo = (imgUrls: string[]) => imgUrls.length > 3

// @TODO
// https://developers.google.com/search/docs/guides/intro-structured-data
