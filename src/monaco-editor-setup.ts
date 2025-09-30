import * as monaco from 'monaco-editor'

export function createEditor(container: HTMLElement) {
  const model = monaco.editor.createModel(
    `-- Sample SQL\nSELECT id, name FROM users WHERE active = 1;\n-- set breakpoint by clicking gutter`,
    'sql'
  )

  const editor = monaco.editor.create(container, {
    model,
    language: 'sql',
    automaticLayout: true,
    glyphMargin: true,
    minimap: { enabled: false }
  })

  // breakpoints lines (numbers)
  const breakpoints = new Set<number>()
  // expose to external debugger via a non-standard property (demo only)
  ;(editor as any).__breakpoints = breakpoints
  // keep track of decoration ids so we can replace them cleanly
  let breakpointDecorationIds: string[] = []
  // hover decoration id (single)
  let hoverDecorationId: string[] = []

  function updateBreakpointsUI() {
    const el = document.getElementById('breakpoints')!
    el.textContent = Array.from(breakpoints).sort((a, b) => a - b).join(', ')
  }

  // ensure glyph style is injected once - use a pseudo-element so the dot is centered in the gutter
  if (!document.getElementById('breakpoint-glyph-style')) {
    const style = document.createElement('style')
    style.id = 'breakpoint-glyph-style'
    style.textContent = `
      /* glyph used for breakpoints in the glyph margin */
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
        margin: 0 0 0 3px; /* tweak to center inside the glyph margin */
      }
      /* hover pale circle */
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

  // show hover glyph when mouse over glyph margin
  editor.onMouseMove(e => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = e.target.position!.lineNumber
      // if this line already has a breakpoint, don't show hover; remove any hover
      if (breakpoints.has(line)) {
        if (hoverDecorationId.length) hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
        return
      }

      // if already showing hover on same line, do nothing
      const currentHoverRange = hoverDecorationId[0] ? editor.getModel()!.getDecorationRange(hoverDecorationId[0]) : null
      if (currentHoverRange && currentHoverRange.startLineNumber === line) return

      // set hover decoration on this line
      hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [{
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'hoverBreakpoint', isWholeLine: false }
      }])
    } else {
      // remove hover when not over gutter
      if (hoverDecorationId.length) {
        hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
      }
    }
  })

  // clear hover when mouse leaves the editor entirely
  editor.onMouseLeave(() => {
    if (hoverDecorationId.length) hoverDecorationId = editor.deltaDecorations(hoverDecorationId, [])
  })

  return editor
}
