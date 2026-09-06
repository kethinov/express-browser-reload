✨ **express-browser-reload** [![npm](https://img.shields.io/npm/v/express-browser-reload.svg)](https://www.npmjs.com/package/express-browser-reload) [![CI](https://github.com/rooseveltframework/express-browser-reload/actions/workflows/ci.yml/badge.svg)](https://github.com/rooseveltframework/express-browser-reload/actions/workflows/ci.yml)

Node.js module to refresh your browser when your [Express](https://expressjs.com) server restarts. Works by using a [WebSocket](https://en.wikipedia.org/wiki/WebSocket) to the server and waits for the WebSocket to close to detect the server restarting. Once the server comes back up, the page will be reloaded.

This project is a hard fork of [reload](https://github.com/alallier/reload), which is a more generalized tool with more features beyond the Express world. This fork is maintained by the [Roosevelt web framework](https://rooseveltframework.org) [team](https://rooseveltframework.org/contributors), but it can be used independently of Roosevelt as well.

<details open>
  <summary>Documentation</summary>
  <ul>
    <li><a href="./USAGE.md">Usage</a></li>
    <li><a href="./CONFIGURATION.md">Configuration</a></li>
  </ul>
</details>
