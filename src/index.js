#!/usr/bin/env node

if (require.main === module && !/^1[12]\./.test(process.versions.node)) {
  throw new Error('node 11 or 12 required');
}
// const cwd = process.cwd();
// process.chdir(__dirname); // needed for global bin to find libraries

const events = require('events');
const {EventEmitter} = events;
const path = require('path');
const fs = require('fs');
const url = require('url');
const net = require('net');
const child_process = require('child_process');
const os = require('os');
const repl = require('repl');

const core = require('./core.js');
const mkdirp = require('mkdirp');
const replHistory = require('repl.history');
const minimist = require('minimist');

const {version} = require('../package.json');
const {defaultEyeSeparation, maxNumTrackers} = require('./constants.js');
const symbols = require('./symbols');
const {THREE} = core;

const nativeBindingsModulePath = path.join(__dirname, 'native-bindings.js');
const nativeBindings = require(nativeBindingsModulePath);

const eventLoopNative = require('event-loop-native');
nativeBindings.nativeWindow.setEventLoop(eventLoopNative);

const GlobalContext = require('./GlobalContext');
GlobalContext.args = {};
GlobalContext.version = '';
GlobalContext.commands = [];

const args = (() => {
  if (require.main === module) {
    const minimistArgs = minimist(process.argv.slice(2), {
      boolean: [
        'version',
        'home',
        'log',
        'perf',
        'performance',
        'frame',
        'minimalFrame',
        'tab',
        'quit',
        'blit',
        'headless',
      ],
      string: [
        'webgl',
        'xr',
        'size',
        'download',
        'replace',
      ],
      alias: {
        v: 'version',
        h: 'home',
        l: 'log',
        w: 'webgl',
        x: 'xr',
        p: 'performance',
        perf: 'performance',
        s: 'size',
        f: 'frame',
        m: 'minimalFrame',
        t: 'tab',
        q: 'quit',
        b: 'blit',
        r: 'replace',
        n: 'headless',
        d: 'download',
      },
    });
    return {
      version: minimistArgs.version,
      url: minimistArgs._[0] || '',
      home: minimistArgs.home,
      log: minimistArgs.log,
      webgl: minimistArgs.webgl || '2',
      xr: minimistArgs.xr || 'all',
      performance: !!minimistArgs.performance,
      size: minimistArgs.size,
      frame: minimistArgs.frame,
      minimalFrame: minimistArgs.minimalFrame,
      tab: minimistArgs.tab,
      quit: minimistArgs.quit,
      blit: minimistArgs.blit,
      replace: Array.isArray(minimistArgs.replace) ? minimistArgs.replace : ((minimistArgs.replace !== undefined) ? [minimistArgs.replace] : []),
      headless: minimistArgs.headless,
      download: minimistArgs.download !== undefined ? (minimistArgs.download || path.join(process.cwd(), 'downloads')) : undefined,
    };
  } else {
    return {};
  }
})();

core.setArgs(args);
core.setVersion(version);

const dataPath = (() => {
  const candidatePathPrefixes = [
    os.homedir(),
    __dirname,
    os.tmpdir(),
  ];
  for (let i = 0; i < candidatePathPrefixes.length; i++) {
    const candidatePathPrefix = candidatePathPrefixes[i];
    if (candidatePathPrefix) {
      const ok = (() => {
        try {
         fs.accessSync(candidatePathPrefix, fs.constants.W_OK);
         return true;
        } catch(err) {
          return false;
        }
      })();
      if (ok) {
        return path.join(candidatePathPrefix, '.exokit');
      }
    }
  }
  return null;
})();

const windows = [];
const contexts = [];

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

class XRState {
  constructor() {
    const sab = new SharedArrayBuffer(4*1024);
    let index = 0;
    const _makeTypedArray = (c, n) => {
      const result = new c(sab, index, n);
      index += result.byteLength;
      return result;
    };

    this.renderWidth = _makeTypedArray(Float32Array, 1);
    this.renderHeight = _makeTypedArray(Float32Array, 1);
    this.depthNear = _makeTypedArray(Float32Array, 1);
    this.depthNear[0] = 0.1;
    this.depthFar = _makeTypedArray(Float32Array, 1);
    this.depthFar[0] = 10000.0;
    this.position = _makeTypedArray(Float32Array, 3);
    this.orientation = _makeTypedArray(Float32Array, 4);
    this.orientation[3] = 1;
    this.leftViewMatrix = _makeTypedArray(Float32Array, 16);
    this.leftViewMatrix.set(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    this.rightViewMatrix = _makeTypedArray(Float32Array, 16);
    this.rightViewMatrix.set(this.leftViewMatrix);
    this.leftProjectionMatrix = _makeTypedArray(Float32Array, 16);
    this.leftProjectionMatrix.set(Float32Array.from([
      0.8000000000000002, 0, 0, 0,
      0, 1.0000000000000002, 0, 0,
      0, 0, -1.002002002002002, -1,
      0, 0, -0.20020020020020018, 0,
    ]));
    this.rightProjectionMatrix = _makeTypedArray(Float32Array, 16);
    this.rightProjectionMatrix.set(this.leftProjectionMatrix);
    this.leftOffset = _makeTypedArray(Float32Array, 3);
    this.leftOffset.set(Float32Array.from([-defaultEyeSeparation/2, 0, 0]));
    this.rightOffset = _makeTypedArray(Float32Array, 3);
    this.leftOffset.set(Float32Array.from([defaultEyeSeparation/2, 0, 0]));
    this.leftFov = _makeTypedArray(Float32Array, 4);
    this.leftFov.set(Float32Array.from([45, 45, 45, 45]));
    this.rightFov = _makeTypedArray(Float32Array, 4);
    this.rightFov.set(this.leftFov);
    const _makeGamepad = () => {
      return {
        connected: _makeTypedArray(Uint32Array, 1),
        position: _makeTypedArray(Float32Array, 3),
        orientation: (() => {
          const result = _makeTypedArray(Float32Array, 4);
          result[3] = 1;
          return result;
        })(),
        direction: (() => { // derived
          const result = _makeTypedArray(Float32Array, 4);
          result[2] = -1;
          return result;
        })(),
        transformMatrix: (() => { // derived
          const result = _makeTypedArray(Float32Array, 16);
          result.set(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
          return result;
        })(),
        buttons: (() => {
          const result = Array(6);
          for (let i = 0; i < result.length; i++) {
            result[i] = {
              pressed: _makeTypedArray(Uint32Array, 1),
              touched: _makeTypedArray(Uint32Array, 1),
              value: _makeTypedArray(Float32Array, 1),
            };
          }
          return result;
        })(),
        axes: _makeTypedArray(Float32Array, 10),
      };
    };
    this.gamepads = (() => {
      const result = Array(2+maxNumTrackers);
      for (let i = 0; i < result.length; i++) {
        result[i] = _makeGamepad();
      }
      return result;
    })();
  }
}
const xrState = GlobalContext.xrState = new XRState();

const vrPresentState = {
  vrContext: null,
  isPresenting: false,
  system: null,
  oculusSystem: null,
  compositor: null,
  glContext: null,
  msFbo: null,
  msTex: null,
  msDepthTex: null,
  fbo: null,
  tex: null,
  depthTex: null,
  cleanups: null,
  hasPose: false,
  lmContext: null,
  layers: [],
};
GlobalContext.vrPresentState = vrPresentState;

const mlPresentState = {
  mlContext: null,
  mlFbo: null,
  mlTex: null,
  mlDepthTex: null,
  mlMsFbo: null,
  mlMsTex: null,
  mlMsDepthTex: null,
  mlGlContext: null,
  mlCleanups: null,
  mlHasPose: false,
  layers: [],
};
GlobalContext.mlPresentState = mlPresentState;

const fakePresentState = {
  fakeVrDisplay: null,
  layers: [],
};
GlobalContext.fakePresentState = fakePresentState;
GlobalContext.fakeVrDisplayEnabled = false;

let innerWidth = 1280; // XXX do not track this globally
let innerHeight = 1024;
const isMac = os.platform() === 'darwin';

class XRState {
  constructor() {
    const sab = new SharedArrayBuffer(1024);
    let index = 0;
    const _makeTypedArray = (c, n) => {
      const result = new c(sab, index, n);
      index += result.byteLength;
      return result;
    };

    this.renderWidth = _makeTypedArray(Float32Array, 1);
    this.renderHeight = _makeTypedArray(Float32Array, 1);
    this.depthNear = _makeTypedArray(Float32Array, 1);
    this.depthFar = _makeTypedArray(Float32Array, 1);
    this.position = _makeTypedArray(Float32Array, 3);
    this.orientation = _makeTypedArray(Float32Array, 4);
    this.leftViewMatrix = _makeTypedArray(Float32Array, 16);
    this.rightViewMatrix = _makeTypedArray(Float32Array, 16);
    this.leftProjectionMatrix = _makeTypedArray(Float32Array, 16);
    this.rightProjectionMatrix = _makeTypedArray(Float32Array, 16);
    this.leftOffset = _makeTypedArray(Float32Array, 3);
    this.rightOffset = _makeTypedArray(Float32Array, 3);
    this.gamepads = (() => {
      const result = Array(2);
      for (let i = 0; i < result.length; i++) {
        result[i] = {
          connected: _makeTypedArray(Uint32Array, 1),
          position: _makeTypedArray(Float32Array, 3),
          orientation: _makeTypedArray(Float32Array, 4),
          buttons: (() => {
            const result = Array(5);
            for (let i = 0; i < result.length; i++) {
              result[i] = {
                pressed: _makeTypedArray(Uint32Array, 1),
                touched: _makeTypedArray(Uint32Array, 1),
                value: _makeTypedArray(Float32Array, 1),
              };
            }
            return result;
          })(),
          axes: _makeTypedArray(Float32Array, 10),
        };
      }
      return result;
    })();
  }
}
GlobalContext.xrState = new XRState();

const _startRenderLoop = () => {
  const timestamps = {
    frames: 0,
    last: Date.now(),
    idle: 0,
    wait: 0,
    prepare: 0,
    events: 0,
    media: 0,
    user: 0,
    submit: 0,
    total: 0,
  };
  const TIMESTAMP_FRAMES = 100;
  // const gamepads = getGamepads();
  // const [leftGamepad, rightGamepad] = gamepads; // XXX merge this into XRState
  // const frameData = new window.VRFrameData(); // XXX globalize frame data
  // const stageParameters = new window.VRStageParameters(); // XXX globalize stage parameters

  const _renderLoop = async () => {
    if (args.performance) {
      if (timestamps.frames >= TIMESTAMP_FRAMES) {
        console.log(`${(TIMESTAMP_FRAMES/(timestamps.total/1000)).toFixed(0)} FPS | ${timestamps.idle}ms idle | ${timestamps.wait}ms wait | ${timestamps.prepare}ms prepare | ${timestamps.events}ms events | ${timestamps.media}ms media | ${timestamps.user}ms user | ${timestamps.submit}ms submit`);

        timestamps.frames = 0;
        timestamps.idle = 0;
        timestamps.wait = 0;
        timestamps.prepare = 0;
        timestamps.events = 0;
        timestamps.media = 0;
        timestamps.user = 0;
        timestamps.submit = 0;
        timestamps.total = 0;
      } else {
        timestamps.frames++;
      }
      const now = Date.now();
      const diff = now - timestamps.last;
      timestamps.idle += diff;
      timestamps.total += diff;
      timestamps.last = now;
    }

    if (fakePresentState.fakeVrDisplay) {
      fakePresentState.fakeVrDisplay.waitGetPoses();
    }
    if (vrPresentState.isPresenting) {
      if (args.performance) {
        const now = Date.now();
        const diff = now - timestamps.last;
        timestamps.wait += diff;
        timestamps.total += diff;
        timestamps.last = now;
      }

      if (vrPresentState.oculusSystem) {
        // wait for frame
        await new Promise((accept, reject) => {
          vrPresentState.oculusSystem.GetPose(
            localPositionArray3,   // hmd position
            localQuaternionArray4, // hmd orientation
            localFloat32Array,     // left eye view matrix
            localFloat32Array2,    // left eye projection matrix
            localFloat32Array3,    // right eye view matrix
            localFloat32Array4,     // right eye projection matrix
            leftControllerPositionArray3, // left controller position.
            leftControllerQuaternionArray4, // left controller orientation.
            rightControllerPositionArray3, // right controller position.
            rightControllerQuaternionArray4, // right controller orientation.
            accept
          );
        });

        vrPresentState.hasPose = true;

        xrState.position = localPositionArray3;
        xrState.orientation = localQuaternionArray4;
        xrState.leftViewMatrix.set(localFloat32Array);
        xrState.leftProjectionMatrix.set(localFloat32Array2);
        xrState.rightViewMatrix.set(localFloat32Array3);
        xrState.rightProjectionMatrix.set(localFloat32Array4);

        localVector.toArray(xrState.position);
        localQuaternion.toArray(xrState.orientation);

        // Controllers.
        {
          const leftGamepad = xrState.gamepads[0];

          // Pose
          leftGamepad.position[0] = leftControllerPositionArray3[0];
          leftGamepad.position[1] = leftControllerPositionArray3[1];
          leftGamepad.position[2] = leftControllerPositionArray3[2];

          leftGamepad.orientation[0] = leftControllerQuaternionArray4[0];
          leftGamepad.orientation[1] = leftControllerQuaternionArray4[1];
          leftGamepad.orientation[2] = leftControllerQuaternionArray4[2];
          leftGamepad.orientation[3] = leftControllerQuaternionArray4[3];

          // Input
          vrPresentState.oculusSystem.GetControllersInputState(0, localGamepadArray);

          leftGamepad.connected[0] = localGamepadArray[0];

          // Pressed
          leftGamepad.buttons[0].pressed[0] = localGamepadArray[3]; // thumbstick
          leftGamepad.buttons[1].pressed[0] = localGamepadArray[5] >= 0.01; // trigger
          leftGamepad.buttons[2].pressed[0] = localGamepadArray[6] >= 0.01; // grip
          leftGamepad.buttons[3].pressed[0] = localGamepadArray[1] == 1; // xbutton
          leftGamepad.buttons[4].pressed[0] = localGamepadArray[2] == 1; // ybutton
          leftGamepad.buttons[5].pressed[0] = localGamepadArray[4] == 1; // menu

          // touched
          leftGamepad.buttons[0].touched[0] = localGamepadArray[9]; // thumbstick
          leftGamepad.buttons[1].touched[0] = localGamepadArray[10]; // trigger
          leftGamepad.buttons[3].touched[0] = localGamepadArray[7]; // xbutton
          leftGamepad.buttons[4].touched[0] = localGamepadArray[8]; // ybutton

          // thumbstick axis
          leftGamepad.axes[0] = localGamepadArray[11];
          leftGamepad.axes[1] = localGamepadArray[12];

          // values
          leftGamepad.buttons[1].value[0] = localGamepadArray[5]; // trigger
          leftGamepad.buttons[2].value[0] = localGamepadArray[6]; // grip
        }
        {
          const rightGamepad = xrState.gamepads[1];

          // Pose
          rightGamepad.position[0] = rightControllerPositionArray3[0];
          rightGamepad.position[1] = rightControllerPositionArray3[1];
          rightGamepad.position[2] = rightControllerPositionArray3[2];

          rightGamepad.orientation[0] = rightControllerQuaternionArray4[0];
          rightGamepad.orientation[1] = rightControllerQuaternionArray4[1];
          rightGamepad.orientation[2] = rightControllerQuaternionArray4[2];
          rightGamepad.orientation[3] = rightControllerQuaternionArray4[3];

          // Input
          vrPresentState.oculusSystem.GetControllersInputState(1, localGamepadArray);

          rightGamepad.connected[0] = localGamepadArray[0];

          // pressed
          rightGamepad.buttons[0].pressed[0] = localGamepadArray[3]; // thumbstick
          rightGamepad.buttons[1].pressed[0] = localGamepadArray[5] >= 0.1; // trigger
          rightGamepad.buttons[2].pressed[0] = localGamepadArray[6] >= 0.1; // grip
          rightGamepad.buttons[3].pressed[0] = localGamepadArray[1] == 1; // xbutton
          rightGamepad.buttons[4].pressed[0] = localGamepadArray[2] == 1; // ybutton
          rightGamepad.buttons[5].pressed[0] = localGamepadArray[4] == 1; // menu

          // touched
          rightGamepad.buttons[0].touched[0] = localGamepadArray[9]; // thumbstick
          rightGamepad.buttons[1].touched[0] = localGamepadArray[10]; // trigger
          rightGamepad.buttons[3].touched[0] = localGamepadArray[7]; // xbutton
          rightGamepad.buttons[4].touched[0] = localGamepadArray[8]; // ybutton

          // thumbstick axis
          rightGamepad.axes[0] = localGamepadArray[11];
          rightGamepad.axes[1] = localGamepadArray[12];

          // values
          rightGamepad.buttons[1].value[0] = localGamepadArray[5]; // trigger
          rightGamepad.buttons[2].value[0] = localGamepadArray[6]; // grip
        }
      } else if (vrPresentState.compositor) {
        // wait for frame
        await new Promise((accept, reject) => {
          vrPresentState.compositor.RequestGetPoses(
            vrPresentState.system,
            localFloat32PoseArray, // hmd, controllers, trackers
            accept
          );
        });
        if (!immediate) {
          return;
        }

        vrPresentState.hasPose = true;

        // hmd pose
        const hmdMatrix = localMatrix.fromArray(localFloat32HmdPoseArray);

        hmdMatrix.decompose(localVector, localQuaternion, localVector2);
        localVector.toArray(xrState.position);
        localQuaternion.toArray(xrState.orientation);

        hmdMatrix.getInverse(hmdMatrix);

        // left eye pose
        vrPresentState.system.GetEyeToHeadTransform(0, localFloat32MatrixArray);
        localMatrix2.fromArray(localFloat32MatrixArray);
        localMatrix2.decompose(localVector, localQuaternion, localVector2);
        localVector.toArray(xrState.leftOffset);
        localMatrix2
          .getInverse(localMatrix2)
          .multiply(hmdMatrix);
        localMatrix2.toArray(xrState.leftViewMatrix);

        vrPresentState.system.GetProjectionMatrix(0, xrState.depthNear[0], xrState.depthFar[0], localFloat32MatrixArray);
        xrState.leftProjectionMatrix.set(localFloat32MatrixArray);

        vrPresentState.system.GetProjectionRaw(0, localFovArray);
        for (let i = 0; i < localFovArray.length; i++) {
          xrState.leftFov[i] = Math.atan(localFovArray[i]) / Math.PI * 180;
        }

        // right eye pose
        vrPresentState.system.GetEyeToHeadTransform(1, localFloat32MatrixArray);
        localMatrix2.fromArray(localFloat32MatrixArray);
        localMatrix2.decompose(localVector, localQuaternion, localVector2);
        localVector.toArray(xrState.rightOffset);
        localMatrix2
          .getInverse(localMatrix2)
          .multiply(hmdMatrix);
        localMatrix2.toArray(xrState.rightViewMatrix);

        vrPresentState.system.GetProjectionMatrix(1, xrState.depthNear[0], xrState.depthFar[0], localFloat32MatrixArray);
        xrState.rightProjectionMatrix.set(localFloat32MatrixArray);

        vrPresentState.system.GetProjectionRaw(1, localFovArray);
        for (let i = 0; i < localFovArray.length; i++) {
          xrState.rightFov[i] = Math.atan(localFovArray[i]) / Math.PI * 180;
        }

        // build stage parameters
        // vrPresentState.system.GetSeatedZeroPoseToStandingAbsoluteTrackingPose(localFloat32MatrixArray);
        // stageParameters.sittingToStandingTransform.set(localFloat32MatrixArray);

        // build gamepads data
        const _loadGamepad = i => {
          const gamepad = xrState.gamepads[i];
          if (vrPresentState.system.GetControllerState(i, localGamepadArray)) {
            gamepad.connected[0] = 1;

            localMatrix.fromArray(localFloat32GamepadPoseArrays[i]);
            localMatrix.decompose(localVector, localQuaternion, localVector2);
            localVector.toArray(gamepad.position);
            localQuaternion.toArray(gamepad.orientation);

            gamepad.buttons[0].pressed[0] = localGamepadArray[4]; // pad
            gamepad.buttons[1].pressed[0] = localGamepadArray[5]; // trigger
            gamepad.buttons[2].pressed[0] = localGamepadArray[3]; // grip
            gamepad.buttons[3].pressed[0] = localGamepadArray[2]; // menu
            gamepad.buttons[4].pressed[0] = localGamepadArray[1]; // system

            gamepad.buttons[0].touched[0] = localGamepadArray[9]; // pad
            gamepad.buttons[1].touched[0] = localGamepadArray[10]; // trigger
            gamepad.buttons[2].touched[0] = localGamepadArray[8]; // grip
            gamepad.buttons[3].touched[0] = localGamepadArray[7]; // menu
            gamepad.buttons[4].touched[0] = localGamepadArray[6]; // system

            for (let i = 0; i < 10; i++) {
              gamepad.axes[i] = localGamepadArray[11+i];
            }
            gamepad.buttons[1].value[0] = gamepad.axes[2]; // trigger
          } else {
            gamepad.connected[0] = 0;
          }
        };
        _loadGamepad(0);
        _loadGamepad(1);

        // build tracker data
        const _loadTracker = i => {
          const tracker = xrState.gamepads[2 + i];
          const trackerPoseArray = localFloat32TrackerPoseArrays[i];
          if (!isNaN(trackerPoseArray[0])) {
            tracker.connected[0] = 1;

            localMatrix.fromArray(trackerPoseArray);
            localMatrix.decompose(localVector, localQuaternion, localVector2);
            localVector.toArray(tracker.position);
            localQuaternion.toArray(tracker.orientation);
          } else {
            tracker.connected[0] = 0;
          }
        };
        for (let i = 0; i < maxNumTrackers; i++) {
          _loadTracker(i);
        }

        /* if (vrPresentState.lmContext) { // XXX remove this binding
          vrPresentState.lmContext.WaitGetPoses(handsArray);
        } */
      }

      if (args.performance) {
        const now = Date.now();
        const diff = now - timestamps.last;
        timestamps.prepare += diff;
        timestamps.total += diff;
        timestamps.last = now;
      }
    } else if (mlPresentState.mlGlContext) {
      mlPresentState.mlHasPose = await new Promise((accept, reject) => {
        mlPresentState.mlContext.RequestGetPoses(
          transformArray,
          projectionArray,
          controllersArray,
          accept
        );
      });
      if (!immediate) {
        return;
      }

      mlPresentState.mlContext.PrepareFrame(
        mlPresentState.mlGlContext, // gl context for depth population
        mlPresentState.mlMsFbo,
        xrState.renderWidth[0]*2,
        xrState.renderHeight[0],
      );

      if (args.performance) {
        const now = Date.now();
        const diff = now - timestamps.last;
        timestamps.wait += diff;
        timestamps.total += diff;
        timestamps.last = now;
      }

      if (mlPresentState.mlHasPose) {
        localVector.fromArray(transformArray, 0);
        localQuaternion.fromArray(transformArray, 3);
        localVector2.set(1, 1, 1);
        localMatrix.compose(localVector, localQuaternion, localVector2).getInverse(localMatrix);
        localVector.toArray(xrState.position);
        localQuaternion.toArray(xrState.orientation);
        localMatrix.toArray(xrState.leftViewMatrix);
        xrState.leftProjectionMatrix.set(projectionArray.slice(0, 16));

        localVector.fromArray(transformArray, 3 + 4);
        localQuaternion.fromArray(transformArray, 3 + 4 + 3);
        // localVector2.set(1, 1, 1);
        localMatrix.compose(localVector, localQuaternion, localVector2).getInverse(localMatrix);
        localMatrix.toArray(xrState.rightViewMatrix);
        xrState.rightProjectionMatrix.set(projectionArray.slice(16, 32));

        let controllersArrayIndex = 0;
        {
          const leftGamepad = xrState.gamepads[0];
          leftGamepad.connected[0] = controllersArray[controllersArrayIndex];
          controllersArrayIndex++;
          leftGamepad.position.set(controllersArray.slice(controllersArrayIndex, controllersArrayIndex + 3));
          controllersArrayIndex += 3;
          leftGamepad.orientation.set(controllersArray.slice(controllersArrayIndex, controllersArrayIndex + 4));
          controllersArrayIndex += 4;
          const leftTriggerValue = controllersArray[controllersArrayIndex];
          leftGamepad.buttons[1].value[0] = leftTriggerValue;
          const leftTriggerPushed = leftTriggerValue > 0.5 ? 1 : 0;
          leftGamepad.buttons[1].touched[0] = leftTriggerPushed;
          leftGamepad.buttons[1].pressed[0] = leftTriggerPushed;
          leftGamepad.axes[2] = leftTriggerValue;
          controllersArrayIndex++;
          const leftBumperValue = controllersArray[controllersArrayIndex];
          leftGamepad.buttons[2].value[0] = leftBumperValue;
          const leftBumperPushed = leftBumperValue > 0.5 ? 1 : 0;
          leftGamepad.buttons[2].touched[0] = leftBumperPushed;
          leftGamepad.buttons[2].pressed[0] = leftBumperPushed;
          controllersArrayIndex++;
          const leftHomeValue = controllersArray[controllersArrayIndex];
          leftGamepad.buttons[3].value[0] = leftHomeValue;
          const leftHomePushed = leftHomeValue > 0.5 ? 1 : 0;
          leftGamepad.buttons[3].touched[0] = leftHomePushed;
          leftGamepad.buttons[3].pressed[0] = leftHomePushed;
          controllersArrayIndex++;
          leftGamepad.axes[0] = controllersArray[controllersArrayIndex];
          leftGamepad.axes[1] = controllersArray[controllersArrayIndex + 1];
          const leftPadValue = controllersArray[controllersArrayIndex + 2];
          leftGamepad.buttons[0].value[0] = leftPadValue;
          const leftPadTouched = leftPadValue > 0 ? 1 : 0;
          const leftPadPushed = leftPadValue > 0.5 ? 1: 0;
          leftGamepad.buttons[0].touched[0] = leftPadTouched;
          leftGamepad.buttons[0].pressed[0] = leftPadPushed;
          controllersArrayIndex += 3;
        }
        {
          const rightGamepad = xrState.gamepads[1];
          rightGamepad.connected[0] = controllersArray[controllersArrayIndex];
          controllersArrayIndex++;
          rightGamepad.position.set(controllersArray.slice(controllersArrayIndex, controllersArrayIndex + 3));
          controllersArrayIndex += 3;
          rightGamepad.orientation.set(controllersArray.slice(controllersArrayIndex, controllersArrayIndex + 4));
          controllersArrayIndex += 4;
          const rightTriggerValue = controllersArray[controllersArrayIndex];
          rightGamepad.buttons[1].value[0] = rightTriggerValue;
          const rightTriggerPushed = rightTriggerValue > 0.5 ? 1 : 0;
          rightGamepad.buttons[1].touched[0] = rightTriggerPushed;
          rightGamepad.buttons[1].pressed[0] = rightTriggerPushed;
          rightGamepad.axes[2] = rightTriggerValue;
          controllersArrayIndex++;
          const rightBumperValue = controllersArray[controllersArrayIndex];
          rightGamepad.buttons[2].value[0] = rightBumperValue;
          const rightBumperPushed = rightBumperValue > 0.5 ? 1 : 0;
          rightGamepad.buttons[2].touched[0] = rightBumperPushed;
          rightGamepad.buttons[2].pressed[0] = rightBumperPushed;
          controllersArrayIndex++;
          const rightHomeValue = controllersArray[controllersArrayIndex];
          rightGamepad.buttons[3].value[0] = rightHomeValue;
          const rightHomePushed = rightHomeValue > 0.5 ? 1 : 0;
          rightGamepad.buttons[3].touched[0] = rightHomePushed;
          rightGamepad.buttons[3].pressed[0] = rightHomePushed;
          controllersArrayIndex++;
          rightGamepad.axes[0] = controllersArray[controllersArrayIndex];
          rightGamepad.axes[1] = controllersArray[controllersArrayIndex + 1];
          const rightPadValue = controllersArray[controllersArrayIndex + 2];
          rightGamepad.buttons[0].value[0] = rightPadValue;
          const rightPadTouched = rightPadValue > 0 ? 1 : 0;
          const rightPadPushed = rightPadValue > 0.5 ? 1 : 0;
          rightGamepad.buttons[0].touched[0] = rightPadTouched;
          rightGamepad.buttons[0].pressed[0] = rightPadPushed;
          controllersArrayIndex += 3;
        }
      }

      if (args.performance) {
        const now = Date.now();
        const diff = now - timestamps.last;
        timestamps.prepare += diff;
        timestamps.total += diff;
        timestamps.last = now;
      }
    } else {
      /* await new Promise((accept, reject) => {
        const now = Date.now();
        const timeDiff = now - lastFrameTime;
        const waitTime = Math.max(8 - timeDiff, 0);
        setTimeout(accept, waitTime);
      });
      if (!immediate) {
        return;
      } */

      if (args.performance) {
        const now = Date.now();
        const diff = now - timestamps.last;
        timestamps.wait += diff;
        timestamps.total += diff;
        timestamps.last = now;
      }
    }

    // compute derived gamepads data
    for (let i = 0; i < xrState.gamepads.length; i++) {
      const gamepad = xrState.gamepads[i];
      localQuaternion.fromArray(gamepad.orientation);
      localVector
        .set(0, 0, -1)
        .applyQuaternion(localQuaternion)
        .toArray(gamepad.direction);
      localVector.fromArray(gamepad.position);
      localVector2.set(1, 1, 1);
      localMatrix
        .compose(localVector, localQuaternion, localVector2)
        .toArray(gamepad.transformMatrix);
    }

    // poll operating system events
    nativeBindings.nativeWindow.pollEvents();
    if (args.performance) {
      const now = Date.now();
      const diff = now - timestamps.last;
      timestamps.events += diff;
      timestamps.total += diff;
      timestamps.last = now;
    }

    // update media frames
    nativeBindings.nativeVideo.Video.updateAll();
    nativeBindings.nativeBrowser.Browser.updateAll();
    // update magic leap state
    if (mlPresentState.mlGlContext) {
      nativeBindings.nativeMl.Update(mlPresentState.mlContext, mlPresentState.mlGlContext); // gl context for mesh buffer population
      nativeBindings.nativeMl.Poll();
    }
    if (args.performance) {
      const now = Date.now();
      const diff = now - timestamps.last;
      timestamps.media += diff;
      timestamps.total += diff;
      timestamps.last = now;
    }

    if (args.frame || args.minimalFrame) {
      console.log('-'.repeat(80) + 'start frame');
    }

    // tick animation frames
    const syncs = (await Promise.all(windows.map(async window => { // XXX tick hidden windows first
      const syncs = await window.tickAnimationFrame();
      return syncs.map(({id, sync}) => ({
        window,
        id,
        sync,
      }));
    }))).flat();
    
    if (args.performance) {
      const now = Date.now();
      const diff = now - timestamps.last;
      timestamps.user += diff;
      timestamps.total += diff;
      timestamps.last = now;
    }
    
    // blit composite image
    {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];
        const sync = syncs.find(sync => sync.window === context.window && sync.id === context.id);
        if (sync) {
          nativeWindow.waitSync(sync.sync);
        }

        const windowHandle = context.getWindowHandle();

        const {nativeWindow} = nativeBindings;
        nativeWindow.setCurrentWindowContext(windowHandle);
        if (isMac) { // XXX move these to window internal
          context.flush();
        }

        const isVisible = nativeWindow.isVisible(windowHandle) || vrPresentState.glContext === context || mlPresentState.mlGlContext === context; // XXX track visible/width/height via child event emits
        if (isVisible) {
          if (vrPresentState.glContext === context && vrPresentState.hasPose) {
            if (vrPresentState.layers.length > 0) {
              nativeWindow.composeLayers(context, vrPresentState.fbo, vrPresentState.layers, xrState);
            } else {
              nativeWindow.blitFrameBuffer(context, vrPresentState.msFbo, vrPresentState.fbo, vrPresentState.glContext.canvas.width, vrPresentState.glContext.canvas.height, vrPresentState.glContext.canvas.width, vrPresentState.glContext.canvas.height, true, false, false);
            }

            vrPresentState.compositor.Submit(context, vrPresentState.tex);
            if (vrPresentState.oculusSystem) {
              // nativeBindings.nativeWindow.setCurrentWindowContext(windowHandle); // XXX needs to be folded in
              vrPresentState.oculusSystem.Submit(context, vrPresentState.fbo, vrPresentState.glContext.canvas.width, vrPresentState.glContext.canvas.height);
            } else if (vrPresentState.compositor) {
              vrPresentState.compositor.Submit(context, vrPresentState.tex);
            }
            vrPresentState.hasPose = false;

            nativeWindow.blitFrameBuffer(context, vrPresentState.fbo, 0, vrPresentState.glContext.canvas.width * (args.blit ? 0.5 : 1), vrPresentState.glContext.canvas.height, xrState.renderWidth[0], xrState.renderHeight[0], true, false, false);
          } else if (mlPresentState.mlGlContext === context && mlPresentState.mlHasPose) {
            if (mlPresentState.layers.length > 0) { // TODO: composition can be directly to the output texture array
              nativeWindow.composeLayers(context, mlPresentState.mlFbo, mlPresentState.layers, xrState);
            } else {
              nativeWindow.blitFrameBuffer(context, mlPresentState.mlMsFbo, mlPresentState.mlFbo, mlPresentState.mlGlContext.canvas.width, mlPresentState.mlGlContext.canvas.height, mlPresentState.mlGlContext.canvas.width, mlPresentState.mlGlContext.canvas.height, true, false, false);
            }

            mlPresentState.mlContext.SubmitFrame(mlPresentState.mlTex, mlPresentState.mlGlContext.canvas.width, mlPresentState.mlGlContext.canvas.height);
            mlPresentState.mlHasPose = false;

            // nativeWindow.blitFrameBuffer(context, mlPresentState.mlFbo, 0, mlPresentState.mlGlContext.canvas.width, mlPresentState.mlGlContext.canvas.height, xrState.renderWidth[0], xrState.renderHeight[0], true, false, false);
          } else if (fakePresentState.layers.length > 0) { // XXX blit only to the intended context
            nativeWindow.composeLayers(context, 0, fakePresentState.layers, xrState);
          }

        if (isMac) {
          context.bindFramebufferRaw(context.FRAMEBUFFER, null);
        }
        nativeWindow.swapBuffers(windowHandle); // XXX swap buffers on the child side
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
      }
    }

    // lastFrameTime = Date.now()

    if (args.performance) {
      const now = Date.now();
      const diff = now - timestamps.last;
      timestamps.submit += diff;
      timestamps.total += diff;
      timestamps.last = now;
    }

    if (args.frame || args.minimalFrame) {
      console.log('-'.repeat(80) + 'end frame');
    }

    // wait for next frame
    immediate = setImmediate(_renderLoop);
  };
  let immediate = setImmediate(_renderLoop);

  return {
    stop() {
      clearImmediate(immediate);
      immediate = null;
    },
  };
};
let currentRenderLoop = _startRenderLoop();

const _bindWindow = (window, newWindowCb) => {
  window.innerWidth = innerWidth;
  window.innerHeight = innerHeight;

  window.on('navigate', newWindowCb);
  window.document.on('paste', e => {
    e.clipboardData = new window.DataTransfer();
    const clipboardContents = nativeWindow.getClipboard().slice(0, 256);
    const dataTransferItem = new window.DataTransferItem('string', 'text/plain', clipboardContents);
    e.clipboardData.items.push(dataTransferItem);
  });
  window.document.addEventListener('pointerlockchange', () => {
    const {pointerLockElement} = window.document;

    if (pointerLockElement) {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];

        if (context.canvas.ownerDocument.defaultView === window) {
          const windowHandle = context.getWindowHandle();

          if (nativeBindings.nativeWindow.isVisible(windowHandle)) {
            nativeBindings.nativeWindow.setCursorMode(windowHandle, false);
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];

        if (context.canvas.ownerDocument.defaultView === window) {
          const windowHandle = context.getWindowHandle();

          if (nativeBindings.nativeWindow.isVisible(windowHandle)) {
            nativeBindings.nativeWindow.setCursorMode(windowHandle, true);
            break;
          }
        }
      }
    }
  });
  window.document.addEventListener('fullscreenchange', () => {
    const {fullscreenElement} = window.document;

    if (fullscreenElement) {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];

        if (context.canvas.ownerDocument.defaultView === window) {
          const windowHandle = context.getWindowHandle();

          if (nativeBindings.nativeWindow.isVisible(windowHandle)) {
            nativeBindings.nativeWindow.setFullscreen(windowHandle);
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];

        if (context.canvas.ownerDocument.defaultView === window) {
          const windowHandle = context.getWindowHandle();

          if (nativeBindings.nativeWindow.isVisible(windowHandle)) {
            nativeBindings.nativeWindow.exitFullscreen(windowHandle);
            break;
          }
        }
      }
    }
  });
  if (args.quit) {
    window.document.resources.addEventListener('drain', () => {
      console.log('drain');
      process.exit();
    });
  }
  
  windows.push(window);
  window.addEventListener('destroy', e => {
    const {window} = e;
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      if (context.canvas.ownerDocument.defaultView === window) {
        context.destroy();
      }
    }
    
    windows.splice(windows.indexOf(window), 1);
  });
  
  window.addEventListener('error', err => {
    console.warn('got error', err);
  });
};
const _bindDirectWindow = newWindow => {
  _bindWindow(newWindow, _bindDirectWindow);
};
core.load = (load => function() {
  return load.apply(this, arguments)
    .then(window => {
      _bindDirectWindow(window);

      return Promise.resolve(window);
    });
})(core.load);

const _prepare = () => Promise.all([
  (() => {
    if (!process.env['DISPLAY']) {
      process.env['DISPLAY'] = ':0.0';
    }
  })(),
  (() => {
    let rootPath = null;
    let runtimePath = null;
    const platform = os.platform();
    if (platform === 'win32') {
      rootPath = path.join(os.homedir(), 'AppData', 'Local', 'openvr');
      runtimePath = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\SteamVR';
    } else if (platform === 'darwin') {
      rootPath = path.join('/Users/', os.userInfo().username, '/Library/Application Support/OpenVR/.openvr');
      runtimePath = path.join(__dirname, '/node_modules/native-openvr-deps/bin/osx64');
    } else if (platform === 'linux') {
      rootPath = path.join(os.userInfo().homedir, '.config/openvr');
      runtimePath = path.join(__dirname, '..', 'node_modules', 'native-openvr-deps/bin/linux64');
    }

    if (rootPath !== null) {
      const openvrPathsPath = path.join(rootPath, 'openvrpaths.vrpath');

      return new Promise((accept, reject) => {
        fs.lstat(openvrPathsPath, (err, stats) => {
          if (err) {
            if (err.code === 'ENOENT') {
              mkdirp(rootPath, err => {
                if (!err) {
                  const jsonString = JSON.stringify({
                    "config" : [ rootPath ],
                    "external_drivers" : null,
                    "jsonid" : "vrpathreg",
                    "log" : [ rootPath ],
                    "runtime" : [
                       runtimePath,
                     ],
                    "version" : 1
                  }, null, 2);
                  fs.writeFile(openvrPathsPath, jsonString, err => {
                    if (!err) {
                      accept();
                    } else {
                      reject(err);
                    }
                  });
                } else if (err.code === 'EACCES') {
                  accept();
                } else {
                  reject(err);
                }
              });
            } else if (err.code === 'EACCES') {
              accept();
            } else {
              reject(err);
            }
          } else {
            accept();
          }
        });
      });
    } else {
      return Promise.resolve();
    }
  })(),
  new Promise((accept, reject) => {
    mkdirp(dataPath, err => {
      if (!err) {
        accept();
      } else {
        reject(err);
      }
    });
  }),
]);

const realityTabsUrl = 'file://' + path.join(__dirname, '..', 'examples', 'realitytabs.html');
const _start = () => {
  let {url: u} = args;
  if (!u && args.home) {
    u = realityTabsUrl;
  }
  if (u) {
    if (u === '.') {
      console.warn('NOTE: You ran `exokit . <url>`\n(Did you mean to run `node . <url>` or `exokit <url>` instead?)')
    }
    u = u.replace(/^exokit:/, '');
    if (args.tab) {
      u = `${realityTabsUrl}?t=${encodeURIComponent(u)}`
    }
    if (u && !url.parse(u).protocol) {
      u = 'file://' + path.resolve(process.cwd(), u);
    }
    const replacements = (() => {
      const result = {};
      for (let i = 0; i < args.replace.length; i++) {
        const replaceArg = args.replace[i];
        const replace = replaceArg.split(' ');
        if (replace.length === 2) {
          result[replace[0]] = 'file://' + path.resolve(process.cwd(), replace[1]);
        } else {
          console.warn(`invalid replace argument: ${replaceArg}`);
        }
      }
      return result;
    })();
    return core.load(u, {
      dataPath,
      args,
      replacements,
    });
  } else {
    let window = null;
    const _bindReplWindow = newWindow => {
      _bindWindow(newWindow, _bindReplWindow);
      window = newWindow;
    };
    _bindReplWindow(core('', {
      dataPath,
    }));

    const prompt = '[x] ';

    let lastUnderscore = window._;
    const replEval = (cmd, context, filename, callback) => {
      cmd = cmd.slice(0, -1); // remove trailing \n

      let result, err = null, match;

      if (/^[a-z]+:\/\//.test(cmd)) {
        window.location.href = cmd;
      } else if (/^\s*<(?:\!\-*)?[a-z]/i.test(cmd)) {
        const e = window.document.createElement('div');
        e.innerHTML = cmd;
        if (e.childNodes.length === 0) {
          result = undefined;
        } else if (e.childNodes.length === 1) {
          result = e.childNodes[0];
        } else {
          result = e.childNodes;
        }
      } else if (match = cmd.match(/^\s*(?:const|var|let)?\s*([a-z][a-z0-9]*)\s*=\s*(<(?:\!\-*)?[a-z].*)$/im)) {
        const e = window.document.createElement('div');
        e.innerHTML = match[2];
        if (e.childNodes.length === 0) {
          result = undefined;
        } else if (e.childNodes.length === 1) {
          result = e.childNodes[0];
        } else {
          result = e.childNodes;
        }
        window[match[1]] = result;
      } else {
        try {
          result = window.vm.run(cmd, filename); // XXX vm
        } catch(e) {
          err = e;
        }
      }

      if (!err) {
        if (window._ === lastUnderscore) {
          window._ = result;
          lastUnderscore = result;
        }
        if (result !== undefined) {
          r.setPrompt(prompt);
        }
      } else {
        if (err.name === 'SyntaxError') {
          err = new repl.Recoverable(err);
        }
      }

      GlobalContext.commands.push(cmd);

      callback(err, result);
    };
    const r = repl.start({
      prompt,
      eval: replEval,
    });
    replHistory(r, path.join(dataPath, '.repl_history'));
    r.on('exit', () => {
      process.exit();
    });
  }
};

if (require.main === module) {
  if (nativeBindings.nativeAnalytics) {
    require(path.join(__dirname, 'bugsnag'));
    require('fault-zone').registerHandler((stack, stackLen) => {
      const message = new Buffer(stack, 0, stackLen).toString('utf8');
      console.warn(message);
      child_process.execFileSync(process.argv[0], [
        path.join(__dirname, 'bugsnag.js'),
      ], {
        input: message,
      });
      process.exit(1);
    });
  }
  if (args.log) {
    const RedirectOutput = require('redirect-output').default;
    new RedirectOutput({
      flags: 'a',
    }).write(path.join(dataPath, 'log.txt'));
  }

  const _logStack = err => {
    console.warn(err);
  };
  process.on('uncaughtException', _logStack);
  process.on('unhandledRejection', _logStack);
  EventEmitter.defaultMaxListeners = 100;

  if (args.version) {
    console.log(version);
    process.exit(0);
  }
  if (args.size) {
    const match = args.size.match(/^([0-9]+)x([0-9]+)$/);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (w > 0 && h > 0) {
        innerWidth = w;
        innerHeight = h;
      }
    }
  }
  if (args.frame || args.minimalFrame) {
    bindings.nativeGl = (OldWebGLRenderingContext => {
      function WebGLRenderingContext() {
        const result = Reflect.construct(OldWebGLRenderingContext, arguments);
        for (const k in result) {
          if (typeof result[k] === 'function') {
            result[k] = (old => function() {
              if (GlobalContext.args.frame) {
                console.log(k, arguments);
              } else if (GlobalContext.args.minimalFrame) {
                console.log(k);
              }
              return old.apply(this, arguments);
            })(result[k]);
          }
        }
        return result;
      }
      for (const k in OldWebGLRenderingContext) {
        WebGLRenderingContext[k] = OldWebGLRenderingContext[k];
      }
      return WebGLRenderingContext;
    })(bindings.nativeGl);
  }

  _prepare()
    .then(() => _start())
    .catch(err => {
      console.warn(err.stack);
      process.exit(1);
    });
}

module.exports = core;
