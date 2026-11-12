const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");
const DevServerManager = require("./devServerManager");

function validateSender(event) {
  const frame = event?.senderFrame;
  if (!event?.sender || !frame || frame.parent !== null || frame !== event.sender.mainFrame)
    throw new Error("IPC request rejected: top-level application frame required");
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed() || owner.webContents !== event.sender)
    throw new Error("IPC request rejected: unknown window");
  const expected =
    !app.isPackaged && process.env.NODE_ENV === "development"
      ? DevServerManager.DEV_SERVER_URL
      : pathToFileURL(path.join(app.getAppPath(), "src", "dist", "index.html")).href;
  const actual = new URL(frame.url),
    allowed = new URL(expected);
  if (
    actual.protocol !== allowed.protocol ||
    actual.host !== allowed.host ||
    actual.pathname !== allowed.pathname
  )
    throw new Error("IPC request rejected: untrusted document");
  return owner;
}
function trustedIpc(ipc) {
  return {
    handle(channel, callback) {
      ipc.handle(channel, (event, ...args) => {
        validateSender(event);
        return callback(event, ...args);
      });
    },
    on(channel, callback) {
      ipc.on(channel, (event, ...args) => {
        try {
          validateSender(event);
          Promise.resolve(callback(event, ...args)).catch(() =>
            require("./debugLogger").warn("IPC event failed", { channel })
          );
        } catch {
          /* Discard untrusted one-way messages. */
        }
      });
    },
  };
}
module.exports = { validateSender, trustedIpc };
