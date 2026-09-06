const { after, before, describe, test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const express = require('express')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const playwright = require('playwright')
const { spawn } = require('node:child_process')
const browserReload = require('../express-browser-reload.js')

const port = 3000
const baseUrl = `http://localhost:${port}`
const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const clientScript = fs.readFileSync(path.join(__dirname, '../reload-client.js'), 'utf8')

// which browsers the client script is exercised in; both were covered by the old playwright suite so both are kept here
const browsers = ['chromium', 'firefox']

// spins up an express app with express-browser-reload attached to it, mirroring what the sample apps do
// the harness tracks sockets itself so that servers created with skipDeletingConnections can still be shut down, and registering those listeners before express-browser-reload doubles as a regression test that it no longer clobbers listeners the app added first
function startServer (params) {
  const app = express()
  const route = params?.route || '/express-browser-reload.js'

  app.get('/', (req, res) => {
    res.type('text/html')
    res.send(`<!doctype html>
<html>
  <head>
    <title>express-browser-reload test app</title>
  </head>
  <body>
    <p>express-browser-reload test app</p>
    <script src="${route}"></script>
  </body>
</html>`)
  })

  return new Promise((resolve, reject) => {
    const connections = new Set()
    let onWebsocket
    const websocketConnected = new Promise((resolve) => { onWebsocket = resolve })

    const server = app.listen(port, () => resolve({ server, websocketConnected, stop }))
    server.on('error', reject)
    server.on('connection', (connection) => {
      connections.add(connection)
      connection.on('close', () => connections.delete(connection))
    })
    server.on('upgrade', () => onWebsocket())

    browserReload(app, server, params)

    function stop () {
      return new Promise((resolve) => {
        server.close(resolve)
        for (const connection of connections) connection.destroy()
        connections.clear()
      })
    }
  })
}

// performs a websocket handshake by hand so the protocol can be checked without a browser in the way
function openWebsocket (headers = {}) {
  const key = crypto.randomBytes(16).toString('base64')
  const requestHeaders = {
    Host: `localhost:${port}`,
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Key': key,
    'Sec-WebSocket-Version': '13',
    ...headers
  }

  return new Promise((resolve, reject) => {
    const socket = net.connect(port, 'localhost', () => {
      socket.write(`GET / HTTP/1.1\r\n${Object.entries(requestHeaders).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`)
    })
    socket.setTimeout(10000, () => reject(new Error('timed out waiting for a handshake response')))
    socket.once('error', reject)
    socket.once('data', (data) => resolve({ socket, key, response: data.toString() }))
  })
}

describe('serving the client script', () => {
  test('serves it on the default route', async () => {
    const { stop } = await startServer()
    const response = await fetch(`${baseUrl}/express-browser-reload.js`)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(await response.text(), clientScript)

    await stop()
  })

  test('serves it on a custom route instead of the default one', async () => {
    const { stop } = await startServer({ route: '/some-custom-route.js' })

    const custom = await fetch(`${baseUrl}/some-custom-route.js`)
    assert.equal(custom.status, 200)
    assert.equal(await custom.text(), clientScript)

    const original = await fetch(`${baseUrl}/express-browser-reload.js`)
    assert.equal(original.status, 404)

    await stop()
  })
})

describe('validating its arguments', () => {
  test('throws when app is not an express app', () => {
    assert.throws(() => browserReload({}, {}), /`app` is not an Express app/)
    assert.throws(() => browserReload(undefined, {}), /`app` is not an Express app/)
  })

  test('throws when httpServer is not a server', () => {
    const app = express()
    assert.throws(() => browserReload(app, {}), /`httpServer` is not a Server object/)
    assert.throws(() => browserReload(app, undefined), /`httpServer` is not a Server object/)
  })
})

describe('the websocket handshake', () => {
  test('answers a websocket upgrade with a valid 101 response', async () => {
    const { stop } = await startServer()
    const { socket, key, response } = await openWebsocket()

    assert.match(response, /^HTTP\/1\.1 101 /)
    assert.match(response, /Upgrade: websocket/)
    assert.match(response, /Connection: Upgrade/)

    // the accept header proves the server followed RFC 6455 rather than just returning a 101
    const expectedAccept = crypto.createHash('sha1').update(key + websocketGuid, 'binary').digest('base64')
    assert.match(response, new RegExp(`Sec-WebSocket-Accept: ${expectedAccept.replace(/\+/g, '\\+')}`))

    socket.destroy()
    await stop()
  })

  test('ignores upgrade requests that are not for a websocket', async () => {
    const { stop } = await startServer()

    const socket = net.connect(port, 'localhost')
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    socket.write(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nUpgrade: h2c\r\nConnection: Upgrade\r\n\r\n`)

    // nothing should ever come back here, so the server is given a moment to answer and then checked for having stayed quiet
    const response = await Promise.race([
      new Promise((resolve) => socket.once('data', (data) => resolve(data.toString()))),
      new Promise((resolve) => setTimeout(() => resolve(''), 1000))
    ])
    assert.equal(response, '')

    socket.destroy()
    await stop()
  })

  test('leaves upgrade and connection listeners the app registered first intact', async () => {
    const app = express()
    const seen = { upgrade: 0, connection: 0 }

    const server = await new Promise((resolve) => {
      const server = app.listen(port, () => resolve(server))
      server.on('connection', () => { seen.connection++ })
      server.on('upgrade', () => { seen.upgrade++ })
      browserReload(app, server)
    })

    const { socket, response } = await openWebsocket()
    assert.match(response, /101/)
    assert.equal(seen.connection, 1, 'the connection listener the app registered should still fire')
    assert.equal(seen.upgrade, 1, 'the upgrade listener the app registered should still fire')

    socket.destroy()
    await new Promise((resolve) => { server.close(resolve) })
  })
})

describe('purging connections on shutdown', () => {
  test('destroys lingering connections so that server.close() can finish', async () => {
    const app = express()
    const server = await new Promise((resolve) => {
      const server = app.listen(port, () => resolve(server))
      browserReload(app, server)
    })

    const { socket, response } = await openWebsocket()
    assert.match(response, /101/, 'the websocket needs to be established for this test to mean anything')

    // an idle keep alive connection would hold the server open for its full timeout, so it has to be dropped as well
    const agent = new http.Agent({ keepAlive: true })
    await new Promise((resolve, reject) => {
      http.get({ port, path: '/express-browser-reload.js', agent }, (res) => {
        res.resume()
        res.on('end', resolve)
      }).on('error', reject)
    })

    // an upgraded socket is untracked by the server, so without express-browser-reload purging it this close would never call back
    const closed = await Promise.race([
      new Promise((resolve) => { server.close(() => resolve('closed')) }),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 5000))
    ])
    assert.equal(closed, 'closed')

    socket.destroy()
    agent.destroy()
  })

  test('leaves the websocket alone when skipDeletingConnections is true', async () => {
    const app = express()
    const server = await new Promise((resolve) => {
      const server = app.listen(port, () => resolve(server))
      browserReload(app, server, { skipDeletingConnections: true })
    })

    const { socket, response } = await openWebsocket()
    assert.match(response, /101/)

    // opting out means the app takes responsibility for the socket, so close should still be waiting on it
    const closed = await Promise.race([
      new Promise((resolve) => { server.close(() => resolve('closed')) }),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 1500))
    ])
    assert.equal(closed, 'hung')

    socket.destroy()
    await new Promise((resolve) => setTimeout(resolve, 500))
  })
})

for (const browserName of browsers) {
  describe(`reloading the browser in ${browserName}`, () => {
    let browser

    before(async () => { browser = await playwright[browserName].launch() })
    after(async () => { await browser?.close() })

    // the page is stamped with a marker that only survives as long as the page isn't reloaded, which is the only way to tell a real reload from a page that simply still has its original dom
    async function openPage (params) {
      const server = await startServer(params)
      const page = await browser.newPage()

      await page.goto(baseUrl)
      assert.equal(await page.textContent('p'), 'express-browser-reload test app')
      await server.websocketConnected
      await page.evaluate(() => { window.notReloaded = true })

      return { page, server }
    }

    test('reloads the page once the server comes back up', async () => {
      const { page, server } = await openPage()

      await server.stop()
      const restarted = await startServer()

      await page.waitForFunction(() => window.notReloaded === undefined, null, { timeout: 30000 })
      assert.equal(await page.textContent('p'), 'express-browser-reload test app')

      await page.close()
      await restarted.stop()
    }, { timeout: 60000 })

    test('reloads the page when the client script is on a custom route', async () => {
      const params = { route: '/some-custom-route.js' }
      const { page, server } = await openPage(params)

      await server.stop()
      const restarted = await startServer(params)

      await page.waitForFunction(() => window.notReloaded === undefined, null, { timeout: 30000 })

      await page.close()
      await restarted.stop()
    }, { timeout: 60000 })

    test('reloads the page when skipDeletingConnections is true', async () => {
      const params = { skipDeletingConnections: true }
      const { page, server } = await openPage(params)

      await server.stop()
      const restarted = await startServer(params)

      await page.waitForFunction(() => window.notReloaded === undefined, null, { timeout: 30000 })

      await page.close()
      await restarted.stop()
    }, { timeout: 60000 })

    test('gives up with a noisy error once the server stops coming back', async () => {
      const server = await startServer()
      const page = await browser.newPage()

      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))

      // the shipped script retries for roughly four minutes before giving up, which is far too long to sit through here, so the same code runs with the attempt cap turned down
      await page.addInitScript({ content: clientScript.replace('const maxAttempts = 1000', 'const maxAttempts = 2') })
      await page.goto(baseUrl)
      await server.websocketConnected

      // with the server gone for good, every reconnect from here on fails until the cap is hit
      await server.stop()

      const deadline = Date.now() + 20000
      while (errors.length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))

      assert.match(errors[0] ?? '', /express-browser-reload: gave up trying to reach the server/)

      await page.close()
    }, { timeout: 60000 })

    test('leaves the page alone while the server stays up', async () => {
      const { page, server } = await openPage()

      // long enough for several passes of the client's 250ms reconnect loop, which must not reload the page on its own
      await new Promise((resolve) => setTimeout(resolve, 2000))
      assert.equal(await page.evaluate(() => window.notReloaded), true)

      await page.close()
      await server.stop()
    }, { timeout: 60000 })
  })
}

describe('the sample app', () => {
  // the sample app is what the docs tell people to copy, so it's booted the same way a user would boot it
  test('boots and serves the client script', async () => {
    // spawned directly rather than through `npm run` so that killing it actually kills the server rather than leaving an orphan holding the port
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '../sampleApps/express') })
    const stderr = []
    child.stderr.on('data', (data) => stderr.push(data.toString()))

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`the sample app never started. stderr: ${stderr.join('')}`)), 20000)
        child.on('error', reject)
        child.on('exit', (code) => reject(new Error(`the sample app exited early with code ${code}. stderr: ${stderr.join('')}`)))
        child.stdout.on('data', (data) => {
          if (data.toString().includes('server is running on')) {
            clearTimeout(timer)
            resolve()
          }
        })
      })

      const response = await fetch(`${baseUrl}/express-browser-reload.js`)
      assert.equal(response.status, 200)
      assert.equal(await response.text(), clientScript)
    } finally {
      const exited = new Promise((resolve) => child.on('exit', resolve))
      child.kill()
      await exited
    }
  }, { timeout: 40000 })
})
