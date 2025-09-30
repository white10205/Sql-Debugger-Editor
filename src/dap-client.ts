export type DapEventHandler = (event: any) => void

export class SimpleDAPClient {
    private ws: WebSocket
    private seq = 1
    private pending = new Map<number, (res: any) => void>()
    private eventHandlers: DapEventHandler[] = []
    private ready: Promise<void>
    private _readyResolve!: () => void
    private _readyReject!: (err: any) => void

    constructor(url: string) {
        this.ready = new Promise((resolve, reject) => {
            this._readyResolve = resolve
            this._readyReject = reject
        })

        this.ws = new WebSocket(url)
        this.ws.addEventListener('open', () => this._readyResolve())
        this.ws.addEventListener('error', (ev) => this._readyReject(ev))
        this.ws.addEventListener('message', ev => this.onMessage(ev))
    }

    private onMessage(ev: MessageEvent) {
        try {
            const msg = JSON.parse(ev.data)
            if (msg.type === 'event') {
                this.eventHandlers.forEach(h => h(msg))
            } else if (msg.type === 'response') {
                const cb = this.pending.get(msg.request_seq)
                if (cb) { cb(msg); this.pending.delete(msg.request_seq) }
            }
        } catch (e) {
            console.error('DAP parse error', e)
        }
    }

    sendRequest(command: string, args: any = {}) {
        const seq = this.seq++
        const msg = { type: 'request', seq, command, arguments: args }
        return new Promise<any>((resolve, reject) => {
            this.pending.set(seq, (res) => resolve(res))
            // ensure websocket is open before sending
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(msg))
            } else {
                this.ready.then(() => this.ws.send(JSON.stringify(msg))).catch(err => reject(err))
            }
        })
    }

    onEvent(h: DapEventHandler) { this.eventHandlers.push(h) }

    close() { this.ws.close() }
}
