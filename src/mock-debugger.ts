import * as monaco from 'monaco-editor'

export class MockDebugger {
  private editor: monaco.editor.IStandaloneCodeEditor
  private running = false
  private currentLine: number | null = null
  private currentLineDecorationIds: string[] = []
  private variablesEl: HTMLElement

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor
    this.variablesEl = document.getElementById('variables')!

    // optionally track breakpoint decorations by reading model decorations
    // for this demo we assume breakpoints are managed by the editor setup
  }

  private async pauseAt(line: number) {
    this.running = false
    this.currentLine = line
    this.showCurrentLineDecoration()
    this.updateVariables({ line, message: 'Paused (mock)', rows: Math.floor(Math.random() * 10) })
  }

  private showCurrentLineDecoration() {
    if (this.currentLine == null) return

    // inject style once
    if (!document.getElementById('current-line-style')) {
      const style = document.createElement('style')
      style.id = 'current-line-style'
      style.textContent = `.currentLine { background: rgba(255,255,0,0.2) }`
      document.head.appendChild(style)
    }

    const dec = [{
      range: new monaco.Range(this.currentLine, 1, this.currentLine, 1),
      options: { isWholeLine: true, className: 'currentLine' }
    }]

    // only replace the current-line decoration(s), keep other decorations (like breakpoints) intact
    this.currentLineDecorationIds = this.editor.deltaDecorations(this.currentLineDecorationIds, dec)
  }

  private updateVariables(obj: any) {
    this.variablesEl.textContent = JSON.stringify(obj, null, 2)
  }

  start() {
    if (this.running) return
    this.running = true
    // if there are breakpoints set on the editor, start at the first one
    const bps: Set<number> | undefined = (this.editor as any).__breakpoints
    if (bps && bps.size > 0) {
      const first = Array.from(bps).sort((a, b) => a - b)[0]
      this.pauseAt(first)
      return
    }

    // otherwise find first non-empty line
    const model = this.editor.getModel()!
    for (let i = 1; i <= model.getLineCount(); i++) {
      const txt = model.getLineContent(i).trim()
      if (txt) { this.pauseAt(i); break }
    }
  }

  step() {
    if (!this.currentLine) return
    const model = this.editor.getModel()!
    const next = Math.min(this.currentLine + 1, model.getLineCount())
    this.pauseAt(next)
  }

  continue() {
    // if there are breakpoints, continue to the next breakpoint after currentLine
    const bps: Set<number> | undefined = (this.editor as any).__breakpoints
    if (bps && bps.size > 0) {
      const sorted = Array.from(bps).sort((a, b) => a - b)
      const cur = this.currentLine ?? 0
      for (const bp of sorted) {
        if (bp > cur) { this.pauseAt(bp); return }
      }
      // no more breakpoints -> finish
      this.stop()
      return
    }

    // fallback: simulate run until next random non-empty line
    const model = this.editor.getModel()!
    let next = this.currentLine ?? 1
    for (let i = next + 1; i <= model.getLineCount(); i++) {
      if (Math.random() > 0.6) { this.pauseAt(i); return }
    }
    // finished
    this.stop()
  }

  stop() {
    this.running = false
    this.currentLine = null
    // remove only current-line decorations
    this.currentLineDecorationIds = this.editor.deltaDecorations(this.currentLineDecorationIds, [])
    this.updateVariables({})
  }
}
