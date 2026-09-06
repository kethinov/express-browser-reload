## API

These are the parameters you can pass to the constructor.

- `route` *[String]*: What Express route to put the client-side JS file on. Default: `/express-browser-reload.js`.
- `skipDeletingConnections` *[Boolean]*: Whether to skip cleaning up connections when your app closes the Express server. `express-browser-reload` holds a WebSocket open to every page it is loaded on, and a socket handed off to an `upgrade` listener stops being tracked by the server, so an open WebSocket would otherwise keep `server.close()` from ever finishing. By default `express-browser-reload` wraps `server.close()` so that closing the server destroys the WebSockets it opened and calls Node's `server.closeIdleConnections()` for everything else, which drops idle keep-alive connections while letting requests still in flight finish normally. If you are already handling this on your Express server yourself, set this param to `true` to prevent errors and leave `server.close()` untouched. Default: `false`.
