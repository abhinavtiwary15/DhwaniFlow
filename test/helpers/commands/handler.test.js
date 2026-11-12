"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CommandHandler } = require("../../../src/helpers/commands/handler");

test("CommandHandler: blocked utterances show blocked overlay and do not execute", async () => {
  const handler = new CommandHandler();
  let overlayPayload = null;
  handler.setDependencies({
    windowManager: {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          send: (channel, payload) => {
            if (channel === "command-overlay-update") overlayPayload = payload;
          },
        },
      },
    },
  });

  const result = await handler.handleTranscript("system shutdown karo");
  assert.equal(result.blocked, true);
  assert.equal(overlayPayload?.state, "blocked");

  const history = handler.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "blocked");
});

test("CommandHandler: unknown utterances show samajh nahi aaya overlay and do not execute", async () => {
  const handler = new CommandHandler();
  let overlayPayload = null;
  handler.setDependencies({
    windowManager: {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          send: (channel, payload) => {
            if (channel === "command-overlay-update") overlayPayload = payload;
          },
        },
      },
    },
  });

  const result = await handler.handleTranscript("kuch bhi ultra non existent random sentence");
  assert.equal(result.unknown, true);
  assert.equal(overlayPayload?.state, "unknown");

  const history = handler.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "unknown");
});

test("CommandHandler: cancel utterance cancels immediately", async () => {
  const handler = new CommandHandler();
  let overlayPayload = null;
  handler.setDependencies({
    windowManager: {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          send: (channel, payload) => {
            if (channel === "command-overlay-update") overlayPayload = payload;
          },
        },
      },
    },
  });

  const result = await handler.handleTranscript("ruko");
  assert.equal(result.cancelled, true);
  assert.equal(overlayPayload?.state, "cancelled");

  const history = handler.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "cancelled");
});

test("CommandHandler: cancelPending cancels pending action countdown", async () => {
  const handler = new CommandHandler();
  let overlayEvents = [];
  handler.setDependencies({
    windowManager: {
      mainWindow: {
        isDestroyed: () => false,
        webContents: {
          send: (channel, payload) => {
            if (channel === "command-overlay-update") overlayEvents.push(payload);
          },
        },
      },
    },
  });

  const promise = handler.handleTranscript("naya tab kholo");
  assert.equal(handler.pending !== null, true);
  assert.equal(overlayEvents[0]?.state, "confirming");

  // Cancel immediately before countdown completes
  const didCancel = handler.cancelPending();
  assert.equal(didCancel, true);

  const result = await promise;
  assert.equal(result.cancelled, true);
});

test("CommandHandler: clearHistory resets history list", async () => {
  const handler = new CommandHandler();
  handler.history = [{ id: 1, text: "foo", status: "executed" }];
  assert.equal(handler.getHistory().length, 1);
  handler.clearHistory();
  assert.equal(handler.getHistory().length, 0);
});
