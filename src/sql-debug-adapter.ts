import * as monaco from 'monaco-editor';

export interface SqlDebugSession {
  id: string;
  state: 'running' | 'paused' | 'stopped';
  currentLine: number | null;
  variables: Record<string, any>;
  breakpoints: Array<{ line: number; condition?: string }>;
}

export class SqlDebugAdapter {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private sessions: Map<string, SqlDebugSession> = new Map();
  private activeSessionId: string | null = null;
  private decorators: Map<string, string[]> = new Map();

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.setupDecorations();
  }

  private setupDecorations() {
    // 注入样式
    if (!document.getElementById('debug-decoration-styles')) {
      const style = document.createElement('style');
      style.id = 'debug-decoration-styles';
      style.textContent = `
        .debug-current-line { background: rgba(255, 255, 0, 0.2); }
        .debug-breakpoint {
          background: none !important;
        }
        .debug-breakpoint:before {
          content: '';
          display: block;
          width: 12px;
          height: 12px;
          background: #e11;
          border-radius: 50%;
          margin: 0 0 0 3px;
        }
        .debug-breakpoint.disabled:before {
          background: #999;
        }
        .debug-breakpoint.conditional:before {
          background: #f90;
        }
      `;
      document.head.appendChild(style);
    }
  }

  createSession(): SqlDebugSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: SqlDebugSession = {
      id: sessionId,
      state: 'stopped',
      currentLine: null,
      variables: {},
      breakpoints: []
    };

    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;
    return session;
  }

  getActiveSession(): SqlDebugSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  setBreakpoints(sessionId: string, breakpoints: Array<{ line: number; condition?: string }>) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.breakpoints = breakpoints;
    this.updateBreakpointDecorations();
  }

  updateBreakpointDecorations() {
    const session = this.getActiveSession();
    if (!session) return;

    const decorations = session.breakpoints.map(bp => ({
      range: new monaco.Range(bp.line, 1, bp.line, 1),
      options: {
        glyphMarginClassName: `debug-breakpoint ${bp.condition ? 'conditional' : ''}`,
        glyphMarginHoverMessage: { value: `Breakpoint${bp.condition ? ` (condition: ${bp.condition})` : ''}` },
        isWholeLine: false
      }
    }));

    const sessionDecorators = this.decorators.get(session.id) || [];
    const newDecorators = this.editor.deltaDecorations(sessionDecorators, decorations);
    this.decorators.set(session.id, newDecorators);
  }

  pauseAtLine(sessionId: string, line: number, variables: Record<string, any> = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'paused';
    session.currentLine = line;
    session.variables = { ...session.variables, ...variables };

    this.updateCurrentLineDecoration();
    this.updateVariablesDisplay();
  }

  private updateCurrentLineDecoration() {
    const session = this.getActiveSession();
    if (!session || session.currentLine === null) return;

    const decoration = [{
      range: new monaco.Range(session.currentLine, 1, session.currentLine, 1),
      options: { isWholeLine: true, className: 'debug-current-line' }
    }];

    const currentDecorators = this.decorators.get(`${session.id}_current`) || [];
    const newDecorators = this.editor.deltaDecorations(currentDecorators, decoration);
    this.decorators.set(`${session.id}_current`, newDecorators);
  }

  private updateVariablesDisplay() {
    const session = this.getActiveSession();
    if (!session) return;

    const variablesEl = document.getElementById('variables');
    if (variablesEl) {
      variablesEl.textContent = JSON.stringify(session.variables, null, 2);
    }
  }

  step(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'paused') return;

    const model = this.editor.getModel();
    if (!model) return;

    const nextLine = Math.min((session.currentLine || 1) + 1, model.getLineCount());
    this.pauseAtLine(sessionId, nextLine, {
      step: 'next',
      timestamp: Date.now()
    });
  }

  continue(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'running';

    // Find next breakpoint
    const nextBreakpoint = session.breakpoints
      .filter(bp => bp.line > (session.currentLine || 0))
      .sort((a, b) => a.line - b.line)[0];

    if (nextBreakpoint) {
      setTimeout(() => {
        this.pauseAtLine(sessionId, nextBreakpoint.line, {
          reason: 'breakpoint',
          breakpointLine: nextBreakpoint.line
        });
      }, 500);
    } else {
      // No more breakpoints, stop debugging
      setTimeout(() => {
        this.stop(sessionId);
      }, 1000);
    }
  }

  stop(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'stopped';
    session.currentLine = null;
    session.variables = {};

    // Clear decorations
    const currentDecorators = this.decorators.get(`${sessionId}_current`) || [];
    this.editor.deltaDecorations(currentDecorators, []);
    this.decorators.delete(`${sessionId}_current`);

    this.updateVariablesDisplay();

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
  }

  getVariables(sessionId: string, frameId: number = 0) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Object.entries(session.variables).map(([name, value]) => ({
      name,
      value: String(value),
      type: typeof value,
      variablesReference: 0
    }));
  }

  getScopes(sessionId: string, frameId: number = 0) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return [{
      name: 'Local',
      variablesReference: 1,
      expensive: false,
      presentationHint: 'locals'
    }];
  }

  evaluate(sessionId: string, expression: string, frameId: number = 0) {
    const session = this.sessions.get(sessionId);
    if (!session) return { result: '', variablesReference: 0 };

    try {
      // 简单的表达式求值（模拟）
      if (expression.startsWith('rowcount')) {
        return {
          result: String(Math.floor(Math.random() * 1000)),
          variablesReference: 0
        };
      }

      if (expression === 'line') {
        return {
          result: String(session.currentLine || 0),
          variablesReference: 0
        };
      }

      return {
        result: `Unknown expression: ${expression}`,
        variablesReference: 0
      };
    } catch (error) {
      return {
        result: `Error: ${error}`,
        variablesReference: 0
      };
    }
  }
}