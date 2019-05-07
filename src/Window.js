const events = require('events');
const {EventEmitter} = events;
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const util = require('util');
const {URL} = url;
const {TextEncoder, TextDecoder} = util;
const {XRRigidTransform} = require('./XR.js');
const {performance} = require('perf_hooks');
const {
  workerData: {
    args: {
      options,
      id,
      args,
      version,
      xrState,
    },
  },
} = require('worker_threads');

const {WorkerVm} = require('./WindowVm.js');
const {FileReader} = require('./File.js');

const mkdirp = require('mkdirp');
const ws = require('ws');
const {XMLHttpRequest: XMLHttpRequestBase, FormData} = require('window-xhr');

const fetch = require('window-fetch');
const {Request, Response, Headers, Blob} = fetch;

const core = require('./core.js');

const WebSocket = require('ws/lib/websocket');
const {
  /* getUserMedia,
  MediaStream,
  MediaStreamTrack,
  RTCDataChannel, */
  RTCIceCandidate,
  RTCPeerConnection,
  /* RTCPeerConnectionIceEvent,
  RTCRtpReceiver,
  RTCRtpSender, */
  RTCRtpTransceiver,
  RTCSessionDescription,

  RTCPeerConnectionIceEvent,
  RTCDataChannelEvent,
  RTCDataChannelMessageEvent,
  RTCTrackEvent,
} = require('./RTC/index.js');

const {LocalStorage} = require('node-localstorage');
const indexedDB = require('fake-indexeddb');
const parseXml = require('@rgrove/parse-xml');
const THREE = require('../lib/three-min.js');
const {
  MRDisplay,
  VRDisplay,
  FakeVRDisplay,
  VRFrameData,
  VRPose,
  VRStageParameters,
  Gamepad,
  GamepadButton,
  getGamepads,
  getHMDType,
} = require('./VR.js');

const {maxNumTrackers} = require('./constants');
const GlobalContext = require('./GlobalContext');
const symbols = require('./symbols');
const {urls} = require('./urls');

const {
  nativeImage: Image,
  nativeImageData: ImageData,
  nativeImageBitmap: ImageBitmap,
  nativePath2D: Path2D,
  nativeCanvasGradient: CanvasGradient,
  nativeCanvasRenderingContext2D: CanvasRenderingContext2D,
  nativeGl: WebGLRenderingContext,
  nativeGl2: WebGL2RenderingContext,
  nativeAudio: {
    AudioContext,
    AudioNode,
    AudioBufferSourceNode,
    OscillatorNode,
    AudioDestinationNode,
    AudioParam,
    AudioListener,
    GainNode,
    AnalyserNode,
    PannerNode,
    StereoPannerNode,
    MicrophoneMediaStream,
  },
  nativeVideo: {
    Video,
    VideoDevice,
  },
  nativeOpenVR,
  nativeOculusVR,
  nativeOculusMobileVr,
  nativeMl,
  nativeBrowser,
  nativeWindow,
} = require('./native-bindings');

const PHASES = (() => {
  let phase = 0;
  return {
    NULL: phase++,
    RENDERING: phase++,
    RENDERED: phase++,
    DONE: phase++,
  };
})();

GlobalContext.id = id;
GlobalContext.args = args;
GlobalContext.version = version;
GlobalContext.xrState = xrState;

const {_parseDocument, _parseDocumentAst, getBoundDocumentElements, DocumentType, DOMImplementation, initDocument} = require('./Document');
const {
  HTMLElement,
  getBoundDOMElements,
  NodeList,
  HTMLCollection,
  DOMRect,
  DOMPoint,
  createImageBitmap,
} = require('./DOM');
const {CustomEvent, DragEvent, ErrorEvent, Event, EventTarget, KeyboardEvent, MessageEvent, MouseEvent, WheelEvent, PromiseRejectionEvent} = require('./Event');
const {History} = require('./History');
const {Location} = require('./Location');
const {XMLHttpRequest} = require('./Network');
const XR = require('./XR');
const DevTools = require('./DevTools');
const utils = require('./utils');
const {_elementGetter, _elementSetter, _download} = utils;

const btoa = s => Buffer.from(s, 'binary').toString('base64');
const atob = s => Buffer.from(s, 'base64').toString('binary');

const isMac = os.platform() === 'darwin';

const zeroMatrix = new THREE.Matrix4();
const localFloat32Array = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array2 = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array3 = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array4 = new Float32Array(16);
const localFloat32PoseArray = new Float32Array(16*(1+2+maxNumTrackers));
const localFloat32HmdPoseArray = new Float32Array(localFloat32PoseArray.buffer, localFloat32PoseArray.byteOffset + 0*Float32Array.BYTES_PER_ELEMENT*16, 16);
const localFloat32GamepadPoseArrays = [
  new Float32Array(localFloat32PoseArray.buffer, localFloat32PoseArray.byteOffset + 1*Float32Array.BYTES_PER_ELEMENT*16, 16),
  new Float32Array(localFloat32PoseArray.buffer, localFloat32PoseArray.byteOffset + 2*Float32Array.BYTES_PER_ELEMENT*16, 16),
];
const localFloat32TrackerPoseArrays = (() => {
  const result = Array(maxNumTrackers);
  for (let i = 0; i < maxNumTrackers; i++) {
    result[i] = new Float32Array(localFloat32PoseArray.buffer, localFloat32PoseArray.byteOffset + (3+i)*Float32Array.BYTES_PER_ELEMENT*16, 16);
  }
  return result;
})();
const localFloat32MatrixArray = new Float32Array(16);
const localFovArray = new Float32Array(4);
const localGamepadArray = new Float32Array(24);

const localPositionArray3 = new Float32Array(3);
const localQuaternionArray4 = new Float32Array(4);

const leftControllerPositionArray3 = new Float32Array(3);
const leftControllerQuaternionArray4 = new Float32Array(4);
const rightControllerPositionArray3 = new Float32Array(3);
const rightControllerQuaternionArray4 = new Float32Array(4);

const oculusMobilePoseFloat32Array = new Float32Array(3 + 4 + 1 + 4 + (16*2) + (16*2) + (16+5) + (16+5));

// const handEntrySize = (1 + (5 * 5)) * (3 + 3);
const transformArray = new Float32Array(7 * 2);
const projectionArray = new Float32Array(16 * 2);
/* const handsArray = [
  new Float32Array(handEntrySize),
  new Float32Array(handEntrySize),
]; */
const controllersArray = new Float32Array((1 + 3 + 4 + 6) * 2);

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();

const windows = [];
GlobalContext.windows = windows;
const contexts = [];
GlobalContext.contexts = contexts;

const vrPresentState = {
  /* vrContext: null,
  system: null,
  oculusSystem: null,
  compositor: null,
  glContextId: 0, */
  hmdType: null,
  vrContext: null,
  glContext: null,
  fbo: 0,
  msFbo: 0,
  msTex: 0,
  msDepthTex: 0,
  // tex: null,
  // depthTex: null,
  // hasPose: false,
  // lmContext: null,
  layers: [],
  responseAccept: null,
};
GlobalContext.vrPresentState = vrPresentState;

const oculusMobileVrPresentState = {
  vrContext: null,
  isPresenting: false,
  glContextId: 0,
  cleanups: null,
  hasPose: false,
};
GlobalContext.oculusMobileVrPresentState = oculusMobileVrPresentState;

const mlPresentState = {
  mlContext: null,
  msFbo: null,
  msTex: null,
  msDepthTex: null,
  mlGlContextId: 0,
  mlCleanups: null,
  mlHasPose: false,
};
GlobalContext.mlPresentState = mlPresentState;

const fakePresentState = {
  fakeVrDisplay: null,
};
GlobalContext.fakePresentState = fakePresentState;

/* const _getVrGlContext = () => contexts.find(context => context.contextId === vrPresentState.glContextId);
const _getOculusVrGlContext = () => vrPresentState.oculusSystem ? contexts.find(context => context.contextId === vrPresentState.glContextId) : undefined;
const _getOpenVrGlContext = () => vrPresentState.system ? contexts.find(context => context.contextId === vrPresentState.glContextId) : undefined;
const _getOculusMobileVrGlContext = () => oculusMobileVrPresentState.vrContext ? contexts.find(context => context.contextId === oculusMobileVrPresentState.glContextId) : undefined;
const _getMlGlContext = () => contexts.find(context => context.contextId === mlPresentState.mlGlContextId); */

class CustomElementRegistry {
  constructor(window) {
    this._window = window;

    this.elements = {};
    this.extensions = {};
    this.elementPromises = {};
  }

  define(name, constructor, options = {}) {
    name = name.toUpperCase();

    this.elements[name] = constructor;
    if (options.extends) {
      this.extensions[options.extends.toUpperCase()] = name.toLowerCase();
    }

    this._window.document.traverse(el => {
      if (el.tagName === name) {
        this.upgrade(el, constructor);
      }
    });

    const promises = this.elementPromises[name];
    if (promises) {
      for (let i = 0; i < promises.length; i++) {
        promises[i].accept();
      }
      this.elementPromises[name] = null;
    }
  }
  get(name) {
    name = name.toUpperCase();

    return this.elements[name];
  }
  whenDefined(name) {
    name = name.toUpperCase();

    if (this.elements[name]) {
      return Promise.resolve();
    } else {
      let promises = this.elementPromises[name];
      if (!promises) {
        promises = [];
        this.elementPromises[name] = promises;
      }
      const promise = new Promise((accept, reject) => {
        promise.accept = accept;
        promise.reject = reject;
      });
      promises.push(promise);
      return promise;
    }
  }

  upgrade(el, constructor) {
    if (el instanceof HTMLElement) {
      let wasConnected = el.isConnected;
      el.ownerDocument.on('domchange', () => {
        const newConnected = el.isConnected;
        if (newConnected && !wasConnected) {
          el.connectedCallback && el.connectedCallback();
          wasConnected = true;
        } else if (wasConnected && !newConnected) {
          el.disconnectedCallback && el.disconnectedCallback();
          wasConnected = false;
        }
      });

      const observedAttributes = constructor.observedAttributes ? constructor.observedAttributes() : [];
      if (observedAttributes.length > 0) {
        el.on('attribute', (name, value, oldValue) => {
          if (el.attributeChangedCallback && observedAttributes.includes(name)) {
            el.attributeChangedCallback(name, value, oldValue);
          }
        });
      }

      Object.setPrototypeOf(el, constructor.prototype);
      HTMLElement.upgradeElement = el;
      let error = null;
      try {
        Object.setPrototypeOf(el, constructor.prototype);
        Reflect.construct(constructor, []);
      } catch(err) {
        error = err;
      }
      HTMLElement.upgradeElement = null;

      if (!error) {
        if (wasConnected) {
          setImmediate(() => {
            el.connectedCallback && el.connectedCallback();
          });
        }
      } else {
        throw error;
      }
    } else {
      throw new Error('cannot upgrade non-subclass of HTMLElement');
    }
  }
}

class MonitorManager {
  getList() {
    return nativeWindow.getMonitors();
  }

  select(index) {
    nativeWindow.setMonitor(index);
  }
}

class Screen {
  constructor(window) {
    this._window = window;
  }

  get top() {
    return 0;
  }
  set top(top) {}
  get left() {
    return 0;
  }
  set left(left) {}
  get width() {
    return this._window.innerWidth;
  }
  set width(width) {}
  get height() {
    return this._window.innerHeight;
  }
  set height(height) {}
  get colorDepth() {
    return 24;
  }
  set colorDepth(colorDepth) {}
  get orientation() {
    return {
      angle: 0,
      type: 'landscape-primary',
      onchange: null,
    };
  }
  set orientation(orientation) {}

  get pixelDepth() {
    return this.colorDepth;
  }
  set pixelDepth(pixelDepth) {}
  get availTop() {
    return this.top;
  }
  set availTop(availTop) {}
  get availLeft() {
    return this.left;
  }
  set availLeft(availLeft) {}
  get availWidth() {
    return this.width;
  }
  set availWidth(availWidth) {}
  get availHeight() {
    return this.height;
  }
  set availHeight(availHeight) {}
}

class MediaRecorder extends EventEmitter {
  constructor() {
    super();
  }

  start() {}

  stop() {}

  requestData() {}
}

class DataTransfer {
  constructor({items = [], files = []} = {}) {
    this.items = items;
    this.files = files;
  }
}
class DataTransferItem {
  constructor(kind = 'string', type = 'text/plain', data = null) {
    this.kind = kind;
    this.type = type;
    this.data = data;
  }

  getAsFile() {
    return new Blob([this.data], {
      type: this.type,
    });
  }

  getAsString(callback) {
    const {data} = this;
    setImmediate(() => {
      callback(data);
    });
  }
}

class Worker {
  constructor(src) {
    this.worker = new WorkerVm({
      initModule: path.join(__dirname, 'Worker.js'),
      args: {
        src,
      },
    });
  }

  postMessage(message, transferList) {
    this.worker.postMessage(message, transferList);
  }

  get onmessage() {
    return this.worker.onmessage;
  }
  set onmessage(onmessage) {
    this.worker.onmessage = onmessage;
  }
  get onerror() {
    return this.worker.onerror;
  }
  set onerror(onerror) {
    this.worker.onerror = onerror;
  }
}

let rafIndex = 0;
const _findFreeSlot = a => {
  let i;
  for (i = 0; i < a.length; i++) {
    if (a[i] === null) {
      break;
    }
  }
  return i;
};
const _makeRequestAnimationFrame = window => (fn, priority = 0) => {
  fn = fn.bind(window);
  if (!fn) { console.log('TKTK'); throw new Error("fn is null"); }
  fn[symbols.prioritySymbol] = priority;
  const id = ++rafIndex;
  fn[symbols.idSymbol] = id;
  const rafCbs = window[symbols.rafCbsSymbol];
  rafCbs[_findFreeSlot(rafCbs)] = fn;
  rafCbs.sort((a, b) => (b ? b[symbols.prioritySymbol] : 0) - (a ? a[symbols.prioritySymbol] : 0));
  return id;
};
const _makeOnRequestHitTest = window => (origin, direction, cb) => nativeMl.RequestHitTest(origin, direction, cb, window);

const _normalizeUrl = utils._makeNormalizeUrl(options.baseUrl);

(window => {
  for (const k in EventEmitter.prototype) {
    window[k] = EventEmitter.prototype[k];
  }
  EventEmitter.call(window);

  window.window = window;
  window.self = window;
  window.parent = options.parent || window;
  window.top = options.top || window;

  Object.defineProperty(window, 'innerWidth', {
    get() {
      if (!GlobalContext.xrState.metrics[0]) {
        const screenSize = nativeWindow.getScreenSize();
        GlobalContext.xrState.metrics[0] = screenSize[0]/2;
        // GlobalContext.xrState.metrics[1] = screenSize[1]/2;
      }
      return GlobalContext.xrState.metrics[0];
    },
    set(innerWidth) {
      GlobalContext.xrState.metrics[0] = innerWidth;
    },
  });
  Object.defineProperty(window, 'innerHeight', {
    get() {
      if (!GlobalContext.xrState.metrics[1]) {
        const screenSize = nativeWindow.getScreenSize();
        // GlobalContext.xrState.metrics[0] = screenSize[0]/2;
        GlobalContext.xrState.metrics[1] = screenSize[1]/2;
      }
      return GlobalContext.xrState.metrics[1];
    },
    set(innerHeight) {
      GlobalContext.xrState.metrics[1] = innerHeight;
    },
  });
  Object.defineProperty(window, 'devicePixelRatio', {
    get() {
      if (!GlobalContext.xrState.devicePixelRatio[0]) {
        GlobalContext.xrState.devicePixelRatio[0] = nativeWindow.getDevicePixelRatio();
      }
      return GlobalContext.xrState.devicePixelRatio[0];
    },
    set(devicePixelRatio) {},
  });
  window.document = null;
  const location = new Location(options.url);
  Object.defineProperty(window, 'location', {
    get() {
      return location;
    },
    set(href) {
      href = href + '';
      location.href = href;
    },
  });
  window.history = new History(location.href);
  function getUserMedia(constraints) {
    if (constraints.audio) {
      return Promise.resolve(new MicrophoneMediaStream());
    } else if (constraints.video) {
      const dev = new VideoDevice();
      dev.constraints = constraints.video;
      return Promise.resolve(dev);
    } else {
      return Promise.reject(new Error('constraints not met'));
    }
  }
  window.navigator = {
    userAgent: `Mozilla/5.0 (OS) AppleWebKit/999.0 (KHTML, like Gecko) Chrome/999.0.0.0 Safari/999.0 Exokit/${GlobalContext.version}`,
    vendor: 'Exokit',
    platform: os.platform(),
    hardwareConcurrency: os.cpus().length,
    appCodeName: 'Mozilla',
    appName: 'Netscape',
    appVersion: '5.0',
    language: 'en-US',
    mediaDevices: {
      getUserMedia,
      enumerateDevices() {
        let deviceIds = 0;
        let groupIds = 0;
        return Promise.resolve([
          {
            deviceId: (++deviceIds) + '',
            groupId: (++groupIds) + '',
            kind: 'audioinput',
            label: 'Microphone',
          },
        ]);
      },
    },
    webkitGetUserMedia: getUserMedia, // for feature detection
    getVRDisplaysSync() {
      const hmdType = getHMDType();

      if (hmdType) {
        if (hmdType === 'fake') {
          return [window[symbols.mrDisplaysSymbol].fakeVrDisplay];
        } else {
          return [window[symbols.mrDisplaysSymbol].vrDisplay];
        }
      } else {
        return [];
      }
    },
    createVRDisplay() {
      xrState.fakeVrDisplayEnabled[0] = 1;
      return window[symbols.mrDisplaysSymbol].fakeVrDisplay;
    },
    getGamepads: getGamepads.bind(null, window),
    clipboard: {
      read: () => Promise.resolve(), // Not implemented yet
      readText: () => new Promise(resolve => {
        resolve(nativeWindow.getClipboard().slice(0, 256));// why do we slice this?
      }),
      write: () => Promise.resolve(), // Not implemented yet
      writeText: clipboardContents => new Promise(resolve => {
        nativeWindow.setClipboard(clipboardContents);
        resolve();
      })
    }
  };

  // WebVR enabled.
  if (['all', 'webvr'].includes(options.args.xr)) {
    window.navigator.getVRDisplays = function() {
      return Promise.resolve(this.getVRDisplaysSync());
    }
  }

  // WebXR enabled.
  if (['all', 'webxr'].includes(options.args.xr)) {
    window.navigator.xr = new XR.XR(window);
  }

  window.URL = URL;
  window.console = console;
  window.alert = console.log;
  window.setTimeout = (setTimeout => (fn, timeout, args) => {
    fn = fn.bind.apply(fn, [window].concat(args));
    let id = _findFreeSlot(timeouts);
    id++;
    timeouts[id] = fn;
    fn[symbols.timeoutSymbol] = setTimeout(fn, timeout, args);
    return id;
  })(setTimeout);
  window.clearTimeout = (clearTimeout => id => {
    const fn = timeouts[id];
    if (fn) {
      clearTimeout(fn[symbols.timeoutSymbol]);
      timeouts[id] = null;
    }
  })(clearTimeout);
  window.setInterval = (setInterval => (fn, interval, args) => {
    if (interval < 10) {
      interval = 10;
    }
    fn = fn.bind.apply(fn, [window].concat(args));
    let id = _findFreeSlot(intervals);
    id++;
    intervals[id] = fn;
    fn[symbols.timeoutSymbol] = setInterval(fn, interval, args);
    return id;
  })(setInterval);
  window.clearInterval = (clearInterval => id => {
    const fn = intervals[id];
    if (fn) {
      clearInterval(fn[symbols.timeoutSymbol]);
      intervals[id] = null;
    }
  })(clearInterval);
  const _maybeDownload = (m, u, data, bufferifyFn) => options.args.download ? _download(m, u, data, bufferifyFn, options.args.download) : data;
  window.fetch = (u, options) => {
    const _boundFetch = (u, options) => fetch(u, options)
      .then(res => {
        const method = (options && options.method) || 'GET';
        res.arrayBuffer = (fn => function() {
          return fn.apply(this, arguments)
            .then(ab => _maybeDownload(method, u, ab, ab => Buffer.from(ab)));
        })(res.arrayBuffer);
        res.blob = (fn => function() {
          return fn.apply(this, arguments)
            .then(blob => _maybeDownload(method, u, blob, blob => blob.buffer));
        })(res.blob);
        res.json = (fn => function() {
          return fn.apply(this, arguments)
            .then(j => _maybeDownload(method, u, j, j => Buffer.from(JSON.stringify(j))));
        })(res.json);
        res.text = (fn => function() {
          return fn.apply(this, arguments)
            .then(t => _maybeDownload(method, u, t, t => Buffer.from(t, 'utf8')));
        })(res.text);

        return res;
      });

    if (typeof u === 'string') {
      const blob = urls.get(u);
      if (blob) {
        return Promise.resolve(new Response(blob));
      } else {
        u = _normalizeUrl(u);
        return _boundFetch(u, options);
      }
    } else {
      return _boundFetch(u, options);
    }
  };
  window.Request = Request;
  window.Response = Response;
  window.Headers = Headers;
  window.Blob = Blob;
  window.FormData = FormData;
  window.XMLHttpRequest = (Old => {
    class XMLHttpRequest extends Old {
      open(method, url, async, username, password) {
        url = _normalizeUrl(url);
        return super.open(method, url, async, username, password);
      }
      get response() {
        return _maybeDownload(this._properties.method, this._properties.uri, super.response, o => {
          switch (this.responseType) {
            case 'arraybuffer': return Buffer.from(o);
            case 'blob': return o.buffer;
            case 'json': return Buffer.from(JSON.stringify(o), 'utf8');
            case 'text': return Buffer.from(o, 'utf8');
            default: throw new Error(`cannot download responseType ${responseType}`);
          }
        });
      }
    }
    for (const k in XMLHttpRequestBase) {
      XMLHttpRequest[k] = XMLHttpRequestBase[k];
    }
    return XMLHttpRequest;
  })(XMLHttpRequest);
  window.WebSocket = WebSocket;
  window.crypto = {
    getRandomValues(typedArray) {
      crypto.randomFillSync(Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength));
      return typedArray;
    },

    subtle: {
      digest(algo, bytes) {
        switch (algo) {
          case 'SHA-1': {
            algo = 'sha1';
            break;
          }
          case 'SHA-256': {
            algo = 'sha256';
            break;
          }
          case 'SHA-384': {
            algo = 'sha384';
            break;
          }
          case 'SHA-512': {
            algo = 'sha512';
            break;
          }
          default: throw new Error(`unknown algorithm: ${algo}`);
        }
        const hash = crypto.createHash(algo).update(bytes).digest();
        const result = new ArrayBuffer(hash.byteLength);
        new Buffer(result).set(hash);
        return Promise.resolve(result);
      },
    },
  };
  window.event = new Event(); // XXX this needs to track the current event
  window.localStorage = new LocalStorage(path.join(options.dataPath, '.localStorage'));
  window.sessionStorage = new LocalStorage(path.join(options.dataPath, '.sessionStorage'));
  window.indexedDB = indexedDB;
  window.performance = performance;
  window.screen = new Screen(window);
  window.urls = urls; // XXX non-standard
  window.scrollTo = function(x = 0, y = 0) {
    this.scrollX = x;
    this.scrollY = y;
  };
  window.scrollX = 0;
  window.scrollY = 0;
  window[symbols.optionsSymbol] = options;
  window[symbols.styleEpochSymbol] = 0;

  // DOM.
  const {
    Document,
    DocumentFragment,
    Range,
  } = getBoundDocumentElements(window);
  window.Document = Document;
  window.DocumentFragment = DocumentFragment;
  window.DocumentType = DocumentType;
  window.DOMImplementation = DOMImplementation;
  window.Range = Range;

  const {
    Element,
    HTMLElement,
    HTMLHeadElement,
    HTMLBodyElement,
    HTMLAnchorElement,
    HTMLStyleElement,
    HTMLLinkElement,
    HTMLScriptElement,
    HTMLImageElement,
    HTMLAudioElement,
    HTMLVideoElement,
    HTMLSourceElement,
    SVGElement,
    HTMLIFrameElement,
    HTMLCanvasElement,
    HTMLTextareaElement,
    HTMLTemplateElement,
    HTMLDivElement,
    HTMLUListElement,
    HTMLLIElement,
    HTMLTableElement,
    Node,
    Text,
    Comment,
  } = getBoundDOMElements(window);
  window.Element = Element;
  window.HTMLElement = HTMLElement;
  window.HTMLHeadElement = HTMLHeadElement;
  window.HTMLBodyElement = HTMLBodyElement;
  window.HTMLAnchorElement = HTMLAnchorElement;
  window.HTMLStyleElement = HTMLStyleElement;
  window.HTMLLinkElement = HTMLLinkElement;
  window.HTMLScriptElement = HTMLScriptElement;
  window.HTMLImageElement = HTMLImageElement,
  window.HTMLAudioElement = HTMLAudioElement;
  window.HTMLVideoElement = HTMLVideoElement;
  window.SVGElement = SVGElement;
  window.HTMLIFrameElement = HTMLIFrameElement;
  window.HTMLCanvasElement = HTMLCanvasElement;
  window.HTMLTextareaElement = HTMLTextareaElement;
  window.HTMLTemplateElement = HTMLTemplateElement;
  window.HTMLDivElement = HTMLDivElement;
  window.HTMLUListElement = HTMLUListElement;
  window.HTMLLIElement = HTMLLIElement;
  window.HTMLTableElement = HTMLTableElement;
  window.Node = Node;
  window.Text = Text;
  window.Comment = Comment;
  window[symbols.htmlTagsSymbol] = {
    DOCUMENT: Document,
    HEAD: HTMLHeadElement,
    BODY: HTMLBodyElement,
    A: HTMLAnchorElement,
    STYLE: HTMLStyleElement,
    SCRIPT: HTMLScriptElement,
    LINK: HTMLLinkElement,
    IMG: HTMLImageElement,
    AUDIO: HTMLAudioElement,
    VIDEO: HTMLVideoElement,
    SOURCE: HTMLSourceElement,
    IFRAME: HTMLIFrameElement,
    CANVAS: HTMLCanvasElement,
    TEXTAREA: HTMLTextareaElement,
    TEMPLATE: HTMLTemplateElement,
    DIV: HTMLDivElement,
    ULIST: HTMLUListElement,
    LI: HTMLLIElement,
    TABLE: HTMLTableElement,
  };
  window.NodeList = NodeList;
  window.HTMLCollection = HTMLCollection;

  /* window.MediaStreamTrack = MediaStreamTrack;
  window.RTCRtpReceiver = RTCRtpReceiver;
  window.RTCRtpSender = RTCRtpSender; */
  window.MediaStream = class MediaStream {};

  window.RTCPeerConnection = RTCPeerConnection;
  window.webkitRTCPeerConnection = RTCPeerConnection; // for feature detection
  window.RTCSessionDescription = RTCSessionDescription;
  window.RTCIceCandidate = RTCIceCandidate;

  window.RTCPeerConnectionIceEvent = RTCPeerConnectionIceEvent;
  window.RTCDataChannelEvent = RTCDataChannelEvent;
  window.RTCDataChannelMessageEvent = RTCDataChannelMessageEvent;
  window.RTCTrackEvent = RTCTrackEvent;

  window.RTCRtpTransceiver = RTCRtpTransceiver;

  window.customElements = new CustomElementRegistry(window);
  window.CustomElementRegistry = CustomElementRegistry;
  window.MutationObserver = require('./MutationObserver').MutationObserver;
  window.DOMRect = DOMRect;
  window.DOMPoint = DOMPoint;
  window.getComputedStyle = el => {
    let styleSpec = el[symbols.computedStyleSymbol];
    if (!styleSpec || styleSpec.epoch !== window[symbols.styleEpochSymbol]) {
      const style = el.style.clone();
      const stylesheetEls = el.ownerDocument.documentElement.getElementsByTagName('style')
        .concat(el.ownerDocument.documentElement.getElementsByTagName('link'));
      for (let i = 0; i < stylesheetEls.length; i++) {
        const {stylesheet} = stylesheetEls[i];
        if (stylesheet) {
          const {rules} = stylesheet;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            const {selectors} = rule;
            if (selectors && selectors.some(selector => el.matches(selector))) {
              const {declarations} = rule;
              for (let k = 0; k < declarations.length; k++) {
                const {property, value} = declarations[k];
                style[property] = value;
              }
            }
          }
        }
      }
      styleSpec = {
        style,
        styleEpoch: window[symbols.styleEpochSymbol],
      };
      el[symbols.computedStyleSymbol] = styleSpec;
    }
    return styleSpec.style;
  };
  window.browser = {
    devTools: DevTools,
    http,
    // https,
    ws,
    createRenderTarget(context) { // XXX needed for reality tabs fakeDisplay
      nativeWindow.setCurrentWindowContext(context.getWindowHandle());
      return nativeWindow.createRenderTarget.apply(nativeWindow, arguments);
    },
    magicleap: nativeMl ? {
      RequestMeshing: () => nativeMl.RequestMeshing(window),
      RequestPlaneTracking: () => nativeMl.RequestPlaneTracking(window),
      RequestHandTracking: () => nativeMl.RequestHandTracking(window),
      RequestEyeTracking: () => nativeMl.RequestEyeTracking(window),
      RequestImageTracking: (img, size) => nativeMl.RequestImageTracking(window, img, size),
      RequestDepthPopulation: nativeMl.RequestDepthPopulation,
      RequestCamera: nativeMl.RequestCamera,
    } : null,
    monitors: new MonitorManager(),
  };
  window.DOMParser = class DOMParser {
    parseFromString(htmlString, type) {
      const _recurse = node => {
        let nodeName = null;
        let value = null;
        if (node.type === 'text') {
          nodeName = '#text';
          value = node.text;
        } else if (node.type === 'comment') {
          nodeName = '#comment';
          value = node.content;
        }

        const tagName = node.name || null;

        const attrs = [];
        if (node.attributes) {
          for (const name in node.attributes) {
            attrs.push({
              name,
              value: node.attributes[name],
            });
          }
        }

        const childNodes = node.children ? node.children.map(childNode => _recurse(childNode)) : [];

        return {
          nodeName,
          tagName,
          attrs,
          value,
          childNodes,
        };
      };
      const xmlAst = parseXml(htmlString, {
        // preserveComments: true,
      });
      const htmlAst = _recurse(xmlAst);
      return _parseDocumentAst(htmlAst, window, false);
    }
  };
  // window.Buffer = Buffer; // XXX non-standard
  window.Event = Event;
  window.KeyboardEvent = KeyboardEvent;
  window.MouseEvent = MouseEvent;
  window.WheelEvent = WheelEvent;
  window.DragEvent = DragEvent;
  window.MessageEvent = MessageEvent;
  window.PromiseRejectionEvent = PromiseRejectionEvent;
  window.CustomEvent = CustomEvent;
  window.EventTarget = EventTarget;
  window.addEventListener = EventTarget.prototype.addEventListener.bind(window);
  window.removeEventListener = EventTarget.prototype.removeEventListener.bind(window);
  window.dispatchEvent = EventTarget.prototype.dispatchEvent.bind(window);
  window.Image = HTMLImageElement;
  window.ImageData = ImageData;
  window.ImageBitmap = ImageBitmap;
  window.Path2D = Path2D;
  window.CanvasGradient = CanvasGradient;
  window.CanvasRenderingContext2D = CanvasRenderingContext2D;
  window.WebGLRenderingContext = WebGLRenderingContext;
  if (options.args.webgl !== '1') {
    window.WebGL2RenderingContext = WebGL2RenderingContext;
  }
  window.Audio = HTMLAudioElement;
  window.MediaRecorder = MediaRecorder;
  window.DataTransfer = DataTransfer;
  window.DataTransferItem = DataTransferItem;
  window.FileReader = FileReader;
  window.Screen = Screen;
  window.Gamepad = Gamepad;
  window.VRStageParameters = VRStageParameters;
  window.VRDisplay = VRDisplay;
  window.FakeVRDisplay = FakeVRDisplay;
  // window.ARDisplay = ARDisplay;
  window.VRFrameData = VRFrameData;
  if (window.navigator.xr) {
    window.XR = XR.XR;
    window.XRDevice = XR.XRDevice;
    window.XRSession = XR.XRSession;
    window.XRWebGLLayer = XR.XRWebGLLayer;
    window.XRPresentationFrame = XR.XRPresentationFrame;
    window.XRView = XR.XRView;
    window.XRViewport = XR.XRViewport;
    window.XRDevicePose = XR.XRDevicePose;
    window.XRInputSource = XR.XRInputSource;
    window.XRRay = XR.XRRay;
    window.XRInputPose = XR.XRInputPose;
    window.XRInputSourceEvent = XR.XRInputSourceEvent;
    window.XRCoordinateSystem = XR.XRCoordinateSystem;
    window.XRFrameOfReference = XR.XRFrameOfReference;
    window.XRStageBounds = XR.XRStageBounds;
    window.XRStageBoundsPoint = XR.XRStageBoundsPoint;
  }
  window.btoa = btoa;
  window.atob = atob;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.AudioContext = AudioContext;
  window.AudioNode = AudioNode;
  window.AudioBufferSourceNode = AudioBufferSourceNode;
  window.OscillatorNode = OscillatorNode;
  window.AudioDestinationNode = AudioDestinationNode;
  window.AudioParam = AudioParam;
  window.AudioListener = AudioListener;
  window.GainNode = GainNode;
  window.AnalyserNode = AnalyserNode;
  window.PannerNode = PannerNode;
  window.StereoPannerNode = StereoPannerNode;
  window.createImageBitmap = createImageBitmap;
  window.Worker = class extends Worker {
    constructor(src) {
      if (src instanceof Blob) {
        super('data:application/javascript,' + src.buffer.toString('utf8'));
      } else {
        const blob = urls.get(src);
        const normalizedSrc = blob ?
          'data:application/octet-stream;base64,' + blob.buffer.toString('base64')
        :
          _normalizeUrl(src);
        super(normalizedSrc);
      }
    }
  };
  window.requestAnimationFrame = _makeRequestAnimationFrame(window);
  const rafCbs = [];
  window[symbols.rafCbsSymbol] = rafCbs;
  window.cancelAnimationFrame = id => {
    process.stdout.write(`rafCbs TKTK ${id}\n`);
    process.stdout.write(require('util').inspect(rafCbs) + '\n', () => {
      process.stdout.write('rafCbs TKTK done\n', () => {
        const index = rafCbs.findIndex(r => {
          return (r[symbols.idSymbol] === id);
        });
        if (index !== -1) {
          delete rafCbs[index];
        }
      });
    });
  };
  window.postMessage = (postMessage => function(data) {
    if (window.top === window) {
      setImmediate(() => {
        window._emit('message', new MessageEvent('message', {data}));
      });
    } else {
      postMessage.apply(this, arguments);
    }
  })(window.postMessage);
  /*
    Treat function onload() as a special case that disables automatic event attach for onload, because this is how browsers work. E.g.
      <!doctype html><html><head><script>
        function onload() {
          console.log ('onload'); // NOT called; presence of top-level function onload() makes all the difference
        }
        window.onload = onload;
      </script></head></html>
  */
  window[symbols.disabledEventsSymbol] = {
    load: undefined,
    error: undefined,
  };
  window._emit = function(type) {
    if (!this[symbols.disabledEventsSymbol][type]) {
      Node.prototype._emit.apply(this, arguments);
    }
  };
  Object.defineProperty(window, 'onload', {
    get() {
      return _elementGetter(window, 'load');
    },
    set(onload) {
      _elementSetter(window, 'load', onload);
    },
  });
  Object.defineProperty(window, 'onerror', {
    get() {
      return _elementGetter(window, 'error');
    },
    set(onerror) {
      _elementSetter(window, 'error', onerror);
    },
  });
  Object.defineProperty(window, 'onpopstate', {
    get() {
      return _elementGetter(window, 'popstate');
    },
    set(onpopstate) {
      _elementSetter(window, 'popstate', onpopstate);
    },
  });

  window.history.on('popstate', (u, state) => {
    window.location.set(u);

    const event = new Event('popstate');
    event.state = state;
    window.dispatchEvent(event);
  });
  let loading = false;
  window.location.on('update', href => {
    if (!loading) {
      core.load(href, {
        dataPath: options.dataPath,
      })
        .then(newWindow => {
          window._emit('beforeunload');
          window._emit('unload');
          window._emit('navigate', newWindow);
        })
        .catch(err => {
          loading = false;

          const e = new ErrorEvent('error', {target: this});
          e.message = err.message;
          e.stack = err.stack;
          window.dispatchEvent(e);
        });
      loading = true;
    }
  });

  const timeouts = [];
  const intervals = [];
  const localCbs = [];
  const _cacheLocalCbs = cbs => {
    for (let i = 0; i < cbs.length; i++) {
      localCbs[i] = cbs[i];
    }
    for (let i = cbs.length; i < localCbs.length; i++) {
      localCbs[i] = null;
    }
  };
  const _clearLocalCbs = () => {
    for (let i = 0; i < localCbs.length; i++) {
      localCbs[i] = null;
    }
  };
  window.tickAnimationFrame = async () => {
    const _emitXrEvents = () => {
      fakePresentState.fakeVrDisplay && fakePresentState.fakeVrDisplay.update();
      window[symbols.mrDisplaysSymbol].vrDevice.session && window[symbols.mrDisplaysSymbol].vrDevice.session.update();
    };
    const _composeLayers = () => {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];
        const isDirty = (!!context.isDirty && context.isDirty()) || context === vrPresentState.glContext /*|| mlPresentState.mlGlContext === context*/;
        if (isDirty) {
          const windowHandle = context.getWindowHandle();

          nativeWindow.setCurrentWindowContext(windowHandle);
          if (isMac) {
            context.flush();
          }

          if (context === vrPresentState.glContext) {
            nativeWindow.bindVrChildFbo(context, vrPresentState.fbo, xrState.tex[0], xrState.depthTex[0]);

            if (vrPresentState.layers.length > 0) {
              for (let i = 0; i < vrPresentState.layers.length; i++) {
                const layer = vrPresentState.layers[i];

                if (layer instanceof window.HTMLCanvasElement && !layer.framebuffer) {
                  let [fbo, tex, depthTex, msFbo, msTex, msDepthTex] = nativeWindow.createRenderTarget(context, layer.width, layer.height);

                  // XXX do not construct pointless msFbo
                  if (layer._context === context) {
                    msFbo = vrPresentState.msFbo;
                    msTex = vrPresentState.msTex;
                    msDepthTex = vrPresentState.msDepthTex;
                  }

                  layer.framebuffer = {
                    msFbo,
                    msTex,
                    msDepthTex,
                    fbo,
                    tex,
                    depthTex,
                  };
                }
              }

              nativeWindow.composeLayers(context, vrPresentState.fbo, vrPresentState.layers, xrState);
            } else {
              nativeWindow.blitFrameBuffer(context, vrPresentState.msFbo, vrPresentState.fbo, context.canvas.width, context.canvas.height, context.canvas.width, context.canvas.height, true, false, false);
            }

            if (vrPresentState.hmdType === 'fake' || vrPresentState.hmdType === 'oculus' || vrPresentState.hmdType === 'openvr') {
              const width = context.canvas.width * (args.blit ? 0.5 : 1);
              const height = context.canvas.height;
              const {width: dWidth, height: dHeight} = nativeWindow.getFramebufferSize(windowHandle);
              nativeWindow.blitFrameBuffer(context, vrPresentState.fbo, 0, width, height, dWidth, dHeight, true, false, false);
            }
          } else {
            if (!context.desynchronized) {
              const width = context.canvas.width * (args.blit ? 0.5 : 1);
              const height = context.canvas.height;
              const {width: dWidth, height: dHeight} = nativeWindow.getFramebufferSize(windowHandle);
              nativeWindow.blitFrameBuffer(context, context.framebuffer.msFbo, context.framebuffer.fbo, width, height, width, height, true, false, false);
              nativeWindow.blitFrameBuffer(context, context.framebuffer.fbo, 0, width, height, dWidth, dHeight, true, false, false);
            }
          }

          if (isMac) {
            context.bindFramebufferRaw(context.FRAMEBUFFER, null);
          }
          nativeWindow.swapBuffers(windowHandle);
          if (isMac) {
            const drawFramebuffer = context.getFramebuffer(context.DRAW_FRAMEBUFFER);
            if (drawFramebuffer) {
              context.bindFramebuffer(context.DRAW_FRAMEBUFFER, drawFramebuffer);
            }

            const readFramebuffer = context.getFramebuffer(context.READ_FRAMEBUFFER);
            if (readFramebuffer) {
              context.bindFramebuffer(context.READ_FRAMEBUFFER, readFramebuffer);
            }
          }

          context.clearDirty();
        }
      }
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];
        context.finish && context.finish();
      }
      
      for (let i = 0; i < windows.length; i++) {
        const window = windows[i];
        if (window.phase === PHASES.RENDERED) {
          window.phase = PHASES.NULL;
        }
      }
    };
    const _renderLocal = async () => {
      console.log('_renderLocal');
      if (rafCbs.length > 0) {
        _cacheLocalCbs(rafCbs);
        
        const performanceNow = performance.now();

        for (let i = 0; i < localCbs.length; i++) {
          const rafCb = localCbs[i];
          if (rafCb) {
            try {
              rafCb(performanceNow);
            } catch (e) {
              console.warn(e);
            }

            const index = rafCbs.indexOf(rafCb); // could have changed due to sorting
            if (index !== -1) {
              delete rafCbs[index];
            }
          }
        }

        _clearLocalCbs(); // release garbage
      }
    };
    const _renderChildren = async () => {
      let timeout;
      const timeoutPromise = new Promise((accept, reject) => {
        timeout = setTimeout(() => {
          accept();
        }, 1000/60); // XXX make this timeout accurate
      });
      for (let i = 0; i < windows.length; i++) {
        const window = windows[i];
        if (window.phase === PHASES.NULL) {
          window.promise = window.runAsync('tickAnimationFrame')
            .then(syncs => {
              window.phase = PHASES.RENDERED;
              window.promise = null;
            });
          window.phase = PHASES.RENDERING;
        }
      }
      await Promise.race([
        timeoutPromise,
        Promise.all(windows.map(window => window.promise)),
      ]);
      clearTimeout(timeout);
    };
    
    _emitXrEvents();

    const childPromises = _renderChildren();
    _renderLocal();
    await childPromises;
    
    _composeLayers();
  };
  
  const _makeMrDisplays = () => {
    const _onrequestpresent = async () => {
      if (!xrState.isPresenting[0]) {
        await new Promise((accept, reject) => {
          vrPresentState.responseAccept = accept;

          xrState.vrRequest[1] = GlobalContext.id;
          xrState.vrRequest[2] = window.innerWidth;
          xrState.vrRequest[3] = window.innerHeight;
          xrState.vrRequest[0] = 1; // requestPresent
        });

        fakePresentState.fakeVrDisplay = fakeVrDisplay; // XX make this returned from the api
        
        vrPresentState.hmdType = 'fake';
      }
    };
    const _onmakeswapchain = context => {
      const windowHandle = context.getWindowHandle();
      nativeWindow.setCurrentWindowContext(windowHandle);

      const window = context.canvas.ownerDocument.defaultView;
      if (!window.document.hidden) {
        const [fbo, msFbo, msTex, msDepthTex] = nativeWindow.createVrChildRenderTarget(context, xrState.renderWidth[0]*2, xrState.renderHeight[0]);
        context.setDefaultFramebuffer(msFbo);

        vrPresentState.glContext = context;
        vrPresentState.fbo = fbo;
        vrPresentState.msFbo = msFbo;
        vrPresentState.msTex = msTex;
        vrPresentState.msDepthTex = msDepthTex;
        
        return {
          msFbo,
        };
      } else {
        const {canvas} = context;
        const [fbo, tex, depthTex, msFbo, msTex, msDepthTex] = nativeWindow.createRenderTarget(context, xrState.renderWidth[0]*2, xrState.renderHeight[0]);
        
        console.log('make low level', canvas.width, canvas.height, fbo, tex, depthTex, msFbo, msTex, msDepthTex);

        context.setDefaultFramebuffer(msFbo);

        window.document.framebuffer = {
          msFbo,
          msTex,
          msDepthTex,
          fbo,
          tex,
          depthTex,
        };
        window.windowEmit('framebuffer', window.document.framebuffer);
        window.windowEmit('resize', {
          width: xrState.renderWidth[0]*2,
          height: xrState.renderHeight[0],
        });
        
        return {
          msFbo,
        };
      }
    };
    const _onexitpresent = async () => {
      // XXX call upwards
      fakePresentState.fakeVrDisplay = null;
    };

    const fakeVrDisplay = new FakeVRDisplay(window);
    fakeVrDisplay.onrequestpresent = _onrequestpresent;
    fakeVrDisplay.onmakeswapchain = _onmakeswapchain;
    fakeVrDisplay.onexitpresent = _onexitpresent;
    fakeVrDisplay.onlayers = layers => {
      vrPresentState.layers = layers;
    };

    const vrDisplay = new VRDisplay('OpenVR', window);
    vrDisplay.onrequestanimationframe = _makeRequestAnimationFrame(window);
    vrDisplay.oncancelanimationframe = window.cancelAnimationFrame;
    vrDisplay.onvrdisplaypresentchange = () => {
      const e = new Event('vrdisplaypresentchange');
      e.display = vrDisplay;
      window.dispatchEvent(e);
    };
    vrDisplay.onrequestpresent = _onrequestpresent;
    vrDisplay.onmakeswapchain = _onmakeswapchain;
    vrDisplay.onexitpresent = _onexitpresent;
    vrDisplay.onlayers = layers => {
      vrPresentState.layers = layers;
    };
    
    const vrDevice = new XR.XRDevice('OpenVR', window);
    vrDevice.onrequestpresent = _onrequestpresent;
    vrDevice.onmakeswapchain = _onmakeswapchain;
    vrDevice.onexitpresent = _onexitpresent;
    vrDevice.onrequestanimationframe = _makeRequestAnimationFrame(window);
    vrDevice.oncancelanimationframe = window.cancelAnimationFrame;
    vrDevice.requestSession = (requestSession => function() {
      return requestSession.apply(this, arguments)
        .then(session => {
          vrDisplay.isPresenting = true;
          session.once('end', () => {
            vrDisplay.isPresenting = false;
          });
          return session;
        });
    })(vrDevice.requestSession);
    vrDevice.onlayers = layers => {
      vrPresentState.layers = layers;
    };

    return {
      fakeVrDisplay,
      vrDisplay,
      vrDevice,
    };
  };
  window[symbols.mrDisplaysSymbol] = _makeMrDisplays();

  window.document = _parseDocument(options.htmlString, window);
  window.document.hidden = options.hidden || false;
  window.document.xrOffset = options.xrOffsetBuffer ? new XRRigidTransform(options.xrOffsetBuffer) : new XRRigidTransform();
})(global);

if (!options.require) {
  //global.require = undefined;
}
//global.process = undefined;
global.onrunasync = method => {
  try {
    console.log('TKTK worker onrunasync', method);
    if (method === 'tickAnimationFrame') {
      console.log('worker tickAnimationFrame');
      return global.tickAnimationFrame();
    } else if (/^\{"method":"response"/.test(method)) {
      console.log('worker response');
      if (vrPresentState.responseAccept) {
        const res = JSON.parse(method);
        
        const {responseAccept} = vrPresentState;
        vrPresentState.responseAccept = null;
        responseAccept(res);
        return Promise.resolve();
      } else {
        return Promise.reject(new Error(`unexpected window response`));
      }
    } else if (/^\{"method":"eval"/.test(method)) {
      console.log('worker eval');
      try {
        console.log('global.onrunasync', JSON.parse(method).scriptString);
        //console.log('global.onrunasync', eval(JSON.parse(method).scriptString));
        console.log('global.onrunasync eval', method);
        const result = eval(JSON.parse(method).scriptString);
        console.log('global.onrunasync result', result);
        const finalResult = Promise.resolve(result);
        console.log('global.onrunasync finalResult', finalResult);
        return finalResult;
      } catch (err) {
        console.log('global.onrunasync err');
        console.log('global.onrunasync err', err.message);
        console.log('global.onrunasync err', err.stack);
        return Promise.reject(new Error(`eval err: ${method}`));
      }
    } else {
      console.log('worker unknown');
      return Promise.reject(new Error(`invalid window async method: ${method}`));
    }
  } catch (err) {
    console.log('TKTK worker wtf');
    console.log('TKTK worker wtf', err.message);
    console.log('TKTK worker wtf', err.stack);
    return Promise.reject(new Error(`internal error: ${err.message}`));
  }
};
global.onexit = () => {
  console.log('onexit');
  let context = contexts.pop();
  while (context) {
    context.destroy();
    context = contexts.pop();
  }
  console.log('onexit done');
  const rafCbs = window[symbols.rafCbsSymbol];
  console.log('onexit cbs', rafCbs, rafCbs ? rafCbs.length : 0);
  //process.exit();
};
// global.setImmediate = undefined; // need this for the TLS implementation
