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

    // 可选：通过读取模型装饰来跟踪断点
    // 在此示例中我们假定断点由编辑器初始化代码管理
  }

  private async pauseAt(line: number) {
    this.running = false
    this.currentLine = line
    this.showCurrentLineDecoration()
    this.updateVariables({ line, message: 'Paused (mock)', rows: Math.floor(Math.random() * 10) })
  }

  // 对外公开的方法：在指定行暂停（DAP 事件调用）
  public pauseAtLine(line: number) {
    this.pauseAt(line)
  }

  // 返回当前暂停的行（如果没有则返回 null）
  public getCurrentLine(): number | null {
    return this.currentLine
  }

  private showCurrentLineDecoration() {
    if (this.currentLine == null) return

  // 仅注入一次当前行高亮样式
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

    // 仅替换当前行的装饰，保留其他装饰（例如断点）不变
    this.currentLineDecorationIds = this.editor.deltaDecorations(this.currentLineDecorationIds, dec)
  }

  private updateVariables(obj: any) {
    this.variablesEl.textContent = JSON.stringify(obj, null, 2)
  }

  start() {
    if (this.running) return
    this.running = true
  // 如果编辑器上有断点，则从第一个断点开始
    const bps: Set<number> | undefined = (this.editor as any).__breakpoints
    if (bps && bps.size > 0) {
      const first = Array.from(bps).sort((a, b) => a - b)[0]
      this.pauseAt(first)
      return
    }

  // 否则查找第一个非空行开始执行
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
  // 如果存在断点，继续到当前行之后的下一个断点
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

  // 回退逻辑：模拟运行直到下一个随机的非空行
    const model = this.editor.getModel()!
    let next = this.currentLine ?? 1
    for (let i = next + 1; i <= model.getLineCount(); i++) {
      if (Math.random() > 0.6) { this.pauseAt(i); return }
    }
    // 执行结束
    this.stop()
  }

  stop() {
    this.running = false
    this.currentLine = null
  // 仅移除当前行的装饰
    this.currentLineDecorationIds = this.editor.deltaDecorations(this.currentLineDecorationIds, [])
    this.updateVariables({})
  }
}
