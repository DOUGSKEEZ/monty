# go2rtc browser player (vendored)

`video-rtc.js` (VideoRTC v1.6.0) and `video-stream.js` from [AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc),
MIT License — see `LICENSE`. Used by the Cameras page for live video (MSE/WebRTC over go2rtc's websocket).

Local change: `video-stream.js` only registers the `<video-stream>` custom element if it isn't already
defined (Vite HMR re-executes modules).
