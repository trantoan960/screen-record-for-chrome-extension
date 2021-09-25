let mediaRecorder = null;

function __findElement(pattern) {
  return document.querySelector("rhp-shadow").shadowRoot.querySelector(pattern);
}

// listen event from other
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.message) {
    case "init":
      onInit();
      break;
  }
});

async function onInit() {
  try {
    // append
    const shadow = appendContainerExt();

    // get devices
    const deviceInfo = await getDevices();

    // render
    render(shadow, deviceInfo);

    // init global variables
    let cameraDom = null;
    let screenDom = null;

    // show camera (webcam) into content script dom
    if (deviceInfo.videoInput.length > 0) {
      const cameraOptions = {
        audio: false,
        video: {
          deviceId: deviceInfo.videoInput[0].deviceId,
          width: { min: 100, max: 1920, ideal: 1280 },
          height: { min: 100, max: 1080, ideal: 720 },
          frameRate: { ideal: 30 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(cameraOptions);

      cameraDom = __findElement("#rhp-camera");

      if (cameraDom) cameraDom.srcObject = stream;
    }

    // show screen user select to share
    const buttonDom = __findElement("#rhp-button-record");

    if (buttonDom)
      buttonDom.addEventListener("click", async function () {
        try {
          // show screen to video element
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });

          // listen on stop sharing
          screenStream.oninactive = onStopRecord;

          screenDom = __findElement("#rhp-screen");
          if (screenDom) screenDom.srcObject = screenStream;

          // merged into 1 video
          const canvasDom = __findElement("#rhp-canvas");

          if (canvasDom) {
            const ctx = canvasDom.getContext("2d");

            // move two video into canvas
            drawVideo(ctx, screenDom, cameraDom);
          }

          // capture stream from canvas
          const canvasStream = canvasDom.captureStream(30);

          // handle audio stream
          const audioOptions = {
            mineType: "video/webm;codecs=vp8,opus",
            // mineType: "video/mp4"
            audio: {
              deviceId: deviceInfo.audioInput[2].deviceId,
            },
          };

          const audioStream = await navigator.mediaDevices.getUserMedia(
            audioOptions
          );

          for (const track of audioStream.getTracks()) {
            canvasStream.addTrack(track);
          }

          // on record
          onRecord(canvasStream, shadow);
        } catch (error) {
          console.log(`Something to failed choose media`);
        }
      });
  } catch (error) {
    console.log(`Something to failed as ${error}`);
  }
}

function downloadVideoRecorded(recordedChunks) {
  const blob = new Blob(recordedChunks, {
    type: "video/webm",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.style = "display: none";
  a.href = url;
  a.download = "test.webm";
  a.click();
  window.URL.revokeObjectURL(url);
}

function onStopRecord() {
  if (mediaRecorder) {
    mediaRecorder.stop();
  }
}

function onRecord(stream, shadow) {
  let options = null;
  let recordedChunks = [];

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    options = { mimeType: "video/webm; codecs=vp9" };
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    options = { mimeType: "video/webm; codecs=vp8" };
  }

  function handleDataAvailable(event) {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  }

  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.onstop = function (e) {
    if (recordedChunks && recordedChunks.length > 0) {
      downloadVideoRecorded(recordedChunks);
      unMount(shadow);
    }
  };
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start();
}

function drawVideo(ctx, screen, camera) {
  const screenX = 0;
  const screenY = 0;
  const screenXCor = ctx.canvas.width;
  const screenYCor = ctx.canvas.height;

  const cameraX = 0.625 * ctx.canvas.width;
  const cameraY = 0.625 * ctx.canvas.height;
  const cameraXCor = ctx.canvas.width / 3;
  const cameraYCor = ctx.canvas.height / 3;

  ctx.drawImage(screen, screenX, screenY, screenXCor, screenYCor);
  ctx.drawImage(camera, cameraX, cameraY, cameraXCor, cameraYCor);

  requestAnimationFrame(() => drawVideo(ctx, screen, camera));
}

async function getDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    const audioInput = [];
    const videoInput = [];

    devices.forEach((device) => {
      if (device.kind === "audioinput") audioInput.push(device);
      else if (device.kind === "videoinput") videoInput.push(device);
    });

    return {
      audioInput,
      videoInput,
    };
  } catch (error) {
    console.log(`Get devices are failed as ${error}`);
  }
}

function appendContainerExt() {
  const rootDom = document.createElement("rhp-container");
  const shadowDom = document.createElement("rhp-shadow");

  rootDom.appendChild(shadowDom);

  const htmlDom = document.querySelector("html");
  if (htmlDom) htmlDom.appendChild(rootDom);

  const shadow = shadowDom.attachShadow({ mode: "open" });

  return shadow;
}

function render(shadow, deviceInfo) {
  let audioDom = `<select id="rhp-audio-devices">`;

  if (deviceInfo.audioInput.length > 0)
    for (let i = 0; i < deviceInfo.audioInput.length; i++) {
      audioDom += `<option value="${deviceInfo.audioInput[i].deviceId}">${deviceInfo.audioInput[i].label}</option>`;
    }

  audioDom += `</select>`;

  // TODO: get devices then append to dom - camera

  shadow.innerHTML = `
    <style>
      .rhp-overlay {
        position: fixed;
        z-index: 2147483645;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        margin: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        background-color: hsla(0, 0%, 100%, 0.8);
      }
      .rhp-menu {
        position: fixed;
        z-index: 2147483647;
        top: 24px;
        right: 0;
        flex-direction: column;
        justify-content: space-between;
        display: flex;
        transition: right 1s cubic-bezier(0.19, 1, 0.22, 1),
          height 0.2s ease-in-out;
        box-shadow: 0 8px 34px 4px rgb(0 0 0 / 6%);
        border: 1px solid hsla(240, 8%, 46%, 0.2);
        border-right: none;
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
        width: 400px;
        height: auto;
        background-color: #fff;
      }
      .rhp-dragabled {
        position: fixed;
        z-index: 2147483647;
        bottom: 24px;
        left: 24px;
        display: flex;
        flex-direction: column;
      }
      #rhp-camera {
        width: 300px;
        height: 150px;
      }
      #rhp-screen {
        width: 600px;
        height: 300px;
      }
    </style>
    <div>
      <div class="rhp-overlay"></div>
      <div class="rhp-dragabled">
        <video id="rhp-camera" autoplay="true"></video>
        <video id="rhp-screen" autoplay="true"></video>
        <canvas id="rhp-canvas"></canvas>
      </div>
      <div class="rhp-menu">
        <div class="rhp-menu__header">
          <svg viewBox="0 0 100 30" fill="none">
            <path
              d="M30.01 13.43h-9.142l7.917-4.57-1.57-2.72-7.918 4.57 4.57-7.915-2.72-1.57-4.571 7.913V0h-3.142v9.139L8.863 1.225l-2.721 1.57 4.57 7.913L2.796 6.14 1.225 8.86l7.917 4.57H0v3.141h9.141l-7.916 4.57 1.57 2.72 7.918-4.57-4.571 7.915 2.72 1.57 4.572-7.914V30h3.142v-9.334l4.655 8.06 2.551-1.472-4.656-8.062 8.087 4.668 1.571-2.72-7.916-4.57h9.141v-3.14h.001zm-15.005 5.84a4.271 4.271 0 11-.001-8.542 4.271 4.271 0 01.001 8.542z"
              fill="#000"
            ></path>
            <path
              d="M38.109 25.973V4.027h4.028v21.946h-4.028zM76.742 11.059h3.846v1.82c.818-1.455 2.727-2.244 4.362-2.244 2.03 0 3.665.88 4.422 2.485 1.18-1.82 2.756-2.485 4.725-2.485 2.756 0 5.39 1.667 5.39 5.668v9.67h-3.906v-8.851c0-1.607-.788-2.82-2.636-2.82-1.727 0-2.757 1.335-2.757 2.942v8.73h-3.996v-8.852c0-1.607-.818-2.82-2.636-2.82-1.757 0-2.787 1.305-2.787 2.942v8.73h-4.027V11.059zM51.24 26.405c-4.538 0-7.824-3.367-7.824-7.889 0-4.45 3.276-7.896 7.824-7.896 4.57 0 7.824 3.478 7.824 7.896 0 4.49-3.288 7.889-7.824 7.889zm0-12.135a4.25 4.25 0 00-4.244 4.247 4.25 4.25 0 004.244 4.247 4.25 4.25 0 004.243-4.247 4.25 4.25 0 00-4.243-4.247zM67.667 26.405c-4.538 0-7.824-3.367-7.824-7.889 0-4.45 3.276-7.896 7.824-7.896 4.57 0 7.824 3.478 7.824 7.896 0 4.49-3.29 7.889-7.824 7.889zm0-12.186a4.3 4.3 0 00-4.293 4.296 4.3 4.3 0 004.293 4.296 4.3 4.3 0 004.293-4.296 4.3 4.3 0 00-4.293-4.296z"
              fill="#000"
            ></path>
          </svg>
        </div>
        <div class="rhp-menu__content">
          <div class="row">
            <select name="" id="">
              <option value="">Screen and Camera</option>
              <option value="">Screen Only</option>
              <option value="">Camera Only</option>
            </select>
          </div>
          <div class="row">
            <button>Full Desktop</button>
            <button>Current Tab</button>
          </div>
          <div class="row">
            <h3>Record Settings</h3>
            <div>
              ${audioDom}
            </div>
          </div>
          <div class="row">
            <h3>Camera Settings</h3>
            <div>
              <select name="" id="">
                <option value="">Camera 1</option>
                <option value="">camera 2</option>
              </select>
            </div>
          </div>
        </div>
        <div class="rhp-menu__footer">
          <button id="rhp-button-record">Start Record</button>
        </div>
      </div>
    </div>
  `;
}

function unMount(shadow) {
  shadow.innerHTML = `<span></span>`;
}
