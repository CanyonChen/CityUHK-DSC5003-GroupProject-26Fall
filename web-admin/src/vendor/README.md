# QR decoder

`jsqr.js` wraps the unchanged jsQR 1.4.0 UMD decoder as an ES module. Upstream: https://github.com/cozmo/jsQR/tree/8e6a036beafa7053dd44b1b76ac578d22b1b3311. License: [MIT](jsqr-LICENSE.txt).

The wrapper declares a local CommonJS export object and exports the resulting decoder. Camera frames are decoded locally; no image service or CDN is used.
