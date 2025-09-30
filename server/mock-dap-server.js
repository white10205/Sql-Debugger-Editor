const WebSocket = require('ws')
const server = new WebSocket.Server({ port: 8765 })

let seq = 1

function send(ws, msg) {
  ws.send(JSON.stringify(msg))
}

server.on('connection', ws => {
  console.log('DAP client connected')
  // per-connection state
  const state = { breakpoints: [], currentLine: 1 }

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString())
      console.log('recv', msg)
      // very small mock: respond to initialize, setBreakpoints, launch/continue/next, scopes/variables
      if (msg.command === 'initialize') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } })
      } else if (msg.command === 'setBreakpoints') {
        // store breakpoints in state
        state.breakpoints = (msg.arguments && msg.arguments.breakpoints) ? msg.arguments.breakpoints.map(b => b.line) : []
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'setBreakpoints', body: { breakpoints: state.breakpoints.map(l => ({ verified: true, line: l })) } })
      } else if (msg.command === 'launch') {
        // ack launch then send stopped event at first breakpoint or line 1
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'launch' })
        state.currentLine = (state.breakpoints && state.breakpoints.length > 0) ? state.breakpoints[0] : 1
        send(ws, { type: 'event', seq: seq++, event: 'stopped', body: { reason: 'breakpoint', threadId: 1, line: state.currentLine } })
      } else if (msg.command === 'continue') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'continue' })
        // continue to next breakpoint if exists, otherwise increment line
        if (state.breakpoints && state.breakpoints.length > 0) {
          const sorted = state.breakpoints.slice().sort((a,b)=>a-b)
          const cur = state.currentLine || 0
          const next = sorted.find(l => l > cur)
          state.currentLine = next || (cur + 1)
        } else {
          state.currentLine = (state.currentLine || 1) + 1
        }
        send(ws, { type: 'event', seq: seq++, event: 'stopped', body: { reason: 'continue', threadId: 1, line: state.currentLine } })
      } else if (msg.command === 'next' || msg.command === 'stepIn' || msg.command === 'stepOut') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: msg.command })
        // advance by one line (or to next breakpoint if available)
        if (state.breakpoints && state.breakpoints.length > 0) {
          const sorted = state.breakpoints.slice().sort((a,b)=>a-b)
          const cur = state.currentLine || 0
          // find next breakpoint after current, otherwise next line
          const nextBp = sorted.find(l => l > cur)
          state.currentLine = nextBp || (cur + 1)
        } else {
          state.currentLine = (state.currentLine || 1) + 1
        }
        send(ws, { type: 'event', seq: seq++, event: 'stopped', body: { reason: 'step', threadId: 1, line: state.currentLine } })
      } else if (msg.command === 'scopes') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'scopes', body: { scopes: [{ name: 'Local', variablesReference: 1000 }] } })
      } else if (msg.command === 'variables') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'variables', body: { variables: [{ name: 'rows', value: String(Math.floor(Math.random() * 10)), variablesReference: 0 }] } })
      } else if (msg.command === 'threads') {
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } })
      } else {
        // generic response
        send(ws, { type: 'response', seq: seq++, request_seq: msg.seq || 0, success: true, command: msg.command || 'unknown' })
      }
    } catch (e) {
      console.error('failed to parse', e)
    }
  })
})

console.log('Mock DAP server running on ws://localhost:8765')
