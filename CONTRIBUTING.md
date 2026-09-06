# How to contribute

## Setting up

- Install the dependencies: `npm ci`.
- Install the browsers the tests drive: `npx playwright install chromium firefox`.

## Before opening a pull request

- Be sure all tests pass: `npm t`.
- Ensure good test coverage and write new tests if necessary: `npm run coverage`. Coverage is enforced at 100% and will fail the build below that. Note that `reload-client.js` runs in the browser rather than in Node, so it doesn't appear in the coverage report even though the browser tests exercise it — cover changes to it with a browser test.
- Be sure the linter is happy: `npm run lint`. Most problems can be fixed automatically with `npm run lint-fix`.
- Add your changes to `CHANGELOG.md`.

## Release process

If you are a maintainer, please follow the following release procedure:

- Merge all desired pull requests into main.
- Bump `package.json` to a new version and run `npm i` to generate a new `package-lock.json`.
- Add new version to CHANGELOG.
- Paste contents of CHANGELOG into new version commit.
- Open and merge a pull request with those changes.
- Tag the merge commit as the a new release version number.
- Publish commit to npm.
- Submit a pull request to the Roosevelt website [following the instructions here](https://github.com/rooseveltframework/roosevelt-website/blob/main/CONTRIBUTING.md).
