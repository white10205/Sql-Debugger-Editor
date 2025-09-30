import './styles.css'
import { createEditor } from './monaco-editor-setup'
import { MockDebugger } from './mock-debugger'
import { SimpleDAPClient } from './dap-client'

const app = document.getElementById('app')!
app.innerHTML = `
  <div class="toolbar">
    <button id="btn-run">Run</button>
    <button id="btn-step">Step</button>
    <button id="btn-continue">Continue</button>
    <button id="btn-stop">Stop</button>
  </div>
  <div class="container">
    <div class="editor" id="editor"></div>
    <div class="side">
      <h3>Breakpoints</h3>
      <div id="breakpoints" class="breakpoints"></div>
      <h3>Variables</h3>
      <div id="variables" class="variables"></div>
    </div>
  </div>
`

const editor = createEditor(document.getElementById('editor')!)
const dbg = new MockDebugger(editor)

// connect to mock DAP server
const dap = new SimpleDAPClient('ws://localhost:8765')

dap.sendRequest('initialize', { clientID: 'monaco-demo' }).then(() => {
    console.log('DAP initialized')
})

dap.onEvent(ev => {
    if (ev.event === 'stopped') {
        // DAP 停止事件 -> 如果事件包含行号则使用该行号，否则回退到第一个断点或默认行
        const lineFromEvent = ev.body && ev.body.line
        if (typeof lineFromEvent === 'number') {
            dbg.pauseAtLine(lineFromEvent)
            return
        }
        const bps = Array.from((editor as any).__breakpoints || []) as number[]
        const firstBp = bps[0]
        const line = typeof firstBp === 'number' ? firstBp : 1
        dbg.pauseAtLine(line)
    }
})

document.getElementById('btn-run')!.addEventListener('click', async () => {
    // send setBreakpoints from current breakpoints
    const bps = (editor as any).__getBreakpointLines ? (editor as any).__getBreakpointLines() : Array.from((editor as any).__breakpoints || [])
    await dap.sendRequest('setBreakpoints', { breakpoints: bps.map((l: number) => ({ line: l })) })
    await dap.sendRequest('launch', {})
})

document.getElementById('btn-step')!.addEventListener('click', async () => {
    // 如果还没有处于暂停态，先启动调试（会在第一个断点或第一行暂停）
    if (dbg.getCurrentLine() == null) {
        const bps = (editor as any).__getBreakpointLines ? (editor as any).__getBreakpointLines() : Array.from((editor as any).__breakpoints || [])
        await dap.sendRequest('setBreakpoints', { breakpoints: bps.map((l: number) => ({ line: l })) })
        await dap.sendRequest('launch', {})
    }

    await dap.sendRequest('next', {})
    // 本地也执行一步，以便立即在 UI 上看到下一行高亮（mock 环境）
    dbg.step()
})

document.getElementById('btn-continue')!.addEventListener('click', async () => {
    await dap.sendRequest('continue', {})
})

document.getElementById('btn-stop')!.addEventListener('click', () => {
    dap.sendRequest('disconnect', {})
    dbg.stop()
})
