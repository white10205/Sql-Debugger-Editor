const WebSocket = require('ws')
const http = require('http')

// 创建HTTP服务器处理CORS预检请求
const httpServer = http.createServer((req, res) => {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')

    if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
    }

    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('DAP WebSocket Server - Upgrade Required')
    } else {
        res.writeHead(404)
        res.end('Not Found')
    }
})

httpServer.listen(8765, () => {
    console.log('HTTP server for CORS handling listening on port 8765')
})

// 创建WebSocket服务器，使用相同的HTTP服务器
const server = new WebSocket.Server({
    server: httpServer,
    path: '/'
})

let seq = 1

function send(ws, msg) {
    ws.send(JSON.stringify(msg))
}

// 模拟SQL执行状态
class SqlExecutionState {
    constructor() {
        this.reset()
    }

    reset() {
        this.currentLine = 1
        this.breakpoints = []
        this.variables = {}
        this.callStack = []
        this.threads = [{ id: 1, name: 'SQL Thread' }]
        this.executionResults = []
        this.isRunning = false
    }

    addVariable(name, value, type = 'string') {
        this.variables[name] = { name, value: String(value), type, variablesReference: 0 }
    }

    setExecutionResults(results) {
        this.executionResults = results
        this.addVariable('rows', results.length, 'integer')
        this.addVariable('execution_time', `${Math.random() * 100}ms`, 'string')
    }

    updateCallStack(line) {
        this.callStack = [
            {
                id: 1,
                name: 'executeSQL',
                source: { name: 'query.sql', path: '/query.sql' },
                line: line,
                column: 1
            }
        ]
    }
}

server.on('connection', ws => {
    console.log('DAP client connected')
    const state = new SqlExecutionState()

    ws.on('message', data => {
        try {
            const msg = JSON.parse(data.toString())
            console.log('recv', msg.command || msg.event, msg.arguments || msg.body)

            switch (msg.command) {
                case 'initialize':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'initialize',
                        body: {
                            supportsConfigurationDoneRequest: true,
                            supportsEvaluateForHovers: true,
                            supportsConditionalBreakpoints: true,
                            supportsHitConditionalBreakpoints: true,
                            supportsSetVariable: true,
                            supportsFunctionBreakpoints: false,
                            supportsDataBreakpoints: false,
                            supportsBreakpointLocationsRequest: true
                        }
                    })
                    break

                case 'setBreakpoints':
                    const breakpoints = msg.arguments?.breakpoints || []
                    state.breakpoints = breakpoints.map(bp => ({
                        line: bp.line,
                        verified: true,
                        condition: bp.condition,
                        hitCondition: bp.hitCondition
                    }))

                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'setBreakpoints',
                        body: {
                            breakpoints: state.breakpoints
                        }
                    })
                    break

                case 'setExceptionBreakpoints':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'setExceptionBreakpoints',
                        body: {}
                    })
                    break

                case 'launch':
                    state.reset()
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'launch',
                        body: {}
                    })

                    // 发送初始化事件
                    send(ws, {
                        type: 'event',
                        seq: seq++,
                        event: 'initialized',
                        body: {}
                    })
                    break

                case 'configurationDone':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'configurationDone',
                        body: {}
                    })

                    // 启动执行
                    state.isRunning = true
                    const startLine = state.breakpoints.length > 0
                        ? Math.min(...state.breakpoints.map(bp => bp.line))
                        : 1

                    setTimeout(() => {
                        state.currentLine = startLine
                        state.updateCallStack(startLine)

                        // 模拟SQL执行变量
                        state.addVariable('query', 'SELECT * FROM users', 'string')
                        state.addVariable('connection', 'localhost:5432', 'string')
                        state.setExecutionResults([
                            { id: 1, name: 'Alice' },
                            { id: 2, name: 'Bob' }
                        ])

                        send(ws, {
                            type: 'event',
                            seq: seq++,
                            event: 'stopped',
                            body: {
                                reason: 'entry',
                                threadId: 1,
                                preserveFocusHint: false,
                                allThreadsStopped: false,
                                text: 'Entry point reached'
                            }
                        })
                    }, 100)
                    break

                case 'continue':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'continue',
                        body: { allThreadsContinued: false }
                    })

                    // 执行到下一个断点
                    setTimeout(() => {
                        const nextBreakpoint = state.breakpoints
                            .filter(bp => bp.line > state.currentLine)
                            .sort((a, b) => a.line - b.line)[0]

                        if (nextBreakpoint) {
                            state.currentLine = nextBreakpoint.line
                            state.updateCallStack(nextBreakpoint.line)

                            // 检查条件断点
                            if (nextBreakpoint.condition) {
                                // 简单模拟条件检查
                                const conditionMet = Math.random() > 0.5
                                if (!conditionMet) {
                                    // 条件不满足，继续执行
                                    setTimeout(() => ws.emit('message', data.toString()), 100)
                                    return
                                }
                            }

                            send(ws, {
                                type: 'event',
                                seq: seq++,
                                event: 'stopped',
                                body: {
                                    reason: 'breakpoint',
                                    threadId: 1,
                                    hitBreakpointIds: [1]
                                }
                            })
                        } else {
                            // 没有更多断点，执行完成
                            state.isRunning = false
                            send(ws, {
                                type: 'event',
                                seq: seq++,
                                event: 'exited',
                                body: { exitCode: 0 }
                            })
                            send(ws, {
                                type: 'event',
                                seq: seq++,
                                event: 'terminated',
                                body: {}
                            })
                        }
                    }, 200)
                    break

                case 'next':
                case 'stepIn':
                case 'stepOut':
                    console.log(`Processing ${msg.command}, current line: ${state.currentLine}`)
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: msg.command,
                        body: {}
                    })

                    setTimeout(() => {
                        state.currentLine = (state.currentLine || 1) + 1
                        state.updateCallStack(state.currentLine)

                        // 更新执行结果
                        state.setExecutionResults([
                            { id: 1, name: 'Alice', email: 'alice@example.com' },
                            { id: 2, name: 'Bob', email: 'bob@example.com' },
                            { id: 3, name: 'Charlie', email: 'charlie@example.com' }
                        ])

                        console.log(`Sending stopped event at line: ${state.currentLine}`)
                        send(ws, {
                            type: 'event',
                            seq: seq++,
                            event: 'stopped',
                            body: {
                                reason: 'step',
                                threadId: 1,
                                line: state.currentLine
                            }
                        })
                    }, 150)
                    break

                case 'pause':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'pause',
                        body: {}
                    })

                    send(ws, {
                        type: 'event',
                        seq: seq++,
                        event: 'stopped',
                        body: {
                            reason: 'pause',
                            threadId: 1
                        }
                    })
                    break

                case 'threads':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'threads',
                        body: { threads: state.threads }
                    })
                    break

                case 'stackTrace':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'stackTrace',
                        body: {
                            stackFrames: state.callStack,
                            totalFrames: state.callStack.length
                        }
                    })
                    break

                case 'scopes':
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'scopes',
                        body: {
                            scopes: [
                                {
                                    name: 'Local',
                                    variablesReference: 1000,
                                    expensive: false,
                                    presentationHint: 'locals'
                                },
                                {
                                    name: 'SQL Query',
                                    variablesReference: 2000,
                                    expensive: false,
                                    presentationHint: 'registers'
                                }
                            ]
                        }
                    })
                    break

                case 'variables':
                    const vars = msg.arguments?.variablesReference === 1000
                        ? Object.values(state.variables)
                        : state.executionResults.map((row, index) => ({
                            name: `row_${index}`,
                            value: JSON.stringify(row),
                            type: 'object',
                            variablesReference: 3000 + index
                        }))

                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'variables',
                        body: { variables: vars }
                    })
                    break

                case 'evaluate':
                    const expression = msg.arguments?.expression || ''
                    let result = ''

                    if (expression.includes('rowcount')) {
                        result = String(state.executionResults.length)
                    } else if (expression.includes('current')) {
                        result = String(state.currentLine)
                    } else if (expression.includes('query')) {
                        result = state.variables.query?.value || 'No query'
                    } else {
                        result = `Evaluated: ${expression}`
                    }

                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'evaluate',
                        body: {
                            result,
                            type: 'string',
                            variablesReference: 0,
                            presentationHint: { kind: 'code' }
                        }
                    })
                    break

                case 'disconnect':
                    state.isRunning = false
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'disconnect',
                        body: {}
                    })
                    break

                case 'terminate':
                    state.isRunning = false
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: 'terminate',
                        body: {}
                    })
                    break

                default:
                    send(ws, {
                        type: 'response',
                        seq: seq++,
                        request_seq: msg.seq,
                        success: true,
                        command: msg.command,
                        body: {}
                    })
            }
        } catch (e) {
            console.error('Failed to parse message:', e)
        }
    })

    ws.on('close', () => {
        console.log('DAP client disconnected')
        state.reset()
    })
})

console.log('Enhanced Mock DAP server with CORS support running on ws://localhost:8765')
