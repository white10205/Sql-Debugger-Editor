import './styles.css'
import { createEditor } from './monaco-editor-setup'
import { MockDebugger } from './mock-debugger'

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

document.getElementById('btn-run')!.addEventListener('click', () => dbg.start())
document.getElementById('btn-step')!.addEventListener('click', () => dbg.step())
document.getElementById('btn-continue')!.addEventListener('click', () => dbg.continue())
document.getElementById('btn-stop')!.addEventListener('click', () => dbg.stop())
