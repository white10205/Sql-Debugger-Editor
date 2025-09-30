import * as monaco from 'monaco-editor'

export function createEditor(container: HTMLElement) {
  const model = monaco.editor.createModel(
    `-- Sample SQL\nSELECT id, name FROM users WHERE active = 1;\n-- set breakpoint by clicking gutter`,
    'sql'
  )

  const editor = monaco.editor.create(container, {
    model,
    language: 'sql',
  automaticLayout: true, // 启用自动布局
  glyphMargin: true, // 启用 glyph margin（用于断点）
    minimap: { enabled: false }
  })

  // 断点行号集合
  const breakpoints = new Set<number>()
  // 通过非标准属性暴露给调试器（仅示例用）
  ;(editor as any).__breakpoints = breakpoints
  // 保存装饰 id 以便可以安全替换
  let breakpointDecorationIds: string[] = []
  // 悬停装饰 id（单个）
  let hoverDecorationId: string[] = []

  function updateBreakpointsUI() {
    const el = document.getElementById('breakpoints')!
    el.textContent = Array.from(breakpoints).sort((a, b) => a - b).join(', ')
  }

  // 确保样式只注入一次 - 使用伪元素使圆点在 gutter 中居中显示
  if (!document.getElementById('breakpoint-glyph-style')) {
    const style = document.createElement('style')
    style.id = 'breakpoint-glyph-style'
    style.textContent = `
      /* gutter 中用于断点的图标 */
      .myBreakpoint {
        background: none !important;
      }
      .myBreakpoint:before {
        content: '';
        display: block;
        width: 12px;
        height: 12px;
        background: #e11;
        border-radius: 50%;
        margin: 0 0 0 3px; /* 微调以在 glyph margin 中居中 */
      }
      /* 悬停时的半透明圆点 */
      .hoverBreakpoint { background: none !important; }
      .hoverBreakpoint:before {
        content: ''; display:block; width:10px; height:10px; background: rgba(225,17,17,0.35); border-radius:50%; margin:0 0 0 4px;
      }
    `
    document.head.appendChild(style)
  }

  editor.onMouseDown(e => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = e.target.position!.lineNumber
      if (breakpoints.has(line)) breakpoints.delete(line)
      else breakpoints.add(line)

      const newDecorations = Array.from(breakpoints).map(l => ({
        range: new monaco.Range(l, 1, l, 1),
        options: {
          glyphMarginClassName: 'myBreakpoint',
          glyphMarginHoverMessage: { value: 'Breakpoint' },
          isWholeLine: false
        }
      }))

      breakpointDecorationIds = editor.deltaDecorations(breakpointDecorationIds, newDecorations)
      updateBreakpointsUI()
    }
  })

  // 当鼠标移到 glyph margin 上时显示悬停图标
  editor.onMouseMove(e => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = e.target.position!.lineNumber
      // 如果该行已有断点，则不显示悬停图标；并移除任何已有的悬停装饰
      if (breakpoints.has(line)) {
        if (hoverDecorationId.length) hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
        return
      }

      // 如果已在同一行显示悬停装饰，则不做任何操作
      const currentHoverRange = hoverDecorationId[0] ? editor.getModel()!.getDecorationRange(hoverDecorationId[0]) : null
      if (currentHoverRange && currentHoverRange.startLineNumber === line) return

      // 在此行设置悬停装饰
      hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [{
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'hoverBreakpoint', isWholeLine: false }
      }])
    } else {
      // 当不在 gutter 上时移除悬停装饰
      if (hoverDecorationId.length) {
        hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
      }
    }
  })

  // 当鼠标离开编辑器时清除悬停装饰
  editor.onMouseLeave(() => {
    if (hoverDecorationId.length) hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
  })

  return editor
}
