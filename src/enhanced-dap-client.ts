export type DAPEventHandler = (event: any) => void

export interface DAPResponse {
  type: 'response';
  seq: number;
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: any;
}

export interface DAPEvent {
  type: 'event';
  seq: number;
  event: string;
  body?: any;
}

export interface DAPRequest {
  type: 'request';
  seq: number;
  command: string;
  arguments?: any;
}

export class EnhancedDAPClient {
  private ws: WebSocket | null = null;
  private seq = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private eventHandlers: Map<string, DAPEventHandler[]> = new Map();
  private ready: Promise<void>;
  private _readyResolve!: () => void;
  private _readyReject!: (err: any) => void;
  private isInitialized = false;

  constructor(private url: string) {
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  }

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('DAP WebSocket connected');
        this._readyResolve();
      };

      this.ws.onerror = (error) => {
        console.error('DAP WebSocket error:', error);
        this._readyReject(error);
      };

      this.ws.onclose = (event) => {
        console.log('DAP WebSocket closed:', event);
        if (!event.wasClean) {
          this._readyReject(new Error('Connection closed unexpectedly'));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse DAP message:', error);
        }
      };

      return this.ready;
    } catch (error) {
      this._readyReject(error);
      throw error;
    }
  }

  private handleMessage(message: DAPResponse | DAPEvent) {
    if (message.type === 'event') {
      this.handleEvent(message as DAPEvent);
    } else if (message.type === 'response') {
      this.handleResponse(message as DAPResponse);
    }
  }

  private handleEvent(event: DAPEvent) {
    const handlers = this.eventHandlers.get(event.event) || [];
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.event}:`, error);
      }
    });
  }

  private handleResponse(response: DAPResponse) {
    const pending = this.pending.get(response.request_seq);
    if (pending) {
      if (response.success) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.message || 'DAP request failed'));
      }
      this.pending.delete(response.request_seq);
    }
  }

  async sendRequest<T = any>(command: string, arguments_?: any): Promise<T> {
    await this.ready;

    const seq = this.seq++;
    const request: DAPRequest = {
      type: 'request',
      seq,
      command,
      arguments: arguments_
    };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(request));
      } else {
        reject(new Error('WebSocket is not connected'));
      }
    });
  }

  // DAP Debug Protocol Methods
  async initialize(args: {
    clientID?: string;
    clientName?: string;
    adapterID?: string;
    locale?: string;
    linesStartAt1?: boolean;
    columnsStartAt1?: boolean;
    pathFormat?: string;
    supportsVariableType?: boolean;
    supportsVariablePaging?: boolean;
    supportsRunInTerminalRequest?: boolean;
  }) {
    const response = await this.sendRequest('initialize', args);
    this.isInitialized = true;
    return response;
  }

  async setBreakpoints(args: {
    source: { name?: string; path?: string };
    breakpoints: Array<{ line: number; column?: number; condition?: string; hitCondition?: string; logMessage?: string }>;
    sourceModified?: boolean;
  }) {
    return this.sendRequest('setBreakpoints', args);
  }

  async setExceptionBreakpoints(args: {
    filters: string[];
    exceptionOptions?: any;
  }) {
    return this.sendRequest('setExceptionBreakpoints', args);
  }

  async launch(args: any) {
    return this.sendRequest('launch', args);
  }

  async attach(args: any) {
    return this.sendRequest('attach', args);
  }

  async configurationDone() {
    return this.sendRequest('configurationDone');
  }

  async continue(args: { threadId: number }) {
    return this.sendRequest('continue', args);
  }

  async next(args: { threadId: number }) {
    return this.sendRequest('next', args);
  }

  async stepIn(args: { threadId: number }) {
    return this.sendRequest('stepIn', args);
  }

  async stepOut(args: { threadId: number }) {
    return this.sendRequest('stepOut', args);
  }

  async pause(args: { threadId: number }) {
    return this.sendRequest('pause', args);
  }

  async stackTrace(args: {
    threadId: number;
    startFrame?: number;
    levels?: number;
    format?: string;
  }) {
    return this.sendRequest('stackTrace', args);
  }

  async scopes(args: { frameId: number }) {
    return this.sendRequest('scopes', args);
  }

  async variables(args: {
    variablesReference: number;
    filter?: string;
    start?: number;
    count?: number;
    format?: string;
  }) {
    return this.sendRequest('variables', args);
  }

  async evaluate(args: {
    expression: string;
    frameId?: number;
    context?: string;
    format?: string;
  }) {
    return this.sendRequest('evaluate', args);
  }

  async threads() {
    return this.sendRequest('threads');
  }

  async disconnect(args?: { restart?: boolean; terminateDebuggee?: boolean }) {
    return this.sendRequest('disconnect', args);
  }

  async terminate(args?: { restart?: boolean }) {
    return this.sendRequest('terminate', args);
  }

  async restart(args?: any) {
    return this.sendRequest('restart', args);
  }

  // Event handling
  onEvent(event: string, handler: DAPEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  offEvent(event: string, handler: DAPEventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Additional event methods for compatibility
  onTerminated(handler: DAPEventHandler) {
    this.onEvent('terminated', handler);
  }

  onExited(handler: DAPEventHandler) {
    this.onEvent('exited', handler);
  }

  // Convenience methods for common events
  onStopped(handler: DAPEventHandler) {
    this.onEvent('stopped', handler);
  }

  onContinued(handler: DAPEventHandler) {
    this.onEvent('continued', handler);
  }

  onThreadStarted(handler: DAPEventHandler) {
    this.onEvent('thread', handler);
  }

  onThreadExited(handler: DAPEventHandler) {
    this.onEvent('thread', handler);
  }

  onOutput(handler: DAPEventHandler) {
    this.onEvent('output', handler);
  }

  onBreakpoint(handler: DAPEventHandler) {
    this.onEvent('breakpoint', handler);
  }

  onModule(handler: DAPEventHandler) {
    this.onEvent('module', handler);
  }

  onLoadedSource(handler: DAPEventHandler) {
    this.onEvent('loadedSource', handler);
  }

  onProcess(handler: DAPEventHandler) {
    this.onEvent('process', handler);
  }

  onCapabilities(handler: DAPEventHandler) {
    this.onEvent('capabilities', handler);
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pending.clear();
    this.eventHandlers.clear();
    this.isInitialized = false;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}