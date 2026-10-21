import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

test('postgame-window manages window lifecycle and registers guarded IPC handlers', () => {
  const ipcHandlers = new Map();
  const mockIpcMain = {
    handle: (name, handler) => {
      if (ipcHandlers.has(name)) throw Error(`Attempted to register a second handler for '${name}'`);
      ipcHandlers.set(name, handler);
    },
    removeHandler: (name) => {
      ipcHandlers.delete(name);
    }
  };

  let createdWindow = null;
  class MockBrowserWindow {
    constructor(options) {
      this.options = options;
      this.visible = false;
      this.destroyed = false;
      this.bounds = {x: options.x, y: options.y, width: options.width, height: options.height};
      this.webContents = {
        id: 101,
        mainFrame: {},
        send: (channel, payload) => {
          this.lastSent = {channel, payload};
        },
        setWindowOpenHandler: () => {},
        on: () => {}
      };
      this.webContents.mainFrame = this.webContents;
      this.eventListeners = new Map();
      createdWindow = this;
    }
    setAlwaysOnTop() {}
    loadFile() {}
    once(event, cb) {
      this.eventListeners.set(event, cb);
    }
    on(event, cb) {
      this.eventListeners.set(event, cb);
    }
    showInactive() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    isVisible() {
      return this.visible;
    }
    isDestroyed() {
      return this.destroyed;
    }
    setBounds(b) {
      this.bounds = b;
    }
    destroy() {
      this.destroyed = true;
      this.visible = false;
    }
  }

  const mockScreen = {
    getPrimaryDisplay: () => ({
      workArea: {x: 0, y: 0, width: 1920, height: 1080}
    })
  };

  const mockElectron = {
    BrowserWindow: MockBrowserWindow,
    ipcMain: mockIpcMain,
    screen: mockScreen
  };

  const createPostgameWindow = require('../electron/postgame-window.cjs');

  let openedHistoryGameId = null;
  const manager = createPostgameWindow({
    root: process.cwd(),
    electron: mockElectron,
    onOpenHistory: (id) => { openedHistoryGameId = id; }
  });

  // Verify IPC registrations
  assert.ok(ipcHandlers.has('postgame-bootstrap'));
  assert.ok(ipcHandlers.has('postgame-reset'));
  assert.ok(ipcHandlers.has('postgame-close'));
  assert.ok(ipcHandlers.has('postgame-open-history'));

  // Initial state
  assert.equal(manager.isVisible(), false);

  // Show report
  const sampleReport = {gameId: 9988, isWin: true, teams: []};
  manager.show(sampleReport);

  assert.ok(createdWindow);
  // Trigger ready-to-show
  createdWindow.eventListeners.get('ready-to-show')?.();
  assert.equal(manager.isVisible(), true);
  assert.deepEqual(createdWindow.lastSent, {channel: 'postgame-update', payload: sampleReport});

  // Verify IPC bootstrap call
  const bootstrapHandler = ipcHandlers.get('postgame-bootstrap');
  const mockSenderEvent = {
    sender: createdWindow.webContents,
    senderFrame: createdWindow.webContents.mainFrame
  };
  const bootstrapResult = bootstrapHandler(mockSenderEvent);
  assert.deepEqual(bootstrapResult, sampleReport);

  // Unauthorized caller fails
  assert.throws(() => bootstrapHandler({sender: {}}), /不允许此操作/);

  // Reuse: showing a new report before displaying never flashes stale panel
  const secondReport = {gameId: 9989, isWin: false, teams: []};
  manager.show(secondReport);
  assert.deepEqual(createdWindow.lastSent, {channel: 'postgame-update', payload: secondReport});
  assert.equal(manager.isVisible(), true);
  // Bootstrap reflects the newest report
  assert.deepEqual(bootstrapHandler(mockSenderEvent), secondReport);

  manager.hide();createdWindow.eventListeners.get('ready-to-show')?.();assert.equal(manager.isVisible(),false);
  manager.show(secondReport);
  // Close via IPC also emits a UI reset to clear the stale panel
  const sentChannels = [];
  const originalSend = createdWindow.webContents.send;
  createdWindow.webContents.send = (channel, payload) => {
    sentChannels.push(channel);
    return originalSend.call(createdWindow.webContents, channel, payload);
  };
  const closeHandler = ipcHandlers.get('postgame-close');
  closeHandler(mockSenderEvent);
  assert.equal(manager.isVisible(), false);
  assert.ok(sentChannels.includes('postgame-reset'));

  // Reset clears bootstrap state without leaking IPC
  const resetHandler = ipcHandlers.get('postgame-reset');
  assert.equal(resetHandler(mockSenderEvent), true);
  assert.equal(bootstrapHandler(mockSenderEvent), null);

  // Open history via IPC
  assert.throws(()=>ipcHandlers.get('postgame-open-history')(mockSenderEvent,9988),/已变化/);
  manager.show(sampleReport);
  const openHistoryHandler = ipcHandlers.get('postgame-open-history');
  openHistoryHandler(mockSenderEvent, 9988);
  assert.equal(openedHistoryGameId, 9988);

  // Destroy unloads IPC
  manager.destroy();
  assert.equal(createdWindow.isDestroyed(), true);
  assert.equal(ipcHandlers.has('postgame-bootstrap'), false);
  assert.equal(ipcHandlers.has('postgame-reset'), false);
  assert.equal(ipcHandlers.has('postgame-close'), false);
  assert.equal(ipcHandlers.has('postgame-open-history'), false);
});
