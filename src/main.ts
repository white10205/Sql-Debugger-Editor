import './styles.css'
import * as monaco from 'monaco-editor'
import { createEditor } from './monaco-editor-setup'
import { SqlDebugger } from './sql-debugger'
import { setupSQLLanguageSupport } from './sql-language-support'

// 设置SQL语言支持
setupSQLLanguageSupport()

// 创建UI
const app = document.getElementById('app')!
app.innerHTML = `
  <div class="toolbar">
    <button id="btn-run" title="Run/Continue (F5)">▶ Run</button>
    <button id="btn-step" title="Step Over (F10)">⏭ Step Over</button>
    <button id="btn-step-into" title="Step Into (F11)">⏬ Step Into</button>
    <button id="btn-stop" title="Stop Debugging (Shift+F5)">⏹ Stop</button>
    <div class="status" id="status">Ready</div>
  </div>
  <div class="container">
    <div class="editor" id="editor"></div>
    <div class="side">
      <h3>Breakpoints</h3>
      <div id="breakpoints" class="breakpoints">No breakpoints set</div>
      <h3>Variables</h3>
      <div id="variables" class="variables">{}</div>
      <h3>Output</h3>
      <div id="output" class="output"></div>
    </div>
  </div>
`

// 创建编辑器
const editor = createEditor(document.getElementById('editor')!)

// 设置示例SQL代码
const model = editor.getModel()!
model.setValue(`-- Sample SQL Query with Debug Support
-- Click in the gutter to set breakpoints
-- Use F5 to start debugging

SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
    AND u.status = 'active'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC
LIMIT 10;

-- Additional query for debugging
UPDATE user_stats
SET last_login = NOW()
WHERE user_id IN (
    SELECT DISTINCT user_id
    FROM orders
    WHERE order_date >= CURRENT_DATE - INTERVAL '7 days'
);`)

// 创建SQL调试器
const sqlDebugger = new SqlDebugger(editor)

// 连接工具栏按钮
sqlDebugger.connectToolbarButtons({
  run: document.getElementById('btn-run') as HTMLButtonElement,
  step: document.getElementById('btn-step') as HTMLButtonElement,
  stop: document.getElementById('btn-stop') as HTMLButtonElement
})

const stepIntoBtn = document.getElementById('btn-step-into') as HTMLButtonElement
stepIntoBtn.addEventListener('click', () => {
  sqlDebugger.stepInto()
})

// 状态更新
function updateStatus(text: string, type: 'normal' | 'success' | 'error' = 'normal') {
  const statusEl = document.getElementById('status')!
  statusEl.textContent = text
  statusEl.className = `status ${type}`
}

// 输出显示
function addOutput(text: string, type: 'log' | 'error' | 'success' = 'log') {
  const outputEl = document.getElementById('output')!
  const timestamp = new Date().toLocaleTimeString()
  const entry = document.createElement('div')
  entry.className = `output-entry ${type}`
  entry.textContent = `[${timestamp}] ${text}`
  outputEl.appendChild(entry)
  outputEl.scrollTop = outputEl.scrollHeight
}

// 监听编辑器变化
editor.onDidChangeCursorPosition(() => {
  const position = editor.getPosition()
  if (position) {
    const line = model.getLineContent(position.lineNumber).trim()
    if (line) {
      updateStatus(`Line ${position.lineNumber}: ${line.substring(0, 50)}${line.length > 50 ? '...' : ''}`)
    }
  }
})

// 键盘快捷键
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_B, () => {
  const position = editor.getPosition()
  if (position) {
    sqlDebugger.toggleBreakpoint(position.lineNumber)
  }
})

editor.addCommand(monaco.KeyCode.F5, () => {
  sqlDebugger.runOrContinue()
})

editor.addCommand(monaco.KeyCode.F10, () => {
  sqlDebugger.stepOver()
})

editor.addCommand(monaco.KeyCode.F11, () => {
  sqlDebugger.stepInto()
})

editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F5, () => {
  sqlDebugger.stopDebugging()
})

// 自动启动DAP服务器检查
async function checkDAPServer() {
  try {
    const response = await fetch('http://localhost:8765', { method: 'HEAD' })
    updateStatus('DAP Server: Connected', 'success')
    addOutput('DAP server is running and ready')
  } catch (error) {
    updateStatus('DAP Server: Not running - start with "npm run server"', 'error')
    addOutput('Please start the DAP server: npm run server', 'error')
  }
}

// 检查DAP服务器状态
checkDAPServer()

// 设置定时检查
setInterval(checkDAPServer, 10000)

// 欢迎信息
addOutput('Monaco SQL Debugger loaded successfully', 'success')
addOutput('Shortcuts: F5=Run, F10=Step Over, F11=Step Into, Ctrl+B=Toggle Breakpoint', 'log')
addOutput('Start the DAP server with "npm run server" to enable debugging', 'log')

// 清理函数
window.addEventListener('beforeunload', () => {
  sqlDebugger.dispose()
})
