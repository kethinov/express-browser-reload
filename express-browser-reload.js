const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

// magic string from RFC 6455 that the websocket handshake response is derived from
const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

// the client script can't change while the server is running, so read it once at startup instead of on every request
const clientScript = fs.readFileSync(path.join(__dirname, 'reload-client.js'), 'utf8')

module.exports = (app, httpServer, params) => {
  if (typeof app?.get !== 'function') throw new Error('express-browser-reload: `app` is not an Express app.')

  // duck typed rather than checked with `instanceof http.Server` so that https servers, which don't inherit from it, are accepted too
  if (typeof httpServer?.on !== 'function' || typeof httpServer?.close !== 'function' || typeof httpServer?.getConnections !== 'function') throw new Error('express-browser-reload: `httpServer` is not a Server object.')

  const websockets = new Set()

  // this listener is appended rather than swapped in so that any upgrade listeners the app registered itself keep working
  httpServer.on('upgrade', (request, socket) => {
    // ignore upgrades meant for something other than a websocket, such as another websocket library sharing this server
    if (request.headers.upgrade?.toLowerCase() !== 'websocket' || !request.headers['sec-websocket-key']) return

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${crypto
        .createHash('sha1')
        .update(request.headers['sec-websocket-key'] + websocketGuid, 'binary')
        .digest('base64')}`
    ].join('\r\n') + '\r\n\r\n')

    websockets.add(socket)
    socket.on('close', () => websockets.delete(socket)) // once the socket closes, remove it
  })

  if (!params?.skipDeletingConnections) {
    // a socket handed off to an upgrade listener stops being tracked by the server, and `closeIdleConnections()` won't touch it either, so without this the websockets above would keep `server.close()` from ever finishing
    const originalClose = httpServer.close.bind(httpServer)
    httpServer.close = (...args) => {
      const result = originalClose(...args)

      // only the sockets this module opened are destroyed outright, since nothing else can clean them up
      for (const websocket of websockets) websocket.destroy()
      websockets.clear()

      // everything else is left to Node, which drops keep alive connections that are sitting idle while letting requests still in flight finish normally
      httpServer.closeIdleConnections()

      return result
    }
  }

  app.get(params?.route || '/express-browser-reload.js', (req, res) => {
    res.type('text/javascript')
    res.send(clientScript)
  })
}
