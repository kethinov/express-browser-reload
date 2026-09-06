/* eslint-env browser */
(function reload () {
  // the websocket lives on the same host and port as the page, so the page's own origin is the socket url with the scheme swapped: http -> ws, https -> wss
  const socketUrl = window.location.origin.replace(/^http/, 'ws')

  const reconnectDelay = 250 // milliseconds to wait between attempts to reach the server

  // giving up eventually keeps a page that was left open against a server that is never coming back from retrying silently forever
  const maxAttempts = 1000

  let attempts = 0

  // the socket has to close at least once before an open event is allowed to reload the page, otherwise the socket opening on the very first page load would reload immediately and loop forever
  let serverWentDown = false

  // set when the user navigates away, so that a socket closing as part of the navigation doesn't reload the page out from under it
  let navigatingAway = false

  function connect () {
    setTimeout(() => {
      // throwing surfaces this as an uncaught error in the console rather than leaving the page looking like it's still watching for changes when it has stopped
      if (++attempts > maxAttempts) throw new Error(`express-browser-reload: gave up trying to reach the server at ${socketUrl} after ${maxAttempts} attempts over about ${Math.round(maxAttempts * reconnectDelay / 1000)} seconds. Reload the page once the server is back up.`)

      const socket = new WebSocket(socketUrl)

      // the server is back up, so if it had gone down this is the moment to pick up whatever changed
      socket.onopen = () => {
        attempts = 0 // only consecutive failures count toward giving up, so a long lived page that reconnects many times never runs out of attempts
        if (serverWentDown && !navigatingAway) {
          serverWentDown = false
          window.location.reload()
        }
      }

      // the server going away closes the socket, so keep retrying until it answers again and the open handler above takes over
      socket.onclose = () => {
        serverWentDown = true
        connect()
      }
    }, reconnectDelay)
  }

  // wait for the page to finish loading before connecting for the first time
  window.addEventListener('DOMContentLoaded', connect)

  window.addEventListener('beforeunload', () => { navigatingAway = true })
})()
