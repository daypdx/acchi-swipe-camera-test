import "./styles.css";

const DIRECTIONS = ["up", "right", "down", "left"];
const DIRECTION_LABELS = {
  up: "Up",
  right: "Right",
  down: "Down",
  left: "Left",
  center: "Center",
  none: "None",
  locked: "Locked",
  pointer: "Pointer",
  looker: "Looker",
};
const MEDIAPIPE_VERSION = "0.10.35";
const query = new URLSearchParams(window.location.search);

const state = {
  mode: query.get("mode") === "ai" ? "ai" : "online",
  scores: {
    pointer: 0,
    looker: 0,
  },
  choices: {
    pointer: null,
    looker: null,
  },
  lastRound: null,
  roundNumber: 1,
  message: "Point. Dodge. Don't match.",
  phase: "input",
  camera: {
    ready: false,
    loading: false,
    error: "",
    stream: null,
    landmarker: null,
    handLandmarker: null,
    blazeModel: null,
    trackerLoading: false,
    blazeLoading: false,
    trackerNote: "",
    trackingMode: "",
    lastSeenAt: 0,
    lastLandmarkAt: 0,
    lastBlazeAt: 0,
    blazeRunning: false,
    rafId: 0,
    baseline: null,
    direction: "center",
    confidence: 0,
    dx: 0,
    dy: 0,
    smoothDx: 0,
    smoothDy: 0,
    localX: 0,
    localY: 0,
    poseX: 0,
    poseY: 0,
    seen: false,
    handSeen: false,
    handDirection: "center",
    handConfidence: 0,
    handDx: 0,
    handDy: 0,
    lastHandSeenAt: 0,
    lastHandAt: 0,
    pendingDirection: "center",
    lockTimer: 0,
    pointerPendingDirection: "center",
    pointerLockTimer: 0,
  },
  online: {
    ws: null,
    connected: false,
    connecting: false,
    roomCode: "",
    role: null,
    status: "Offline",
    shareUrl: "",
    ready: false,
    players: {
      pointer: false,
      looker: false,
    },
    submitted: {
      pointer: false,
      looker: false,
    },
    autoJoinCode: query.get("room") || "",
  },
  ai: {
    humanRole: query.get("role") === "looker" ? "looker" : "pointer",
    thinking: false,
  },
  ui: {
    menuOpen: false,
  },
  toastTimer: 0,
};

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app">
    <header class="topbar">
      <div class="brand" aria-label="JitSwipe">
        <span class="brand-mark" aria-hidden="true">${icon("spark")}</span>
        <div class="brand-copy">
          <h1>JitSwipe</h1>
          <p>The reaction game for people who know.</p>
        </div>
      </div>
      <div class="mode-tabs" role="tablist" aria-label="Mode">
        <button type="button" data-mode="online" role="tab" aria-selected="true">${icon("phone")}Phone Room</button>
        <button type="button" data-mode="ai" role="tab" aria-selected="false">${icon("bot")}Computer</button>
      </div>
      <div class="scorebar" aria-live="polite">
        <div class="score"><span>Pointer</span><strong data-score="pointer">0</strong></div>
        <div class="score"><span>Looker</span><strong data-score="looker">0</strong></div>
      </div>
    </header>

    <section class="layout">
      <div class="arena">
        <section class="stage" aria-live="polite">
          <div class="round-header">
            <div class="status">
              <div class="status-label"><span class="status-dot"></span><span data-status-label>Round 1</span></div>
              <h2 data-round-title>Point. Dodge. Don't match.</h2>
            </div>
            <div class="round-actions" aria-label="Round controls">
              <button type="button" data-action="reset-round" title="Reset round" aria-label="Reset round">${icon("rotate")}</button>
              <button type="button" data-action="reset-game" title="Reset game" aria-label="Reset game">${icon("refresh")}</button>
            </div>
          </div>

          <div class="face-scene" aria-hidden="true">
            ${faceAsset()}
          </div>

          <div class="result-strip">
            <div class="result-grid">
              <div class="result-tile">
                <span data-result-icon="pointer">${icon("pointer")}</span>
                <div><span>Pointer</span><strong data-choice-label="pointer">Waiting</strong></div>
              </div>
              <div class="result-tile">
                <span data-result-icon="looker">${icon("face")}</span>
                <div><span>Looker</span><strong data-choice-label="looker">Waiting</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section class="controls">
          <div class="control-top">
            <div class="control-title">
              <span data-control-kicker>Local match</span>
              <strong data-control-title>Two swipes decide the round</strong>
            </div>
            <button class="icon-button" type="button" data-action="random-round" title="Quick round" aria-label="Quick round">${icon("dice")}</button>
            <div class="menu-actions" aria-label="Menu controls">
              <button type="button" data-action="reset-round" title="Reset round" aria-label="Reset round">${icon("rotate")}</button>
              <button type="button" data-action="reset-game" title="Reset game" aria-label="Reset game">${icon("refresh")}</button>
              <button type="button" data-action="random-round" title="Quick round" aria-label="Quick round">${icon("dice")}</button>
            </div>
          </div>

          <div class="control-body">
            <div class="duel-controls is-active" data-panel="duel">
              ${playerInput("pointer", "Pointer")}
              ${playerInput("looker", "Looker")}
            </div>

            <div class="online-controls" data-panel="online">
              <div class="room-panel">
                <section class="room-card">
                  <header>
                    <span class="role-pill">Room</span>
                    <span class="connection-pill" data-online-status>Offline</span>
                  </header>
                  <div class="room-code-display" data-room-display>----</div>
                  <div class="room-actions">
                    <button class="solid-action" type="button" data-action="create-room">${icon("plus")}Create</button>
                    <label class="room-code-entry">
                      <span>Code</span>
                      <input data-room-code maxlength="4" autocomplete="off" inputmode="latin" placeholder="ABCD" />
                    </label>
                    <button class="solid-action" type="button" data-action="join-room">${icon("door")}Join</button>
                  </div>
                  <div class="share-row">
                    <button class="ghost-action" type="button" data-action="copy-link">${icon("link")}Copy link</button>
                    <button class="ghost-action" type="button" data-action="leave-room">${icon("plug")}Leave</button>
                  </div>
                </section>
                <section class="room-card">
                  <header>
                    <span class="role-pill" data-online-role>You</span>
                    <span class="connection-pill" data-online-ready>Waiting</span>
                  </header>
                  <div class="player-slots">
                    <div class="slot" data-slot="pointer">${icon("pointer")}<span>Pointer</span><strong>Open</strong></div>
                    <div class="slot" data-slot="looker">${icon("face")}<span>Looker</span><strong>Open</strong></div>
                  </div>
                </section>
              </div>
              <section class="player-input online-player">
                <header>
                  <span class="role-pill" data-online-pad-role>Your move</span>
                  <span class="choice-state" data-online-choice-state>Join a room</span>
                </header>
                ${swipePad("online-player")}
              </section>
            </div>

            <div class="ai-controls" data-panel="ai">
              <div class="ai-options">
                <section class="room-card">
                  <header>
                    <span class="role-pill">Computer</span>
                    <span class="connection-pill" data-ai-status>Ready</span>
                  </header>
                  <div class="role-switch" aria-label="Computer mode role">
                    <button type="button" data-ai-role="pointer" aria-pressed="true">${icon("pointer")}You point</button>
                    <button type="button" data-ai-role="looker" aria-pressed="false">${icon("face")}You look</button>
                  </div>
                </section>
                <section class="room-card">
                  <header>
                    <span class="role-pill" data-ai-human-label>You</span>
                    <span class="connection-pill" data-ai-opponent-label>CPU looks</span>
                  </header>
                  <div class="ai-face" aria-hidden="true">${icon("bot")}</div>
                </section>
              </div>
              <section class="player-input ai-player">
                <header>
                  <span class="role-pill" data-ai-pad-role>You point</span>
                  <span class="choice-state" data-ai-choice-state>Point to catch</span>
                </header>
                ${swipePad("ai-player")}
              </section>
            </div>

            <div class="camera-controls" data-panel="camera">
              <div class="camera-panel">
                <header>
                  <span class="role-pill" data-camera-role-label>Camera</span>
                  <button class="camera-action" type="button" data-action="camera" title="Start camera">${icon("camera")}Start</button>
                </header>
                <div class="tracking-readout">
                  <span class="tracking-label" data-tracking-label>Camera</span>
                  <div class="tracking-direction" data-tracking-direction>${icon("face")}Center</div>
                  <div class="meter-grid">
                    <div class="meter"><span>X</span><div class="meter-track"><div class="meter-fill" data-meter="x"></div></div></div>
                    <div class="meter"><span>Y</span><div class="meter-track"><div class="meter-fill" data-meter="y"></div></div></div>
                  </div>
                </div>
                <div class="camera-swipe">
                  ${swipePad("camera-pointer")}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="log">
        <span class="log-icon" aria-hidden="true">${icon("bolt")}</span>
        <div>
          <strong data-log-title>First to five wins.</strong>
          <span data-log-line>Pointer scores by matching. Looker scores by dodging.</span>
        </div>
        <div class="rounds" data-rounds aria-label="Recent rounds"></div>
      </aside>
    </section>
    <div class="video-shell camera-rig" aria-hidden="true">
      <video autoplay playsinline muted data-video></video>
      <canvas data-overlay></canvas>
      <div class="camera-empty" data-camera-empty aria-hidden="true">
        ${cameraAsset()}
      </div>
    </div>
    <div class="swipe-analog" data-swipe-analog aria-hidden="true">
      <span class="swipe-analog-ring"></span>
      <span class="swipe-analog-thumb"></span>
    </div>
    <button class="phone-menu-toggle" type="button" data-action="phone-menu" aria-expanded="false" aria-label="Open menu" title="Menu">
      ${icon("menu")}
    </button>
    <section class="desktop-gate" aria-label="Phone only">
      <div class="desktop-phone">
        <span class="desktop-phone-icon" aria-hidden="true">${icon("phone")}</span>
        <h2>Open this on your phone.</h2>
        <p>This build is locked to phone play so the camera and finger swipes feel right.</p>
        <strong data-phone-url></strong>
      </div>
    </section>
    <div class="toast" data-toast role="status"></div>
  </main>
`;

const els = {
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  panels: [...document.querySelectorAll("[data-panel]")],
  scorePointer: document.querySelector('[data-score="pointer"]'),
  scoreLooker: document.querySelector('[data-score="looker"]'),
  choicePointer: document.querySelector('[data-choice-label="pointer"]'),
  choiceLooker: document.querySelector('[data-choice-label="looker"]'),
  resultPointer: document.querySelector('[data-result-icon="pointer"]'),
  resultLooker: document.querySelector('[data-result-icon="looker"]'),
  title: document.querySelector("[data-round-title]"),
  statusLabel: document.querySelector("[data-status-label]"),
  logTitle: document.querySelector("[data-log-title]"),
  logLine: document.querySelector("[data-log-line]"),
  controlKicker: document.querySelector("[data-control-kicker]"),
  controlTitle: document.querySelector("[data-control-title]"),
  rounds: document.querySelector("[data-rounds]"),
  toast: document.querySelector("[data-toast]"),
  video: document.querySelector("[data-video]"),
  overlay: document.querySelector("[data-overlay]"),
  cameraEmpty: document.querySelector("[data-camera-empty]"),
  cameraButton: document.querySelector('[data-action="camera"]'),
  cameraRoleLabel: document.querySelector("[data-camera-role-label]"),
  trackingLabel: document.querySelector("[data-tracking-label]"),
  trackingDirection: document.querySelector("[data-tracking-direction]"),
  meterX: document.querySelector('[data-meter="x"]'),
  meterY: document.querySelector('[data-meter="y"]'),
  arrow: document.querySelector("[data-direction-arrow]"),
  onlineStatus: document.querySelector("[data-online-status]"),
  roomDisplay: document.querySelector("[data-room-display]"),
  roomCodeInput: document.querySelector("[data-room-code]"),
  onlineRole: document.querySelector("[data-online-role]"),
  onlineReady: document.querySelector("[data-online-ready]"),
  onlinePadRole: document.querySelector("[data-online-pad-role]"),
  onlineChoiceState: document.querySelector("[data-online-choice-state]"),
  onlinePlayer: document.querySelector(".online-player"),
  slotPointer: document.querySelector('[data-slot="pointer"]'),
  slotLooker: document.querySelector('[data-slot="looker"]'),
  aiRoleButtons: [...document.querySelectorAll("[data-ai-role]")],
  aiStatus: document.querySelector("[data-ai-status]"),
  aiHumanLabel: document.querySelector("[data-ai-human-label]"),
  aiOpponentLabel: document.querySelector("[data-ai-opponent-label]"),
  aiPadRole: document.querySelector("[data-ai-pad-role]"),
  aiChoiceState: document.querySelector("[data-ai-choice-state]"),
  aiPlayer: document.querySelector(".ai-player"),
  phoneUrl: document.querySelector("[data-phone-url]"),
  swipeAnalog: document.querySelector("[data-swipe-analog]"),
  menuToggle: document.querySelector('[data-action="phone-menu"]'),
};

init();

function init() {
  bindModes();
  bindActions();
  bindInputs();
  setupScreenSwipe();
  window.addEventListener("resize", render);
  render();
  hydrateRoomFromUrl();
  hydrateModeFromUrl();
}

function bindModes() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      resetRound(false);
      render();
    });
  });
}

function bindActions() {
  document.querySelectorAll('[data-action="reset-round"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "online") {
        sendOnline({ type: "resetRound" });
        return;
      }
      resetRound();
      render();
    });
  });

  document.querySelectorAll('[data-action="reset-game"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "online") {
        sendOnline({ type: "resetGame" });
        return;
      }
      state.scores.pointer = 0;
      state.scores.looker = 0;
      state.roundNumber = 1;
      state.lastRound = null;
      resetRound(false);
      render();
    });
  });

  document.querySelectorAll('[data-action="random-round"]').forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "online") {
        toast("Phone rooms use real choices.");
        return;
      }
      if (state.mode === "ai") {
        playAiRound(randomDirection());
        return;
      }
      choose("pointer", randomDirection());
      if (state.mode === "duel") choose("looker", randomDirection());
      if (state.mode === "camera") {
        state.camera.direction = randomDirection();
        resolveRound(state.choices.pointer, state.camera.direction);
      }
      render();
    });
  });

  els.menuToggle.addEventListener("click", () => {
    state.ui.menuOpen = !state.ui.menuOpen;
    render();
  });

  els.cameraButton.addEventListener("click", async () => {
    if (state.camera.ready) {
      if (activeCameraRole() === "looker") {
        if (!state.camera.seen) {
          toast("Find a face first.");
          return;
        }
        calibrateCamera();
        toast("Camera centered.");
      } else {
        toast("Show your pointing hand.");
      }
      render();
      return;
    }
    await startCamera();
  });

  document.querySelector('[data-action="create-room"]').addEventListener("click", async () => {
    await connectOnline();
    sendOnline({ type: "createRoom" });
  });

  document.querySelector('[data-action="join-room"]').addEventListener("click", async () => {
    await connectOnline();
    sendOnline({ type: "joinRoom", roomCode: els.roomCodeInput.value });
  });

  document.querySelector('[data-action="leave-room"]').addEventListener("click", () => {
    sendOnline({ type: "leaveRoom" });
    state.online.roomCode = "";
    state.online.role = null;
    state.online.ready = false;
    state.online.players.pointer = false;
    state.online.players.looker = false;
    state.online.submitted.pointer = false;
    state.online.submitted.looker = false;
    state.choices.pointer = null;
    state.choices.looker = null;
    render();
  });

  document.querySelector('[data-action="copy-link"]').addEventListener("click", async () => {
    if (!state.online.shareUrl) {
      toast("Create or join a room first.");
      return;
    }
    await navigator.clipboard?.writeText(state.online.shareUrl);
    toast("Room link copied.");
  });

  els.roomCodeInput.addEventListener("input", () => {
    els.roomCodeInput.value = normalizeRoomCode(els.roomCodeInput.value);
  });

  els.aiRoleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.ai.humanRole = button.dataset.aiRole;
      state.ai.thinking = false;
      state.scores.pointer = 0;
      state.scores.looker = 0;
      state.roundNumber = 1;
      state.lastRound = null;
      resetRound(false);
      state.ui.menuOpen = shouldShowPhoneControls();
      render();
    });
  });
}

function bindInputs() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      choose(button.dataset.role, button.dataset.direction);
      render();
    });
  });

  document.querySelectorAll("[data-camera-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      playCameraRound(button.dataset.cameraDirection);
    });
  });

  document.querySelectorAll("[data-online-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      playOnlineRound(button.dataset.onlineDirection);
    });
  });

  document.querySelectorAll("[data-ai-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      playAiRound(button.dataset.aiDirection);
    });
  });

  setupSwipePad(document.querySelector('[data-swipe-pad="pointer"]'), (direction) => {
    choose("pointer", direction);
    render();
  });

  setupSwipePad(document.querySelector('[data-swipe-pad="looker"]'), (direction) => {
    choose("looker", direction);
    render();
  });

  setupSwipePad(document.querySelector('[data-swipe-pad="camera-pointer"]'), (direction) => {
    playCameraRound(direction);
  });

  setupSwipePad(document.querySelector('[data-swipe-pad="online-player"]'), (direction) => {
    playOnlineRound(direction);
  });

  setupSwipePad(document.querySelector('[data-swipe-pad="ai-player"]'), (direction) => {
    playAiRound(direction);
  });

  document.addEventListener("keydown", (event) => {
    if (!isPhoneRuntime()) return;
    const pointerMap = {
      ArrowUp: "up",
      ArrowRight: "right",
      ArrowDown: "down",
      ArrowLeft: "left",
    };
    const lookerMap = {
      w: "up",
      d: "right",
      s: "down",
      a: "left",
    };
    if (pointerMap[event.key]) {
      if (state.mode === "camera") playCameraRound(pointerMap[event.key]);
      else if (state.mode === "online") playOnlineRound(pointerMap[event.key]);
      else if (state.mode === "ai") playAiRound(pointerMap[event.key]);
      else choose("pointer", pointerMap[event.key]);
      render();
    }
    if (lookerMap[event.key.toLowerCase()] && state.mode === "duel") {
      choose("looker", lookerMap[event.key.toLowerCase()]);
      render();
    }
  });
}

function playCameraRound(direction) {
  if (!state.camera.ready || !state.camera.seen || state.camera.direction === "center") {
    toast("Center your face, then turn up, down, left, or right.");
    return;
  }

  choose("pointer", direction, false);
  resolveRound(direction, state.camera.direction);
  render();
}

function playOnlineRound(direction) {
  if (!state.online.connected || !state.online.roomCode || !state.online.role) {
    toast("Create or join a phone room first.");
    return;
  }
  if (state.online.role === "looker") {
    toast("You're the looker. Dodge with your head.");
    return;
  }
  if (!state.online.ready) {
    toast("Waiting for the other phone.");
    return;
  }
  if (state.phase === "reveal" || state.online.submitted[state.online.role]) return;

  state.choices[state.online.role] = direction;
  state.online.submitted[state.online.role] = true;
  pulsePad("online-player", direction);
  sendOnline({ type: "submit", direction });
  render();
}

function playAiRound(direction) {
  if (state.phase === "reveal" || state.ai.thinking) return;
  if (state.ai.humanRole === "looker") {
    toast("You're the looker. Dodge with your head.");
    return;
  }

  const humanRole = state.ai.humanRole;
  const computerRole = otherRole(humanRole);
  state.choices[humanRole] = direction;
  pulsePad("ai-player", direction);
  state.ai.thinking = true;
  render();

  window.setTimeout(() => {
    const computerDirection = randomDirection();
    state.choices[computerRole] = computerDirection;
    state.ai.thinking = false;
    resolveRound(state.choices.pointer, state.choices.looker);
    render();
  }, 360);
}

function playAiLookRound(direction) {
  if (state.phase === "reveal" || state.ai.thinking || state.ai.humanRole !== "looker") return;

  state.choices.looker = direction;
  state.ai.thinking = true;
  render();

  window.setTimeout(() => {
    state.choices.pointer = randomDirection();
    state.ai.thinking = false;
    resolveRound(state.choices.pointer, state.choices.looker);
    render();
  }, 360);
}

async function connectOnline() {
  if (state.online.connected || state.online.connecting) return;

  state.online.connecting = true;
  state.online.status = "Connecting";
  render();

  await new Promise((resolve) => {
    const ws = new WebSocket(roomSocketUrl());
    state.online.ws = ws;

    ws.addEventListener("open", () => {
      state.online.connected = true;
      state.online.connecting = false;
      state.online.status = "Connected";
      render();
      resolve();
    });

    ws.addEventListener("message", (event) => {
      handleOnlineMessage(JSON.parse(event.data));
    });

    ws.addEventListener("close", () => {
      state.online.connected = false;
      state.online.connecting = false;
      state.online.status = "Offline";
      state.online.role = null;
      state.online.ready = false;
      state.online.players.pointer = false;
      state.online.players.looker = false;
      render();
    });

    ws.addEventListener("error", () => {
      state.online.connecting = false;
      state.online.status = "Server unavailable";
      toast("Start the room server, then try again.");
      render();
      resolve();
    });
  });
}

function sendOnline(message) {
  if (!state.online.ws || state.online.ws.readyState !== WebSocket.OPEN) {
    toast("Phone room is offline.");
    return;
  }
  state.online.ws.send(JSON.stringify(message));
}

function handleOnlineMessage(message) {
  if (message.type === "error") {
    toast(message.message);
    return;
  }
  if (message.type !== "roomState") return;

  const room = message.room;
  state.online.roomCode = room.code;
  state.online.role = message.role;
  state.online.ready = room.ready;
  state.online.players = room.players;
  state.online.submitted = {
    pointer: Boolean(room.choices.pointer),
    looker: Boolean(room.choices.looker),
  };
  state.online.shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
  state.scores.pointer = room.scores.pointer;
  state.scores.looker = room.scores.looker;
  state.roundNumber = room.roundNumber;
  state.phase = room.phase;
  state.lastRound = room.lastRound;
  state.message = room.lastRound?.matched ? "Caught. Pointer scores." : "Dodged. Looker scores.";

  if (room.phase === "reveal") {
    state.choices.pointer = room.choices.pointer;
    state.choices.looker = room.choices.looker;
  } else {
    state.choices.pointer =
      state.online.role === "pointer" && room.choices.pointer ? state.choices.pointer || "locked" : null;
    state.choices.looker =
      state.online.role === "looker" && room.choices.looker ? state.choices.looker || "locked" : null;
  }

  if (isPhoneRuntime() && !shouldShowPhoneControls()) {
    state.ui.menuOpen = false;
  }

  render();
}

function hydrateRoomFromUrl() {
  const code = normalizeRoomCode(state.online.autoJoinCode);
  if (!code) return;
  state.mode = "online";
  els.roomCodeInput.value = code;
  render();
  window.setTimeout(async () => {
    await connectOnline();
    if (state.online.connected) sendOnline({ type: "joinRoom", roomCode: code });
  }, 150);
}

function hydrateModeFromUrl() {
  if (query.get("mode") !== "ai") return;
  resetRound(false);
  render();
}

function roomSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = window.location.port === "5173" ? "8787" : window.location.port || "8787";
  return `${protocol}//${window.location.hostname}:${port}`;
}

function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function otherRole(role) {
  return role === "pointer" ? "looker" : "pointer";
}

function setupScreenSwipe() {
  let start = null;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!canUseScreenSwipe(event.target)) return;
      start = { x: event.clientX, y: event.clientY };
      showSwipeAnalog(start.x, start.y);
    },
    { passive: true },
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!start) return;
      updateSwipeAnalog(event.clientX - start.x, event.clientY - start.y);
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerup",
    (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const distance = Math.hypot(dx, dy);
      start = null;
      hideSwipeAnalog();
      if (distance < 34) return;

      const direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (state.mode === "online") playOnlineRound(direction);
      if (state.mode === "ai") playAiRound(direction);
    },
    { passive: true },
  );

  document.addEventListener("pointercancel", () => {
    start = null;
    hideSwipeAnalog();
  });
}

function canUseScreenSwipe(target) {
  if (!isPhoneRuntime()) return false;
  if (state.ui.menuOpen) return false;
  if (target.closest("button, input, label, a, .room-card, .mode-tabs, .round-actions")) {
    return false;
  }
  if (state.phase === "reveal") return false;
  if (state.mode === "online") {
    return (
      state.online.ready &&
      state.online.role === "pointer" &&
      !state.online.submitted.pointer
    );
  }
  if (state.mode === "ai") return state.ai.humanRole === "pointer" && !state.ai.thinking;
  return false;
}

function showSwipeAnalog(x, y) {
  if (!els.swipeAnalog) return;
  els.swipeAnalog.style.left = `${x}px`;
  els.swipeAnalog.style.top = `${y}px`;
  updateSwipeAnalog(0, 0);
  document.body.classList.add("is-swiping");
}

function updateSwipeAnalog(dx, dy) {
  const max = 68;
  const distance = Math.hypot(dx, dy);
  const scale = distance > max ? max / distance : 1;
  document.documentElement.style.setProperty("--swipe-x", `${dx * scale}px`);
  document.documentElement.style.setProperty("--swipe-y", `${dy * scale}px`);
}

function hideSwipeAnalog() {
  document.body.classList.remove("is-swiping");
  document.documentElement.style.setProperty("--swipe-x", "0px");
  document.documentElement.style.setProperty("--swipe-y", "0px");
}

function isPhoneRuntime() {
  const params = new URLSearchParams(window.location.search);
  return params.has("phone") || window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 820;
}

function setupSwipePad(pad, onDirection) {
  if (!pad) return;
  let start = null;

  pad.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY };
    pad.setPointerCapture(event.pointerId);
    pad.classList.add("is-armed");
  });

  pad.addEventListener("pointerup", (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    pad.classList.remove("is-armed");
    start = null;

    if (distance < 34) return;
    const direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    onDirection(direction);
  });

  pad.addEventListener("pointercancel", () => {
    start = null;
    pad.classList.remove("is-armed");
  });
}

function choose(role, direction, shouldResolve = true) {
  if (!DIRECTIONS.includes(direction) || state.phase === "reveal") return;

  state.choices[role] = direction;
  pulsePad(role, direction);

  if (shouldResolve && state.mode === "duel" && state.choices.pointer && state.choices.looker) {
    resolveRound(state.choices.pointer, state.choices.looker);
  }
}

function pulsePad(role, direction) {
  const selectors = [`[data-role="${role}"]`];
  if (role === "camera-pointer") selectors.push(`[data-camera-direction="${direction}"]`);
  if (role === "online-player") selectors.push(`[data-online-direction="${direction}"]`);
  if (role === "ai-player") selectors.push(`[data-ai-direction="${direction}"]`);

  document
    .querySelectorAll(selectors.join(", "))
    .forEach((button) => {
      button.classList.add("is-selected");
      window.setTimeout(() => button.classList.remove("is-selected"), 220);
    });
}

function resolveRound(pointer, looker) {
  if (!pointer || !looker || state.phase === "reveal") return;

  const matched = pointer === looker;
  const winner = matched ? "pointer" : "looker";
  state.scores[winner] += 1;
  state.lastRound = {
    pointer,
    looker,
    winner,
    matched,
  };
  state.message = matched ? "Caught. Pointer scores." : "Dodged. Looker scores.";
  state.phase = "reveal";
  state.choices.pointer = pointer;
  state.choices.looker = looker;
  state.roundNumber += 1;
  window.setTimeout(() => {
    resetRound(false);
    render();
  }, 1250);
}

function resetRound(resetMessage = true) {
  state.choices.pointer = null;
  state.choices.looker = null;
  state.phase = "input";
  clearCameraLock();
  if (resetMessage) state.message = state.mode === "camera" ? "Camera duel." : "Point. Dodge. Don't match.";
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const message = "Camera needs secure HTTPS. Open the https:// phone URL and allow the certificate.";
    state.camera.error = message;
    toast(message);
    render();
    return;
  }

  state.camera.loading = true;
  state.camera.error = "";
  render();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    els.video.srcObject = stream;
    els.video.muted = true;
    els.video.playsInline = true;
    await els.video.play();
    await waitForVideoFrame(els.video);
    state.camera.stream = stream;
    state.camera.ready = true;
    state.camera.loading = false;
    state.camera.error = "";
    state.camera.trackerNote = "Loading tracker.";
    state.camera.baseline = null;
    state.camera.seen = false;
    state.camera.handSeen = false;
    state.camera.direction = "center";
    state.camera.handDirection = "center";
    state.camera.smoothDx = 0;
    state.camera.smoothDy = 0;
    state.camera.lastSeenAt = 0;
    state.camera.lastHandSeenAt = 0;
    clearCameraLock();
    state.ui.menuOpen = false;
    trackCamera();
    render();
    loadCameraTrackers();
  } catch (error) {
    stopCameraStream();
    state.camera.loading = false;
    state.camera.error = friendlyCameraError(error);
    toast(state.camera.error);
  }

  render();
}

function waitForVideoFrame(video) {
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("canplay", done);
      resolve();
    };
    video.addEventListener("loadedmetadata", done, { once: true });
    video.addEventListener("canplay", done, { once: true });
    window.setTimeout(done, 1200);
  });
}

function stopCameraStream() {
  state.camera.stream?.getTracks().forEach((track) => track.stop());
  state.camera.stream = null;
  els.video.srcObject = null;
}

function loadCameraTrackers() {
  loadMediaPipeTracker();
  loadBlazeFaceTracker();
}

async function loadMediaPipeTracker() {
  if ((state.camera.landmarker && state.camera.handLandmarker) || state.camera.trackerLoading) return;
  state.camera.trackerLoading = true;
  state.camera.trackerNote = "Loading camera trackers.";
  render();

  try {
    const { FaceLandmarker, FilesetResolver, HandLandmarker } = await import(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`
    );

    const fileset = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
    );

    const [faceTracker, handTracker] = await Promise.all([
      createFaceLandmarker(FaceLandmarker, fileset).catch(() => null),
      createHandLandmarker(HandLandmarker, fileset).catch(() => null),
    ]);

    state.camera.landmarker = faceTracker;
    state.camera.handLandmarker = handTracker;
    if (!faceTracker && !handTracker) throw new Error("No camera trackers loaded");
    state.camera.trackerNote =
      handTracker && faceTracker
        ? "Trackers ready."
        : handTracker
          ? "Hand tracker ready."
          : "Face tracker ready. Swipe to point.";
  } catch {
    state.camera.trackerNote = state.camera.blazeModel ? "Backup tracker ready." : "Loading backup tracker.";
  } finally {
    state.camera.trackerLoading = false;
    render();
  }
}

async function createHandLandmarker(HandLandmarker, fileset) {
  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
  const options = {
    runningMode: "VIDEO",
    numHands: 1,
  };

  try {
    return await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: "GPU" },
    });
  } catch {
    return HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: "CPU" },
    });
  }
}

async function loadBlazeFaceTracker() {
  if (state.camera.blazeModel || state.camera.blazeLoading) return;
  state.camera.blazeLoading = true;

  try {
    await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js", "tfjs");
    if (window.tf) {
      await window.tf.setBackend("webgl").catch(() => window.tf.setBackend("cpu"));
      await window.tf.ready();
    }
    await loadScript(
      "https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js",
      "blazeface",
    );
    state.camera.blazeModel = await window.blazeface.load();
    if (!state.camera.landmarker) state.camera.trackerNote = "Backup tracker ready.";
  } catch {
    if (!state.camera.landmarker) state.camera.trackerNote = "Face tracker did not load.";
  } finally {
    state.camera.blazeLoading = false;
    render();
  }
}

function loadScript(src, id) {
  const existing = document.querySelector(`script[data-loader-id="${id}"]`);
  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loaderId = id;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", reject, { once: true });
    document.head.append(script);
  });
}

async function createFaceLandmarker(FaceLandmarker, fileset) {
  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
  const options = {
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  };

  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: "GPU" },
    });
  } catch {
    return FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: "CPU" },
    });
  }
}

function friendlyCameraError(error) {
  if (!window.isSecureContext) return "Camera needs HTTPS. Open the https:// phone URL.";
  if (error?.name === "NotAllowedError") return "Camera permission was blocked.";
  if (error?.name === "NotFoundError") return "No camera was found.";
  if (error?.name === "NotReadableError") return "Camera is already in use by another app.";
  if (error?.message) return `Camera could not start: ${error.message}`;
  return "Camera could not start.";
}

function calibrateCamera() {
  if (!state.camera.seen) {
    state.camera.baseline = null;
    return;
  }
  state.camera.baseline = {
    x: state.camera.noseX,
    y: state.camera.noseY,
    localX: state.camera.localX ?? state.camera.noseX,
    localY: state.camera.localY ?? state.camera.noseY,
    poseX: state.camera.poseX ?? state.camera.localX ?? state.camera.noseX,
    poseY: state.camera.poseY ?? state.camera.localY ?? state.camera.noseY,
    usesLocal: state.camera.usesLocalTracking ?? false,
    usesPose: state.camera.usesPoseTracking ?? false,
    width: state.camera.faceWidth || 1,
    height: state.camera.faceHeight || 1,
  };
}

function trackCamera() {
  const tick = () => {
    detectFace();
    state.camera.rafId = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(state.camera.rafId);
  tick();
}

function detectFace() {
  const video = els.video;
  if (video.readyState < 2) return;

  const now = performance.now();
  let tracked = false;

  if (shouldTrackPointer()) {
    detectHandPointing(video, now);
  }

  if (shouldTrackLooker() && state.camera.landmarker) {
    try {
      const result = state.camera.landmarker.detectForVideo(video, now);
      const landmarks = result.faceLandmarks?.[0];
      const transform = result.facialTransformationMatrixes?.[0];
      drawFaceOverlay(landmarks);
      if (landmarks) {
        applyMediaPipeLandmarks(landmarks, transform);
        state.camera.lastLandmarkAt = now;
        tracked = true;
      }
    } catch {
      state.camera.landmarker = null;
      state.camera.trackerNote = state.camera.blazeModel ? "Backup tracker ready." : "Loading backup tracker.";
    }
  }

  const needsBackup =
    shouldTrackLooker() && !tracked && state.camera.blazeModel && now - state.camera.lastLandmarkAt > 450;
  if (needsBackup) {
    runBlazeFaceTracker(video, now);
    return;
  }

  if (shouldTrackLooker() && !tracked) markFaceMissing(now);
}

function detectHandPointing(video, now) {
  if (!state.camera.handLandmarker) {
    markHandMissing(now);
    return;
  }

  try {
    const result = state.camera.handLandmarker.detectForVideo(video, now);
    const landmarks = result.landmarks?.[0];
    if (!landmarks) {
      markHandMissing(now);
      return;
    }
    applyHandLandmarks(landmarks, now);
  } catch {
    state.camera.handLandmarker = null;
    state.camera.trackerNote = "Hand tracker paused. Swipe still works.";
    markHandMissing(now);
  }
}

function applyHandLandmarks(landmarks, now) {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5] || wrist;
  const indexTip = landmarks[8];
  const indexPip = landmarks[6] || indexMcp;

  if (!wrist || !indexTip || !indexMcp) {
    markHandMissing(now);
    return;
  }

  const rawDx = indexTip.x - indexMcp.x;
  const rawDy = indexTip.y - indexMcp.y;
  const dx = -rawDx;
  const dy = rawDy;
  const reach = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
  const fingerLength = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);
  const pipLength = Math.hypot(indexPip.x - indexMcp.x, indexPip.y - indexMcp.y);
  const expressiveEnough = reach > 0.12 && fingerLength > pipLength * 0.82;
  const threshold = 0.045;
  let direction = "center";
  let confidence = 0;

  if (expressiveEnough && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
    direction = dx > 0 ? "right" : "left";
    confidence = Math.min(1, Math.abs(dx) / 0.18);
  } else if (expressiveEnough && Math.abs(dy) > threshold) {
    direction = dy > 0 ? "down" : "up";
    confidence = Math.min(1, Math.abs(dy) / 0.18);
  }

  state.camera.handSeen = true;
  state.camera.lastHandSeenAt = now;
  state.camera.lastHandAt = now;
  state.camera.handDirection = direction;
  state.camera.handConfidence = confidence;
  state.camera.handDx = clamp(dx, -0.28, 0.28);
  state.camera.handDy = clamp(dy, -0.28, 0.28);
  if (shouldTrackPointer() && state.phase !== "reveal" && !state.online.submitted.pointer) {
    state.choices.pointer = direction === "center" ? null : direction;
  }
  handleCameraDirection(direction, "pointer");
  renderCameraReadout();
}

function markHandMissing(now) {
  if (now - state.camera.lastHandSeenAt < 650) return;

  state.camera.handSeen = false;
  state.camera.handDirection = "center";
  state.camera.handConfidence = 0;
  if (shouldTrackPointer() && state.phase !== "reveal" && !state.online.submitted.pointer) {
    state.choices.pointer = null;
  }
  handleCameraDirection("center", "pointer");
  renderCameraReadout();
}

function applyMediaPipeLandmarks(landmarks, transform = null) {
  const nose = landmarks[1] || landmarks[4];
  const left = landmarks[454] || landmarks[356];
  const right = landmarks[234] || landmarks[127];
  const top = landmarks[10] || landmarks[151];
  const bottom = landmarks[152] || landmarks[199];

  if (!nose || !left || !right || !top || !bottom) {
    markFaceMissing(performance.now());
    return;
  }

  const faceWidth = Math.max(0.001, Math.abs(left.x - right.x));
  const faceHeight = Math.max(0.001, Math.abs(bottom.y - top.y));
  const faceCenterX = (left.x + right.x) / 2;
  const faceCenterY = (top.y + bottom.y) / 2;
  const localX = (nose.x - faceCenterX) / faceWidth;
  const localY = (nose.y - faceCenterY) / faceHeight;
  const pose = estimateHeadPose({
    transform,
    localX,
    localY,
    faceWidth,
    faceHeight,
    top,
    bottom,
    left,
    right,
  });

  applyFaceTracking({
    x: nose.x,
    y: nose.y,
    localX,
    localY,
    poseX: pose?.x ?? null,
    poseY: pose?.y ?? null,
    poseMode: pose?.mode ?? "",
    width: faceWidth,
    height: faceHeight,
    mode: "Face",
  });
}

function estimateHeadPose({ transform }) {
  const matrix = readTransformMatrix(transform);
  const pose = matrix ? eulerFromMatrix(matrix, false) || eulerFromMatrix(matrix, true) : null;
  if (!pose) return null;

  return {
    x: clamp(pose.yaw / 90, -1, 1),
    y: clamp(pose.pitch / 90, -1, 1),
    mode: "Pose",
  };
}

function readTransformMatrix(transform) {
  if (!transform) return null;
  const candidates = [
    transform.data,
    transform.matrix,
    transform.packedData,
    transform.packedDataList,
    transform,
  ];

  if (typeof transform.getAsFloat32Array === "function") {
    candidates.unshift(transform.getAsFloat32Array());
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate === "function") continue;
    const data = Array.from(candidate);
    if (data.length >= 16 && data.every(Number.isFinite)) return data;
  }

  return null;
}

function eulerFromMatrix(matrix, columnMajor) {
  const at = (row, col) => matrix[columnMajor ? col * 4 + row : row * 4 + col];
  const r02 = at(0, 2);
  const r22 = at(2, 2);
  const r12 = at(1, 2);
  const r10 = at(1, 0);
  const r11 = at(1, 1);
  if (![r02, r22, r12, r10, r11].every(Number.isFinite)) return null;

  return {
    yaw: (Math.atan2(r02, r22) * 180) / Math.PI,
    pitch: (Math.atan2(-r12, Math.hypot(r10, r11)) * 180) / Math.PI,
  };
}

function runBlazeFaceTracker(video, now) {
  if (state.camera.blazeRunning || now - state.camera.lastBlazeAt < 110) return;

  state.camera.blazeRunning = true;
  state.camera.lastBlazeAt = now;
  state.camera.blazeModel
    .estimateFaces(video, false)
    .then((predictions) => {
      const face = predictions?.[0];
      if (!face) {
        markFaceMissing(performance.now());
        return;
      }

      const width = video.videoWidth || 1;
      const height = video.videoHeight || 1;
      const topLeft = face.topLeft || [0, 0];
      const bottomRight = face.bottomRight || [width, height];
      const nose = face.landmarks?.[2] || [
        (topLeft[0] + bottomRight[0]) / 2,
        (topLeft[1] + bottomRight[1]) / 2,
      ];

      applyFaceTracking({
        x: nose[0] / width,
        y: nose[1] / height,
        width: Math.max(0.001, (bottomRight[0] - topLeft[0]) / width),
        height: Math.max(0.001, (bottomRight[1] - topLeft[1]) / height),
        mode: "Backup",
      });
    })
    .catch(() => {
      state.camera.trackerNote = state.camera.landmarker ? "Tracker ready." : "Backup tracker paused.";
    })
    .finally(() => {
      state.camera.blazeRunning = false;
      renderCameraReadout();
    });
}

function markFaceMissing(now) {
  if (!hasCameraTracker()) return;
  if (now - state.camera.lastSeenAt < 750) return;

  state.camera.seen = false;
  state.camera.direction = "center";
  state.camera.confidence = 0;
  state.camera.trackingMode = "";
  state.camera.smoothDx = 0;
  state.camera.smoothDy = 0;
  updateAvatarMotion("center", 0, 0);
  renderCameraReadout();
}

function applyFaceTracking({ x, y, localX = null, localY = null, poseX = null, poseY = null, poseMode = "", width, height, mode }) {
  state.camera.noseX = x;
  state.camera.noseY = y;
  state.camera.localX = localX ?? x;
  state.camera.localY = localY ?? y;
  state.camera.usesLocalTracking = localX !== null && localY !== null;
  state.camera.poseX = poseX ?? state.camera.localX;
  state.camera.poseY = poseY ?? state.camera.localY;
  state.camera.usesPoseTracking = poseX !== null && poseY !== null;
  state.camera.faceWidth = width;
  state.camera.faceHeight = height;
  state.camera.seen = true;
  state.camera.lastSeenAt = performance.now();
  state.camera.trackingMode = poseMode || mode;
  state.camera.trackerNote = `${state.camera.trackingMode} tracking.`;

  if (
    !state.camera.baseline ||
    state.camera.baseline.usesLocal !== state.camera.usesLocalTracking ||
    state.camera.baseline.usesPose !== state.camera.usesPoseTracking
  ) {
    calibrateCamera();
  }

  const usesPose = state.camera.usesPoseTracking;
  const usesLocal = state.camera.usesLocalTracking;
  const liveX = usesPose ? state.camera.poseX : usesLocal ? state.camera.localX : x;
  const liveY = usesPose ? state.camera.poseY : usesLocal ? state.camera.localY : y;
  const baseX = usesPose ? state.camera.baseline.poseX : usesLocal ? state.camera.baseline.localX : state.camera.baseline.x;
  const baseY = usesPose ? state.camera.baseline.poseY : usesLocal ? state.camera.baseline.localY : state.camera.baseline.y;
  const scaleX = usesPose || usesLocal ? 1 : state.camera.baseline.width;
  const scaleY = usesPose || usesLocal ? 1 : state.camera.baseline.height;
  let rawX = (liveX - baseX) / scaleX;
  let rawY = (liveY - baseY) / scaleY;

  if (usesPose && usesLocal) {
    rawX = alignPoseSignal(rawX, state.camera.localX - state.camera.baseline.localX, "x");
    rawY = alignPoseSignal(rawY, state.camera.localY - state.camera.baseline.localY, "y");
  }

  const dxRaw = -rawX;
  const dyRaw = rawY;
  const dx = smoothHeadAxis("x", shapeHeadAxis(dxRaw, usesPose ? 1.18 : usesLocal ? 8.4 : 2.25));
  const dy = smoothHeadAxis("y", shapeHeadAxis(dyRaw, usesPose ? 1.16 : usesLocal ? 7.8 : 2.15));
  const threshold = 0.24;
  let direction = "center";
  let confidence = 0;

  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
    direction = dx > 0 ? "right" : "left";
    confidence = Math.min(1, Math.abs(dx) / 0.72);
  } else if (Math.abs(dy) > threshold) {
    direction = dy > 0 ? "down" : "up";
    confidence = Math.min(1, Math.abs(dy) / 0.68);
  }

  state.camera.dx = clamp(dx, -1, 1);
  state.camera.dy = clamp(dy, -1, 1);
  state.camera.direction = direction;
  state.camera.confidence = confidence;
  state.choices.looker = direction === "center" ? null : direction;
  updateAvatarMotion(direction, state.camera.dx, state.camera.dy);
  renderCameraReadout();
  handleCameraDirection(direction, "looker");
}

function hasCameraTracker(role = activeCameraRole()) {
  if (role === "pointer") return Boolean(state.camera.handLandmarker);
  if (role === "looker") return Boolean(state.camera.landmarker || state.camera.blazeModel);
  return Boolean(state.camera.handLandmarker || state.camera.landmarker || state.camera.blazeModel);
}

function alignPoseSignal(poseRaw, localRaw, axis) {
  const localNoiseFloor = axis === "x" ? 0.008 : 0.007;
  if (Math.abs(localRaw) <= localNoiseFloor) return poseRaw;
  const localBoost = localRaw * (axis === "x" ? 6.8 : 7.2);
  const signedPose = Math.sign(localRaw) * Math.abs(poseRaw);
  return Math.abs(localBoost) > Math.abs(signedPose) * 1.15 ? localBoost : signedPose;
}

function shapeHeadAxis(value, sensitivity) {
  const deadzone = 0.018;
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const normalized = (magnitude - deadzone) * sensitivity;
  return Math.sign(value) * clamp(normalized, 0, 1);
}

function smoothHeadAxis(axis, next) {
  const key = axis === "x" ? "smoothDx" : "smoothDy";
  const previous = state.camera[key] || 0;
  const delta = Math.abs(next - previous);
  const alpha = delta > 0.42 ? 0.58 : delta > 0.16 ? 0.42 : delta > 0.05 ? 0.3 : 0.18;
  const smoothed = Math.abs(next) < 0.02 && Math.abs(previous) < 0.06 ? 0 : previous + (next - previous) * alpha;
  state.camera[key] = smoothed;
  return smoothed;
}

function updateAvatarMotion(direction, dx, dy) {
  const headX = clamp(dx, -1, 1);
  const headY = clamp(dy, -1, 1);
  const yaw = headX * 90;
  const pitch = -headY * 86;
  const compressionX = 1 - Math.abs(headX) * 0.34;
  const compressionY = 1 - Math.abs(headY) * 0.1;
  document.documentElement.style.setProperty("--avatar-head-x", `${headX * 58}px`);
  document.documentElement.style.setProperty("--avatar-head-y", `${headY * 52}px`);
  document.documentElement.style.setProperty("--avatar-yaw", `${yaw}deg`);
  document.documentElement.style.setProperty("--avatar-pitch", `${pitch}deg`);
  document.documentElement.style.setProperty("--avatar-tilt", `${headX * 8}deg`);
  document.documentElement.style.setProperty("--avatar-scale-x", `${compressionX}`);
  document.documentElement.style.setProperty("--avatar-scale-y", `${compressionY}`);
  document.documentElement.style.setProperty("--avatar-x", `${headX * 54}px`);
  document.documentElement.style.setProperty("--avatar-y", `${headY * 50}px`);
  document.body.dataset.lookDirection = direction;
}

function drawFaceOverlay(landmarks) {
  const canvas = els.overlay;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;

  const points = [1, 10, 152, 234, 454]
    .map((index) => landmarks[index])
    .filter(Boolean)
    .map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));

  ctx.fillStyle = "rgba(242, 181, 68, 0.92)";
  ctx.strokeStyle = "#161616";
  ctx.lineWidth = 3 * dpr;
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function handleCameraDirection(direction, role = "looker") {
  if (direction === "center" || state.phase === "reveal") {
    clearCameraLock(role);
    return;
  }

  if (!shouldCameraSubmit(role)) return;
  const pendingKey = role === "pointer" ? "pointerPendingDirection" : "pendingDirection";
  const timerKey = role === "pointer" ? "pointerLockTimer" : "lockTimer";
  if (state.camera[pendingKey] === direction && state.camera[timerKey]) return;

  clearCameraLock(role);
  state.camera[pendingKey] = direction;
  state.camera[timerKey] = window.setTimeout(() => {
    const currentDirection = role === "pointer" ? state.camera.handDirection : state.camera.direction;
    if (currentDirection !== direction) return;
    if (!shouldCameraSubmit(role)) return;
    submitCameraDirection(direction, role);
    clearCameraLock(role);
  }, 420);
}

function shouldCameraSubmit(role = "looker") {
  if (!isPhoneRuntime()) return false;
  if (!state.camera.ready) return false;
  if (role === "looker" && !state.camera.seen) return false;
  if (role === "pointer" && !state.camera.handSeen) return false;
  if (state.mode === "online") {
    return (
      state.online.ready &&
      state.online.role === role &&
      !state.online.submitted[role]
    );
  }
  if (state.mode === "ai") {
    return state.ai.humanRole === role && !state.ai.thinking;
  }
  return false;
}

function submitCameraDirection(direction, role = "looker") {
  if (state.mode === "online") {
    state.choices[role] = direction;
    state.online.submitted[role] = true;
    sendOnline({ type: "submit", direction });
    render();
  }
  if (state.mode === "ai" && role === "looker") {
    playAiLookRound(direction);
  }
  if (state.mode === "ai" && role === "pointer") {
    playAiRound(direction);
  }
}

function clearCameraLock(role = "all") {
  if (role === "looker" || role === "all") {
    window.clearTimeout(state.camera.lockTimer);
    state.camera.lockTimer = 0;
    state.camera.pendingDirection = "center";
  }
  if (role === "pointer" || role === "all") {
    window.clearTimeout(state.camera.pointerLockTimer);
    state.camera.pointerLockTimer = 0;
    state.camera.pointerPendingDirection = "center";
  }
}

function render() {
  updateRuntimeClasses();

  els.modeButtons.forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.setAttribute("aria-selected", String(selected));
  });

  els.panels.forEach((panel) => {
    const cameraLooker = panel.dataset.panel === "camera" && shouldShowCameraPanel();
    panel.classList.toggle("is-active", panel.dataset.panel === state.mode || cameraLooker);
  });

  els.scorePointer.textContent = state.scores.pointer;
  els.scoreLooker.textContent = state.scores.looker;
  els.statusLabel.textContent = `Round ${state.roundNumber}`;
  els.title.textContent = state.phase === "reveal" ? state.message : modeTitle();
  els.controlKicker.textContent = modeKicker();
  els.controlTitle.textContent = modeControlTitle();

  els.choicePointer.textContent = state.choices.pointer
    ? DIRECTION_LABELS[state.choices.pointer]
    : "Waiting";
  els.choiceLooker.textContent = state.choices.looker ? DIRECTION_LABELS[state.choices.looker] : "Waiting";
  els.resultPointer.innerHTML = directionIcon(state.choices.pointer) || icon("pointer");
  els.resultLooker.innerHTML = directionIcon(state.choices.looker) || icon("face");

  const shownDirection = DIRECTIONS.includes(state.choices.pointer)
    ? state.choices.pointer
    : state.phase === "reveal"
      ? state.lastRound?.pointer
      : null;
  els.arrow.dataset.dir = shownDirection || "up";
  els.arrow.classList.toggle("is-visible", Boolean(shownDirection));

  updatePadStates();
  renderOnline();
  renderAi();
  updateLog();
  renderRounds();
  renderCameraReadout();
  renderMenuToggle();
}

function updateRuntimeClasses() {
  const phone = isPhoneRuntime();
  const onlineReady = state.mode === "online" && state.online.ready;
  const looker = shouldShowCameraPanel();
  const pointerActive =
    (state.mode === "online" && state.online.ready && state.online.role === "pointer") ||
    (state.mode === "ai" && state.ai.humanRole === "pointer");
  document.body.classList.toggle("is-desktop-locked", !phone);
  document.body.classList.toggle("is-phone-runtime", phone);
  document.body.classList.toggle("is-room-ready", onlineReady);
  document.body.classList.toggle("is-camera-looker", looker);
  document.body.classList.toggle("is-camera-ready", state.camera.ready);
  document.body.classList.toggle("is-looker-role", looker);
  document.body.classList.toggle("is-pointer-role", pointerActive);
  document.body.classList.toggle("is-pointer-gesture", isPointerGestureActive());
  document.body.classList.toggle("is-controls-needed", shouldShowPhoneControls());
  document.body.classList.toggle("is-menu-open", phone && state.ui.menuOpen);
  document.body.classList.toggle("is-online-mode", state.mode === "online");
  document.body.classList.toggle("is-ai-mode", state.mode === "ai");
  document.body.classList.toggle("is-reveal", state.phase === "reveal");
  if (els.phoneUrl) els.phoneUrl.textContent = window.location.href.replace("localhost", window.location.hostname);
}

function shouldShowCameraPanel() {
  return Boolean(activeCameraRole());
}

function activeCameraRole() {
  if (state.mode === "online") return state.online.role;
  if (state.mode === "ai") return state.ai.humanRole;
  return null;
}

function shouldTrackLooker() {
  return (
    state.camera.ready &&
    ((state.mode === "online" && state.online.role === "looker") ||
      (state.mode === "ai" && state.ai.humanRole === "looker"))
  );
}

function shouldTrackPointer() {
  return (
    state.camera.ready &&
    ((state.mode === "online" && state.online.ready && state.online.role === "pointer") ||
      (state.mode === "ai" && state.ai.humanRole === "pointer"))
  );
}

function isPointerGestureActive() {
  return (
    (state.mode === "online" && state.online.role === "pointer") ||
    (state.mode === "ai" && state.ai.humanRole === "pointer")
  );
}

function shouldShowPhoneControls() {
  if (!isPhoneRuntime()) return true;

  if (state.mode === "online") {
    if (!state.online.roomCode || !state.online.ready || !state.online.role) return true;
    return !state.camera.ready;
  }

  if (state.mode === "ai") {
    return !state.camera.ready;
  }

  return true;
}

function renderMenuToggle() {
  if (!els.menuToggle) return;
  const open = state.ui.menuOpen;
  els.menuToggle.setAttribute("aria-expanded", String(open));
  els.menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  els.menuToggle.title = open ? "Close" : "Menu";
  els.menuToggle.innerHTML = open ? icon("close") : icon("menu");
}

function modeKicker() {
  if (state.mode === "camera") return "Camera match";
  if (state.mode === "online") return "Phone room";
  if (state.mode === "ai") return "Computer match";
  return "Local match";
}

function modeControlTitle() {
  if (state.mode === "camera") return "Swipe against the camera";
  if (state.mode === "online") return state.online.role === "looker" ? "Dodge the pointed direction" : "Point and try to catch them";
  if (state.mode === "ai") return state.ai.humanRole === "pointer" ? "Point and try to catch them" : "Dodge the pointed direction";
  return "Two swipes decide the round";
}

function modeTitle() {
  if (state.mode === "camera") {
    if (state.camera.loading) return "Camera waking up.";
    if (!state.camera.ready) return "Camera duel.";
    if (!state.camera.seen) return "Find a face.";
    return state.camera.direction === "center" ? "Hold center." : `${DIRECTION_LABELS[state.camera.direction]}.`;
  }
  if (state.mode === "online") {
    if (!state.online.connected) return "Make a room.";
    if (!state.online.roomCode) return "Create or join.";
    if (!state.online.ready) return "Waiting for player two.";
    if (!state.camera.ready) return "Start your camera.";
    if (state.online.role === "pointer" && !hasCameraTracker("pointer")) return state.camera.trackerNote || "Loading hand tracker.";
    if (state.online.role === "looker" && !hasCameraTracker("looker")) return state.camera.trackerNote || "Loading face tracker.";
    if (state.online.role === "pointer" && !state.camera.handSeen) return "Show your pointing hand.";
    if (state.online.role === "looker" && !state.camera.seen) return "Find your face.";
    if (state.online.submitted[state.online.role]) return "Locked in.";
    return state.online.role === "looker"
      ? "Dodge the point."
      : state.camera.handDirection === "center"
        ? "Point to catch them."
        : `Hold ${DIRECTION_LABELS[state.camera.handDirection]}.`;
  }
  if (state.mode === "ai") {
    if (state.ai.thinking) return "Computer thinking.";
    if (!state.camera.ready) return "Start your camera.";
    if (state.ai.humanRole === "pointer" && !hasCameraTracker("pointer")) return state.camera.trackerNote || "Loading hand tracker.";
    if (state.ai.humanRole === "looker" && !hasCameraTracker("looker")) return state.camera.trackerNote || "Loading face tracker.";
    if (state.ai.humanRole === "pointer" && !state.camera.handSeen) return "Show your pointing hand.";
    if (state.ai.humanRole === "looker" && !state.camera.seen) return "Find your face.";
    return state.ai.humanRole === "pointer"
      ? state.camera.handDirection === "center"
        ? "Point to catch them."
        : `Hold ${DIRECTION_LABELS[state.camera.handDirection]}.`
      : "Dodge the point.";
  }
  if (state.choices.pointer && !state.choices.looker) return "Looker turn.";
  if (!state.choices.pointer && state.choices.looker) return "Pointer turn.";
  return "Point. Dodge. Don't match.";
}

function updatePadStates() {
  document.querySelectorAll("[data-swipe-pad]").forEach((pad) => {
    let role = pad.dataset.swipePad === "camera-pointer" ? "pointer" : pad.dataset.swipePad;
    if (role === "online-player") role = state.online.role;
    if (role === "ai-player") role = state.ai.humanRole;
    pad.classList.toggle("is-locked", Boolean(role && state.choices[role]));
  });
}

function renderOnline() {
  els.onlineStatus.textContent = state.online.status;
  els.roomDisplay.textContent = state.online.roomCode || "----";
  if (state.online.roomCode && els.roomCodeInput.value !== state.online.roomCode) {
    els.roomCodeInput.value = state.online.roomCode;
  }
  els.onlineRole.textContent = state.online.role ? `You: ${DIRECTION_LABELS[state.online.role]}` : "You";
  els.onlineReady.textContent = state.online.ready ? "Ready" : "Waiting";
  els.onlinePadRole.textContent = state.online.role ? `You ${roleVerb(state.online.role)}` : "Your move";
  els.onlineChoiceState.textContent = onlineChoiceState();
  els.onlinePlayer.classList.toggle("is-hidden", state.online.role === "looker");
  updateSlot(els.slotPointer, state.online.players.pointer, state.online.role === "pointer");
  updateSlot(els.slotLooker, state.online.players.looker, state.online.role === "looker");
}

function onlineChoiceState() {
  if (!state.online.roomCode) return "Join a room";
  if (!state.online.ready) return "Need player two";
  if (!state.camera.ready) return "Start camera";
  if (state.online.submitted[state.online.role]) return "Locked";
  if (state.online.role === "looker") return "Dodge point";
  return "Point to catch";
}

function updateSlot(el, occupied, isYou) {
  el.classList.toggle("is-filled", occupied);
  el.classList.toggle("is-you", isYou);
  el.querySelector("strong").textContent = occupied ? (isYou ? "You" : "Joined") : "Open";
}

function renderAi() {
  els.aiRoleButtons.forEach((button) => {
    const active = button.dataset.aiRole === state.ai.humanRole;
    button.setAttribute("aria-pressed", String(active));
  });
  const computerRole = otherRole(state.ai.humanRole);
  els.aiStatus.textContent = state.ai.thinking ? "Thinking" : "Ready";
  els.aiHumanLabel.textContent = `You: ${DIRECTION_LABELS[state.ai.humanRole]}`;
  els.aiOpponentLabel.textContent = `CPU ${roleVerb(computerRole)}`;
  els.aiPadRole.textContent = `You ${roleVerb(state.ai.humanRole)}`;
  els.aiChoiceState.textContent =
    !state.camera.ready
      ? "Start camera"
      : state.ai.humanRole === "looker"
        ? "Dodge point"
        : state.ai.thinking
          ? "CPU thinking"
          : "Point to catch";
  els.aiPlayer.classList.toggle("is-hidden", state.ai.humanRole === "looker");
}

function roleVerb(role) {
  return role === "pointer" ? "point" : "look";
}

function updateLog() {
  const leader =
    state.scores.pointer === state.scores.looker
      ? "Tied match."
      : state.scores.pointer > state.scores.looker
        ? "Pointer leads."
        : "Looker leads.";

  els.logTitle.textContent = state.lastRound
    ? state.lastRound.matched
      ? "Caught looking same way."
      : "Looker dodged it."
    : "First to five wins.";

  const point = state.lastRound
    ? `${DIRECTION_LABELS[state.lastRound.pointer]} vs ${DIRECTION_LABELS[state.lastRound.looker]}. ${leader}`
    : "Pointer scores by matching. Looker scores by dodging.";
  els.logLine.textContent = point;
}

function renderRounds() {
  const history = [];
  if (state.lastRound) history.push(state.lastRound);

  els.rounds.innerHTML = "";
  const totalDots = Math.max(5, Math.min(10, state.scores.pointer + state.scores.looker || 5));
  for (let i = 0; i < totalDots; i += 1) {
    const dot = document.createElement("span");
    dot.className = "round-dot";
    if (i < state.scores.pointer) dot.classList.add("is-pointer");
    if (i >= totalDots - state.scores.looker) dot.classList.add("is-looker");
    els.rounds.append(dot);
  }
}

function renderCameraReadout() {
  if (!els.trackingDirection) return;

  const role = activeCameraRole();
  if (state.phase !== "reveal") els.title.textContent = modeTitle();
  els.cameraEmpty.style.display = state.camera.ready ? "none" : "grid";
  els.cameraButton.disabled = state.camera.loading;
  els.cameraButton.innerHTML = state.camera.loading
    ? `${icon("loader")}Loading`
    : state.camera.ready
      ? role === "looker"
        ? `${icon("crosshair")}Center`
        : `${icon("camera")}Ready`
      : `${icon("camera")}Start`;

  if (els.cameraRoleLabel) els.cameraRoleLabel.textContent = role === "pointer" ? "Pointer" : "Looker";
  if (els.trackingLabel) els.trackingLabel.textContent = role === "pointer" ? "Hand" : "Head";

  const direction =
    role === "pointer"
      ? state.camera.handSeen
        ? state.camera.handDirection
        : "none"
      : state.camera.seen
        ? state.camera.direction
        : "none";
  const label =
    state.camera.error ||
    (!hasCameraTracker(role) && state.camera.ready ? state.camera.trackerNote || "Loading tracker" : "") ||
    (role === "pointer" && state.camera.handSeen
      ? `${DIRECTION_LABELS[direction]} (Hand)`
      : "") ||
    (role === "looker" && state.camera.seen && state.camera.trackingMode
      ? `${DIRECTION_LABELS[direction]} (${state.camera.trackingMode})`
      : DIRECTION_LABELS[direction]);
  els.trackingDirection.innerHTML = `${directionIcon(direction) || icon(role === "pointer" ? "pointer" : "face")}${label}`;
  setMeter(els.meterX, role === "pointer" ? state.camera.handDx : state.camera.dx);
  setMeter(els.meterY, role === "pointer" ? state.camera.handDy : state.camera.dy);
}

function setMeter(el, value) {
  const pct = Math.min(50, Math.abs(value) * 170);
  el.classList.toggle("is-negative", value < 0);
  el.style.width = `${pct}%`;
}

function toast(message) {
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}

function randomDirection() {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function playerInput(role, label) {
  return `
    <section class="player-input">
      <header>
        <span class="role-pill">${label}</span>
        <span class="choice-state" data-choice-state="${role}"></span>
      </header>
      ${swipePad(role)}
    </section>
  `;
}

function swipePad(role) {
  return `
    <div class="swipe-pad gesture-surface" data-swipe-pad="${role}">
      <div class="gesture-compass" aria-hidden="true">
        <span class="gesture-arrow gesture-up">${directionIcon("up")}</span>
        <span class="gesture-arrow gesture-right">${directionIcon("right")}</span>
        <span class="gesture-core">${icon(centerIconName(role))}</span>
        <span class="gesture-arrow gesture-down">${directionIcon("down")}</span>
        <span class="gesture-arrow gesture-left">${directionIcon("left")}</span>
      </div>
      <strong>Swipe anywhere</strong>
      <span>Flick up, down, left, or right with your finger.</span>
    </div>
  `;
}

function centerIconName(role) {
  if (role === "looker") return "face";
  return "pointer";
}

function directionButton(direction, role, className, isCamera, isOnline, isAi) {
  let data = `data-role="${role}" data-direction="${direction}"`;
  if (isCamera) data = `data-camera-direction="${direction}"`;
  if (isOnline) data = `data-online-direction="${direction}"`;
  if (isAi) data = `data-ai-direction="${direction}"`;
  return `
    <button
      type="button"
      class="dir-button ${className}"
      ${data}
      title="${DIRECTION_LABELS[direction]}"
      aria-label="${DIRECTION_LABELS[direction]}"
    >
      ${directionIcon(direction)}
    </button>
  `;
}

function directionIcon(direction) {
  if (!direction || direction === "center" || direction === "none") return "";
  const rotation = {
    up: 0,
    right: 90,
    down: 180,
    left: 270,
  }[direction];
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g transform="rotate(${rotation} 16 16)">
        <path d="M16 4 27 16h-7v12h-8V16H5L16 4Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>
      </g>
    </svg>
  `;
}

function faceAsset() {
  return `
    <svg class="face-asset" viewBox="0 0 400 400" role="img" aria-label="Game face">
      <defs>
        <radialGradient id="avatarSkin" cx="46%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#bd7847"></stop>
          <stop offset="64%" stop-color="#9f6038"></stop>
          <stop offset="100%" stop-color="#7b452c"></stop>
        </radialGradient>
      </defs>
      <g class="avatar-head">
        <path class="face-shirt" d="M76 398c12-53 50-83 124-83s112 30 124 83H76Z"></path>
        <path class="face-neck" d="M154 296h92l15 61c-25 23-96 23-121 0l14-61Z"></path>
        <path class="face-shirt-trim" d="M138 328c21 31 103 31 124 0"></path>
        <ellipse class="face-ear" cx="81" cy="201" rx="27" ry="39"></ellipse>
        <ellipse class="face-ear" cx="319" cy="201" rx="27" ry="39"></ellipse>
        <path class="face-head" d="M91 180c0-77 41-125 109-125s109 48 109 125c0 96-45 154-109 154S91 276 91 180Z" fill="url(#avatarSkin)"></path>
        <path class="face-hair-shadow" d="M90 181c-5-52 8-89 39-112 25-18 59-26 99-21 37 5 65 20 79 46 12 23 13 53 6 88-29-22-61-30-97-29-40 1-84-3-126 28Z"></path>
        <path class="face-hair" d="M72 160c-3-46 10-82 38-108 26-24 62-35 108-32 46 3 82 19 101 49 18 28 18 65 4 103-29-16-61-21-96-18-38 3-75 0-109-9-19-5-34 0-46 15Z"></path>
        <path class="face-sideburn" d="M84 179c13 9 20 30 20 59 0 35 12 67 36 95-31-17-51-46-61-89-6-28-4-50 5-65Z"></path>
        <path class="face-sideburn" d="M316 179c-13 9-20 30-20 59 0 35-12 67-36 95 31-17 51-46 61-89 6-28 4-50-5-65Z"></path>
        <g class="face-look">
          <path class="face-cheek" d="M119 232c24 12 52 12 73 1"></path>
          <path class="face-cheek" d="M208 233c21 11 52 11 75-1"></path>
          <path class="face-brow" d="M121 168c21-14 49-15 68-3"></path>
          <path class="face-brow" d="M215 165c22-11 51-9 66 7"></path>
          <ellipse class="face-eye-white" cx="159" cy="201" rx="27" ry="24"></ellipse>
          <ellipse class="face-eye-white" cx="241" cy="201" rx="27" ry="24"></ellipse>
          <circle class="face-pupil" cx="162" cy="202" r="11"></circle>
          <circle class="face-pupil" cx="240" cy="202" r="11"></circle>
          <circle class="face-highlight" cx="166" cy="197" r="4"></circle>
          <circle class="face-highlight" cx="244" cy="197" r="4"></circle>
          <path class="face-nose-fill" d="M190 207c-16 20-22 42-11 56 11 14 42 15 56 1 13-13 4-36-15-57-8 6-20 6-30 0Z"></path>
          <path class="face-nose" d="M197 213c-7 18-10 32-1 42m21-8c10 2 18 0 23-6"></path>
          <path class="face-beard" d="M104 235c9 66 43 104 96 104s87-38 96-104c-16 38-42 56-96 56s-80-18-96-56Z"></path>
          <path class="face-mustache" d="M149 264c25-13 42-11 52 4 12-15 29-17 52-4"></path>
          <path class="face-smile-fill" d="M142 273c30 44 87 45 118 0-34 14-75 14-118 0Z"></path>
          <path class="face-teeth" d="M155 276c23 21 65 21 90 1-9 23-24 32-45 32-20 0-37-10-45-33Z"></path>
          <path class="face-mouth" d="M142 273c32 27 82 28 118 0"></path>
        </g>
      </g>
      <g data-direction-arrow class="direction-arrow" data-dir="up">
        <path class="arrow-fill" d="M200 24 250 79h-30v74h-40V79h-30l50-55Z"></path>
      </g>
    </svg>
  `;
}

function cameraAsset() {
  return `
    <svg viewBox="0 0 240 240" aria-hidden="true">
      <rect x="42" y="72" width="156" height="108" rx="18" class="lens"></rect>
      <circle cx="120" cy="126" r="34" fill="#161616" stroke="#fff" stroke-width="7"></circle>
      <circle cx="132" cy="114" r="9" class="spark"></circle>
      <path d="M81 72 99 48h42l18 24" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function icon(name) {
  const icons = {
    spark:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 21l-2.5-7.5L3 11l6.5-2.5L12 2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 21a6 6 0 0 1 12 0M15 17c2.9.2 5 1.7 6 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    phone:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 18.5h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bot:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="8" width="14" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8V4M9 4h6M8.5 13h.01M15.5 13h.01M9.5 17c1.6.8 3.4.8 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l2-3h4l2 3h4v11H4V8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    rotate:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 1 2.3 5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 18v-6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 12a7 7 0 0 0-12-5M5 12a7 7 0 0 0 12 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dice:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="15" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><circle cx="9" cy="15" r="1.4" fill="currentColor"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    door:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M7 21V4h10v17M13 12h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    link:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.2l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.2l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plug:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pointer:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3v10l3-2 4 5-3 3-4-5-2 4-3-15h5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    face:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 10h.01M15 10h.01M9 15c1.8 1.4 4.2 1.4 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bolt:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h6l-1 8 9-13h-6l0-7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    loader:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    crosshair:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    menu:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  return icons[name] || "";
}
