import { ScrapeData, ArchiveData } from "../host/bookmarklet"

type ScrapedState = {
  status: "scraped"
  port: MessagePort
  scraped: ScrapeData
}

type ConnectedState = { status: "connected"; port: MessagePort }

type Model =
  | { status: "loading" }
  | { status: "closing" }
  | ConnectedState
  | ScrapedState

type Message =
  | { type: "loaded" }
  | { type: "host"; port: MessagePort; message: HostMessage }
  | { type: "connected"; port: MessagePort }
  | { type: "close" }

export type HostMessage =
  | { type: "scraped"; scraped: ScrapeData }
  | { type: "archived"; archived: ArchiveData }

type Transaction = { state: Model; fx: Effect<Message>[] }

const init = (_context: InitContext): Transaction => {
  return { state: { status: "loading" }, fx: [] }
}

const update = (state: Model, message: Message): Transaction => {
  switch (message.type) {
    case "connected": {
      if (state.status === "closing") {
        return {
          state,
          fx: [Task.perform(() => service.close(message.port))]
        }
      } else {
        return {
          state: { status: "connected", port: message.port },
          fx: [Task.perform(() => service.scrape(message.port))]
        }
      }
    }
    case "close": {
      if (state.status === "connected" || state.status === "scraped") {
        return {
          state: { status: "closing" },
          fx: [Task.perform(() => service.close(state.port))]
        }
      } else {
        return { state: { status: "closing" }, fx: [] }
      }
    }
    case "host": {
      return updateHost(state, message.message, message.port)
    }
    default: {
      return { state, fx: [] }
    }
  }
}

const updateHost = (
  state: Model,
  message: HostMessage,
  port: MessagePort
): Transaction => {
  switch (message.type) {
    case "scraped": {
      return {
        state: { status: "scraped", port, scraped: message.scraped },
        fx: []
      }
    }
    default: {
      return { state, fx: [] }
    }
  }
}

const receive = (context: EventContext<Message>): Message | null => {
  const { event } = context
  switch (event.type) {
    case "message": {
      const messageEvent = <MessageEvent>event
      if (messageEvent.target instanceof MessagePort) {
        return {
          type: "host",
          port: messageEvent.target,
          message: messageEvent.data
        }
      } else {
        return {
          type: "connected",
          port: messageEvent.data.port
        }
      }
    }
    case "click": {
      return {
        type: "close"
      }
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
    case "connected": {
      return viewConnected(context, context.state)
    }
    case "scraped": {
      return viewScraped(context, context.state)
    }
    default: {
      return viewUnknown(context)
    }
  }
}

const style = (_state: Model) => ({
  display: "block",
  background: "white",
  position: "fixed",
  height: "100%",
  width: "100%",
  inset: "0px",
  margin: "0px",
  border: "none"
})

const viewLoading = (context: ViewContext<Model, Message>) => {
  if (!context.node) {
    const main = context.document.createElement("main")
    Object.assign(main.style, style(context.state))
    main.innerHTML = "<div>Loading....</div>"
    console.log("listen")
    context.document.defaultView!.addEventListener("message", context)

    return main
  } else {
    return context.node
  }
}

const viewConnected = (
  context: ViewContext<Model, Message>,
  state: ConnectedState
) => {
  if (context.node == null) {
    return viewLoading(context)
  } else if (!context.node.hasAttribute("data-connected")) {
    context.node.setAttribute("data-connected", "")
    context.node.innerHTML = `
      <div>Archiving...</div>
      <button>Close</button>
    `

    context.node.querySelector("button")!.addEventListener("click", context)
    state.port.addEventListener("message", context)
    state.port.start()
  }

  return context.node
}

const viewScraped = (
  context: ViewContext<Model, Message>,
  state: ScrapedState
) => {
  if (context.node == null) {
    return viewLoading(context)
  } else if (!context.node.hasAttribute("data-scraped")) {
    context.node.setAttribute("data-scraped", "")

    const { url, name, icon, hero, title, description } = state.scraped
    context.node.innerHTML = `
      <div class="card">
        <header class="name">${name}</header>
        <span class="icon" style="background-image: url(${
          new URL(icon || "/favicon.ico", url).href
        })"></span>
        <div class="image" style="background-image: url(${
          new URL(hero[0], url).href
        })"></div>
        <div class="title">${title}</div>
        <p class="description">${description}</p>
      </div>
      <pre>${JSON.stringify(state.scraped, null, 2)}</pre>
      <button>Close</button>
    `

    context.node.querySelector("button")!.addEventListener("click", context)
  }

  return context.node
}

const viewUnknown = (context: ViewContext<Model, Message>) => {
  const view = context.document.createElement("pre")
  view.textContent = `View is in unexpected state:\n${JSON.stringify(
    context.state
  )}`
  return view
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

type Effect<message> = () => null | message | Promise<message | null>

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
  async perform(fx: Effect<message>[]): Promise<void> {
    for (const task of fx) {
      const message = await task()
      if (message !== null) {
        this.transact(message)
      }
    }
  }
  throw(error: Error) {
    console.error(error)
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

const service = {
  close(port: MessagePort) {
    port.postMessage({ type: "close" })
  },
  scrape(port: MessagePort) {
    port.postMessage({ type: "ready" })
    port.postMessage({ type: "scrape" })
  }
}

export const program = ((<any>window).program = new Program(
  { init, update, view, receive, effect, save },
  document.body
))

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
