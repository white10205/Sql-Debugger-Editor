import * as monaco from 'monaco-editor';
import { EnhancedDAPClient } from './enhanced-dap-client';
import { SqlDebugAdapter, SqlDebugSession } from './sql-debug-adapter';

export class SqlDebugger {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private dapClient: EnhancedDAPClient;
  private debugAdapter: SqlDebugAdapter;
  private currentSession: SqlDebugSession | null = null;
  private isDebugging = false;
  private debugButtons: { [key: string]: HTMLButtonElement } = {};

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.dapClient = new EnhancedDAPClient('ws://localhost:8765');
    this.debugAdapter = new SqlDebugAdapter(editor);
    this.setupEventHandlers();
    this.setupDebugActions();
  }

  private setupEventHandlers() {
    // DAP事件处理
    this.dapClient.onStopped((event) => {
      console.log('Debug stopped:', event.body);
      if (event.body?.line) {
        this.debugAdapter.pauseAtLine(this.currentSession!.id, event.body.line, {
          reason: event.body.reason,
          threadId: event.body.threadId
        });
      }
      this.updateUI();
    });

    this.dapClient.onContinued((event) => {
      console.log('Debug continued:', event.body);
      this.updateUI();
    });

    this.dapClient.onOutput((event) => {
      console.log('Debug output:', event.body);
      this.showOutput(event.body.output);
    });

    this.dapClient.onTerminated(() => {
      console.log('Debug terminated');
      this.stopDebugging();
    });

    this.dapClient.onExited(() => {
      console.log('Debug exited');
      this.stopDebugging();
    });
  }

  private setupDebugActions() {
    // 设置编辑器操作
    this.editor.addAction({
      id: 'sql-debugger.toggle-breakpoint',
      label: 'Toggle Breakpoint',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_B],
      run: () => {
        const position = this.editor.getPosition();
        if (position) {
          this.toggleBreakpoint(position.lineNumber);
        }
      }
    });

    this.editor.addAction({
      id: 'sql-debugger.run',
      label: 'Run/Continue',
      keybindings: [monaco.KeyCode.F5],
      run: () => {
        this.runOrContinue();
      }
    });

    this.editor.addAction({
      id: 'sql-debugger.step-over',
      label: 'Step Over',
      keybindings: [monaco.KeyCode.F10],
      run: () => {
        this.stepOver();
      }
    });

    this.editor.addAction({
      id: 'sql-debugger.step-into',
      label: 'Step Into',
      keybindings: [monaco.KeyCode.F11],
      run: () => {
        this.stepInto();
      }
    });

    this.editor.addAction({
      id: 'sql-debugger.stop',
      label: 'Stop Debugging',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F5],
      run: () => {
        this.stopDebugging();
      }
    });

    // 鼠标点击设置断点
    this.editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position!.lineNumber;
        this.toggleBreakpoint(line);
      }
    });
  }

  async startDebugging() {
    if (this.isDebugging) {
      console.log('Debugging already in progress');
      return;
    }

    try {
      await this.dapClient.connect();

      // 初始化DAP
      await this.dapClient.initialize({
        clientID: 'monaco-sql-debugger',
        clientName: 'Monaco SQL Debugger',
        adapterID: 'sql-debug-adapter',
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: 'path',
        supportsVariableType: true,
        supportsVariablePaging: false,
        supportsRunInTerminalRequest: false
      });

      // 创建调试会话
      this.currentSession = this.debugAdapter.createSession();

      // 设置异常断点
      await this.dapClient.setExceptionBreakpoints({
        filters: ['all']
      });

      // 启动调试
      await this.dapClient.launch({
        type: 'sql',
        request: 'launch',
        name: 'SQL Debug Session',
        program: this.editor.getModel()?.uri.path || 'query.sql',
        cwd: '/',
        env: {}
      });

      // 完成配置
      await this.dapClient.configurationDone();

      this.isDebugging = true;
      this.updateUI();
      console.log('SQL debugging started');

    } catch (error) {
      console.error('Failed to start debugging:', error);
      this.showError('Failed to start debugging: ' + error);
    }
  }

  async runOrContinue() {
    if (!this.isDebugging) {
      await this.startDebugging();
      return;
    }

    try {
      // 首先设置当前断点
      await this.syncBreakpoints();

      // 继续执行
      await this.dapClient.continue({ threadId: 1 });
    } catch (error) {
      console.error('Failed to continue:', error);
      this.showError('Failed to continue: ' + error);
    }
  }

  async stepOver() {
    if (!this.isDebugging || !this.currentSession) return;

    try {
      await this.dapClient.next({ threadId: 1 });
    } catch (error) {
      console.error('Failed to step over:', error);
    }
  }

  async stepInto() {
    if (!this.isDebugging || !this.currentSession) return;

    try {
      await this.dapClient.stepIn({ threadId: 1 });
    } catch (error) {
      console.error('Failed to step into:', error);
    }
  }

  async stopDebugging() {
    if (!this.isDebugging) return;

    try {
      await this.dapClient.disconnect();

      if (this.currentSession) {
        this.debugAdapter.stop(this.currentSession.id);
        this.currentSession = null;
      }

      this.isDebugging = false;
      this.updateUI();
      console.log('SQL debugging stopped');

    } catch (error) {
      console.error('Failed to stop debugging:', error);
    }
  }

  private async syncBreakpoints() {
    if (!this.currentSession) return;

    const breakpoints = this.getBreakpointLines();
    this.debugAdapter.setBreakpoints(this.currentSession.id,
      breakpoints.map(line => ({ line }))
    );

    await this.dapClient.setBreakpoints({
      source: {
        name: 'query.sql',
        path: '/query.sql'
      },
      breakpoints: breakpoints.map(line => ({ line }))
    });
  }

  toggleBreakpoint(line: number) {
    if (!this.currentSession) {
      this.currentSession = this.debugAdapter.createSession();
    }

    // 获取当前断点并创建新数组
    const session = this.debugAdapter.getActiveSession();
    const currentBreakpoints = session ? [...session.breakpoints] : [];
    const existingIndex = currentBreakpoints.findIndex(bp => bp.line === line);

    if (existingIndex >= 0) {
      // 移除断点
      currentBreakpoints.splice(existingIndex, 1);
    } else {
      // 添加断点
      currentBreakpoints.push({ line });
    }

    this.debugAdapter.setBreakpoints(this.currentSession.id, currentBreakpoints);
    this.updateBreakpointsUI();

    // 如果正在调试，同步到DAP服务器
    if (this.isDebugging) {
      this.syncBreakpoints();
    }
  }

  private getBreakpointLines(): number[] {
    const session = this.debugAdapter.getActiveSession();
    return session ? session.breakpoints.map(bp => bp.line) : [];
  }

  private updateUI() {
    const isRunning = this.isDebugging;
    const isPaused = this.currentSession?.state === 'paused';

    // 更新按钮状态
    if (this.debugButtons.run) {
      this.debugButtons.run.textContent = isPaused ? 'Continue' : 'Run';
      this.debugButtons.run.disabled = false; // Run按钮应该总是可用
    }

    if (this.debugButtons.step) {
      this.debugButtons.step.disabled = !isPaused;
    }

    if (this.debugButtons.stop) {
      this.debugButtons.stop.disabled = !this.isDebugging;
    }

    this.updateBreakpointsUI();
  }

  private updateBreakpointsUI() {
    const breakpointsEl = document.getElementById('breakpoints');
    if (breakpointsEl) {
      const lines = this.getBreakpointLines();
      if (lines.length === 0) {
        breakpointsEl.textContent = 'No breakpoints set';
      } else {
        breakpointsEl.innerHTML = lines
          .sort((a, b) => a - b)
          .map(line => `<div class="breakpoint-item">Line ${line}</div>`)
          .join('');
      }
    }
  }

  private showOutput(output: string) {
    console.log('Output:', output);
    // 可以在这里添加输出面板的显示逻辑
  }

  private showError(message: string) {
    console.error('Debug Error:', message);
    // 可以在这里添加错误显示逻辑，比如弹窗或状态栏
  }

  // 公共API
  async evaluateExpression(expression: string): Promise<string> {
    if (!this.isDebugging || !this.currentSession) {
      throw new Error('Not debugging');
    }

    const session = this.debugAdapter.getActiveSession();
    if (!session || session.state !== 'paused') {
      throw new Error('Debug session is not paused');
    }

    try {
      const response = await this.dapClient.evaluate({
        expression,
        context: 'hover'
      });
      return response.body?.result || '';
    } catch (error) {
      console.error('Failed to evaluate expression:', error);
      throw error;
    }
  }

  async getVariables(): Promise<any[]> {
    if (!this.isDebugging || !this.currentSession) {
      return [];
    }

    try {
      const scopesResponse = await this.dapClient.scopes({ frameId: 1 });
      const scopes = scopesResponse.body?.scopes || [];

      const allVariables = [];
      for (const scope of scopes) {
        if (scope.variablesReference) {
          const varsResponse = await this.dapClient.variables({
            variablesReference: scope.variablesReference
          });
          allVariables.push(...(varsResponse.body?.variables || []));
        }
      }

      return allVariables;
    } catch (error) {
      console.error('Failed to get variables:', error);
      return [];
    }
  }

  connectToolbarButtons(buttons: { [key: string]: HTMLButtonElement }) {
    this.debugButtons = buttons;

    // 绑定事件
    if (buttons.run) {
      buttons.run.addEventListener('click', () => this.runOrContinue());
    }
    if (buttons.step) {
      buttons.step.addEventListener('click', () => this.stepOver());
    }
    if (buttons.stop) {
      buttons.stop.addEventListener('click', () => this.stopDebugging());
    }

    this.updateUI();
  }

  dispose() {
    this.stopDebugging();
    this.dapClient.close();
  }
}