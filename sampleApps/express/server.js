const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.type('text/html')
  res.send(`<!doctype html>
<html>
  <head>
    <title>express-browser-reload express sample</title>
  </head>
  <body>
    <p>express-browser-reload express sample</p>
    <!-- all you have to do is include the reload script and have it be on every page of your project -->
    <!-- you do not create this route, reload creates it for you automatically -->
    <script src="/express-browser-reload.js"></script>
  </body>
</html>`)
})

const server = app.listen(3000, () => console.log('🎧 express-browser-reload express sample app server is running on http://localhost:3000'))

// params for express-browser-reload (currently set to the defaults)
const params = {
  route: '/express-browser-reload.js',
  skipDeletingConnections: false
}

require('../../express-browser-reload')(app, server, params)
