const init = (context) => {
  return { status: "loading" }
}

const update = (state, message) => {
  switch (message.type) {
    case "loaded": {
      return {status:"loaded"}
    }
    case "client": {
      return updateClient(client.message)
    }
    default: {
      return state
    }
  }
}

const updateClient = (state, message) {
  switch (message.type) {
    "ready": {
      return {status:"ready"}
    }
    default: {
      return state
    }
  }
}

const statusStyle = (status) {
  switch (status) {
    case "loading": {
      return { display: "none", opacity: 0 };
    }
    default: {
      return {dispaly: "block", opacity: 1 }
    }
  }
}

const style = (state) => ({
  transition: "opacity 1s ease-in",
  position: "fixed",
  height: "100%",
  width: "100%",
  inset: "0px",
  margin: "0px",
  "z-index": 99999999,
  
  ...statusStyle(state)
})

const receive = (context) => {
  const {event, node} = context
  switch (event.type) {
    case "load": {
      return {type:"loaded"}
    }
    default: {
      return null
    }
  }
}

const view = (context) =>
  context.status === "loading" ? viewLoading(context) : viewLoaded(context)

const viewLoading = (context) => {
  if (context.node) {
    Object.assign(context.node, style(context.state))
    return context.node
  } else {
    const frame = context.document.createElement("iframe")
    frame.src = "https://gozala.io/artifacts/boomarklet.html"
    Object.assign(frame.style, style(context.state))
    frame.addEventListener("load", context)

    return frame
  }
}

const viewLoaded = (context) => {
  if (context.node.channel == null) {
    const channel = new MessageChannel()
    context.node.channel = channel
    channel.port1.start()
    channel.port1.addEventListener("message", context)
    context.node.postMessage(channel.port2)
  }
  
  return context.node
}

const save = (state) => state

const effect = (state) => []

class Program {
  constructor({init, update, view, receive, save, effect}) {
    this.init = init
    this.update = update
    this.view = view
    this.receive = receive
  }
  activate(target) {
    this.target = target
    const transaction = this.init(this)
    const state = this.save(transaction)
    const fx = this.effect(transaction)
    
    this.state = state
    this.node = this.view(this)
    
    this.target.append(this.node)
    
    this.perform(fx)
  }
  async perform(fx) {
    for (const task of fx) {
      try {
        const message = await task()
        this.transact(message)
      } catch(error) {
        this.error(error)
      }
    }
  }
  handleEvent(event) {
    this.event = event
    this.message = this.receive(event)
    this.event = null
    if (this.message) {
      this.transact()
    }
    
  }
  transact() {
    const transaction = this.update(this.state, this.message)
    this.state = this.save(transaction)
    this.perform(this.effect(transaction))
    
    const node = this.view(this)
    if (this.node !== node) {
      this.node.replaceWith(node)
      this.node = node
    }
  }
  deactivate() {
    this.node.remove()
  }
  get document() {
    return this.target.ownerDocument
  }
}

new Program({init, update, view, receive, effect, save}).activate(window)
