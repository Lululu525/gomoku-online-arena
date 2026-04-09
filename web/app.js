const isRoomPage = window.location.pathname.includes('room.html');

const BOARD_SIZE = 15;
const CELL = 48;
const OFFSET = 24;
const AVATAR_IDS = ['rabbit', 'fox', 'cat', 'dog', 'bear', 'koala', 'panda', 'owl', 'penguin', 'hamster'];
const DEFAULT_AVATAR_ID = 'dog';
const AVATAR_NAMES = {
  rabbit: '兔子',
  fox: '狐狸',
  cat: '貓咪',
  dog: '狗',
  bear: '熊',
  koala: '無尾熊',
  panda: '熊貓',
  owl: '貓頭鷹',
  penguin: '企鵝',
  hamster: '倉鼠'
};

let snapshot = null;
let hoverPoint = null;
let modalState = { key: '' };
let replayTimer = null;
let replayIndex = 0;
let replayMoves = [];
let isReplaying = false;
let statusPollTimer = null;
let shownResultKey = '';
let lastLeaveMessage = '';
let audioContext = null;
let backgroundAudio = null;
let bgmEnabled = true;
let sfxEnabled = true;
let bgmVolume = 0.45;
let sfxVolume = 0.82;
let audioUnlocked = false;
let didPlayResultSound = false;
let aiTurnTimer = null;
let aiMoveTimer = null;
let replayRestoreSnapshot = null;
const isAiMode = new URLSearchParams(window.location.search).get('mode') === 'ai';
let lastUiHoverSoundAt = 0;
let noiseBuffer = null;

function qs(id) {
  return document.getElementById(id);
}



const STORAGE_KEYS = {
  bgmEnabled: 'gomoku_bgm_enabled',
  sfxEnabled: 'gomoku_sfx_enabled',
  bgmVolume: 'gomoku_bgm_volume',
  sfxVolume: 'gomoku_sfx_volume'
};

function loadSoundSettings() {
  const storedBgmEnabled = localStorage.getItem(STORAGE_KEYS.bgmEnabled);
  const storedSfxEnabled = localStorage.getItem(STORAGE_KEYS.sfxEnabled);
  const storedBgmVolume = localStorage.getItem(STORAGE_KEYS.bgmVolume);
  const storedSfxVolume = localStorage.getItem(STORAGE_KEYS.sfxVolume);

  bgmEnabled = storedBgmEnabled === null ? true : storedBgmEnabled === 'true';
  sfxEnabled = storedSfxEnabled === null ? true : storedSfxEnabled === 'true';

  bgmVolume = storedBgmVolume === null ? 0.45 : Math.max(0, Math.min(1, Number(storedBgmVolume)));
  sfxVolume = storedSfxVolume === null ? 0.82 : Math.max(0, Math.min(1, Number(storedSfxVolume)));

  if (Number.isNaN(bgmVolume)) {
    bgmVolume = 0.45;
  }

  if (Number.isNaN(sfxVolume)) {
    sfxVolume = 0.82;
  }
}

function persistSoundSettings() {
  localStorage.setItem(STORAGE_KEYS.bgmEnabled, String(bgmEnabled));
  localStorage.setItem(STORAGE_KEYS.sfxEnabled, String(sfxEnabled));
  localStorage.setItem(STORAGE_KEYS.bgmVolume, String(bgmVolume));
  localStorage.setItem(STORAGE_KEYS.sfxVolume, String(sfxVolume));
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  return audioContext;
}

function getNoiseBuffer() {
  const context = ensureAudioContext();

  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) {
    return noiseBuffer;
  }

  const length = Math.max(1, Math.floor(context.sampleRate * 0.25));
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const channelData = noiseBuffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    channelData[index] = Math.random() * 2 - 1;
  }

  return noiseBuffer;
}

function getBackgroundAudio() {
  if (!backgroundAudio) {
    backgroundAudio = new Audio('./assets/audio/Gomokugame.mp3');
    backgroundAudio.loop = true;
    backgroundAudio.preload = 'auto';
  }

  backgroundAudio.volume = bgmVolume;
  backgroundAudio.muted = !bgmEnabled;
  return backgroundAudio;
}

async function unlockAudio() {
  if (audioUnlocked) {
    return;
  }

  const context = ensureAudioContext();

  if (context.state === 'suspended') {
    await context.resume();
  }

  audioUnlocked = true;

  if (bgmEnabled) {
    startBackgroundMusic();
  }
}

function scheduleTone(frequency, duration, delay = 0, type = 'sine', gainValue = 0.08) {
  if (!sfxEnabled) {
    return;
  }

  const context = ensureAudioContext();

  if (context.state === 'suspended') {
    return;
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const volume = Math.max(0.0001, sfxVolume * gainValue);
  const startTime = context.currentTime + delay;
  const endTime = startTime + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
}

function playButtonSound() {
  if (!sfxEnabled) {
    return;
  }

  scheduleTone(860, 0.05, 0, 'triangle', 0.11);
  scheduleTone(1180, 0.032, 0.026, 'sine', 0.065);
}

function playHoverSound() {
  if (!sfxEnabled) {
    return;
  }

  const now = performance.now();

  if (now - lastUiHoverSoundAt < 70) {
    return;
  }

  lastUiHoverSoundAt = now;
  scheduleTone(980, 0.03, 0, 'sine', 0.05);
  scheduleTone(1380, 0.022, 0.015, 'triangle', 0.028);
}

function playMoveSound() {
  if (!sfxEnabled) {
    return;
  }

  const context = ensureAudioContext();

  if (context.state === 'suspended') {
    return;
  }

  const startTime = context.currentTime;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, startTime);
  masterGain.gain.linearRampToValueAtTime(Math.max(0.0001, sfxVolume * 0.68), startTime + 0.004);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);
  masterGain.connect(context.destination);

  const attackNoise = context.createBufferSource();
  attackNoise.buffer = getNoiseBuffer();

  const attackFilter = context.createBiquadFilter();
  attackFilter.type = 'bandpass';
  attackFilter.frequency.setValueAtTime(2100, startTime);
  attackFilter.Q.setValueAtTime(1.3, startTime);

  const attackGain = context.createGain();
  attackGain.gain.setValueAtTime(0.0001, startTime);
  attackGain.gain.linearRampToValueAtTime(Math.max(0.0001, sfxVolume * 0.22), startTime + 0.002);
  attackGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.018);

  attackNoise.connect(attackFilter);
  attackFilter.connect(attackGain);
  attackGain.connect(masterGain);
  attackNoise.start(startTime);
  attackNoise.stop(startTime + 0.02);

  const knockOsc = context.createOscillator();
  knockOsc.type = 'triangle';
  knockOsc.frequency.setValueAtTime(310, startTime);
  knockOsc.frequency.exponentialRampToValueAtTime(165, startTime + 0.05);

  const knockGain = context.createGain();
  knockGain.gain.setValueAtTime(0.0001, startTime);
  knockGain.gain.linearRampToValueAtTime(Math.max(0.0001, sfxVolume * 0.34), startTime + 0.003);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);

  knockOsc.connect(knockGain);
  knockGain.connect(masterGain);
  knockOsc.start(startTime);
  knockOsc.stop(startTime + 0.065);

  const woodBodyOsc = context.createOscillator();
  woodBodyOsc.type = 'sine';
  woodBodyOsc.frequency.setValueAtTime(128, startTime + 0.002);
  woodBodyOsc.frequency.exponentialRampToValueAtTime(88, startTime + 0.10);

  const woodBodyGain = context.createGain();
  woodBodyGain.gain.setValueAtTime(0.0001, startTime);
  woodBodyGain.gain.linearRampToValueAtTime(Math.max(0.0001, sfxVolume * 0.27), startTime + 0.006);
  woodBodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.11);

  woodBodyOsc.connect(woodBodyGain);
  woodBodyGain.connect(masterGain);
  woodBodyOsc.start(startTime);
  woodBodyOsc.stop(startTime + 0.12);

  const stoneClickOsc = context.createOscillator();
  stoneClickOsc.type = 'triangle';
  stoneClickOsc.frequency.setValueAtTime(1750, startTime);
  stoneClickOsc.frequency.exponentialRampToValueAtTime(920, startTime + 0.018);

  const stoneClickGain = context.createGain();
  stoneClickGain.gain.setValueAtTime(0.0001, startTime);
  stoneClickGain.gain.linearRampToValueAtTime(Math.max(0.0001, sfxVolume * 0.12), startTime + 0.0015);
  stoneClickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.024);

  stoneClickOsc.connect(stoneClickGain);
  stoneClickGain.connect(masterGain);
  stoneClickOsc.start(startTime);
  stoneClickOsc.stop(startTime + 0.028);
}

function playWinSound() {
  scheduleTone(523.25, 0.18, 0.00, 'triangle', 0.075);
  scheduleTone(659.25, 0.18, 0.18, 'triangle', 0.075);
  scheduleTone(783.99, 0.30, 0.36, 'triangle', 0.085);
}

function stopBackgroundMusic() {
  if (!backgroundAudio) {
    return;
  }

  backgroundAudio.pause();
  backgroundAudio.currentTime = 0;
}

function startBackgroundMusic() {
  if (!bgmEnabled || !audioUnlocked) {
    return;
  }

  const audio = getBackgroundAudio();
  audio.volume = bgmVolume;
  audio.muted = !bgmEnabled;

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {});
  }
}

function applySoundSettingsToUI() {
  const bgmToggle = qs('bgmToggle');
  const sfxToggle = qs('sfxToggle');
  const bgmSlider = qs('bgmVolume');
  const sfxSlider = qs('sfxVolume');
  const bgmValue = qs('bgmVolumeValue');
  const sfxValue = qs('sfxVolumeValue');

  if (bgmToggle) {
    bgmToggle.checked = bgmEnabled;
  }

  if (sfxToggle) {
    sfxToggle.checked = sfxEnabled;
  }

  if (bgmSlider) {
    bgmSlider.value = String(Math.round(bgmVolume * 100));
  }

  if (sfxSlider) {
    sfxSlider.value = String(Math.round(sfxVolume * 100));
  }

  if (bgmValue) {
    bgmValue.textContent = `${Math.round(bgmVolume * 100)}%`;
  }

  if (sfxValue) {
    sfxValue.textContent = `${Math.round(sfxVolume * 100)}%`;
  }

  if (backgroundAudio) {
    backgroundAudio.volume = bgmVolume;
    backgroundAudio.muted = !bgmEnabled;
  }
}

function openSettingsModal() {
  qs('settingsOverlay')?.classList.remove('hidden');
  applySoundSettingsToUI();
}

function closeSettingsModal() {
  qs('settingsOverlay')?.classList.add('hidden');
}

function attachGlobalAudioHandlers() {
  document.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', async () => {
      await unlockAudio();
      playButtonSound();
    });
  });

  document.addEventListener('pointerdown', unlockAudio, { once: true });
}

function attachHoverSound(element) {
  if (!element) {
    return;
  }

  element.addEventListener('mouseenter', async () => {
    await unlockAudio().catch(() => {});
    playHoverSound();
  });
}

function avatarPath(avatarId) {
  return `./assets/avatars/${avatarId || DEFAULT_AVATAR_ID}.png`;
}

function showToast(message) {
  const toast = qs('toast');

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.remove('hidden');

  clearTimeout(showToast.timerId);
  showToast.timerId = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(params.entries());
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function getRoomTokenStorageKey(roomId) {
  return `gomoku_token_${roomId}`;
}

function getStoredToken(roomId) {
  return localStorage.getItem(getRoomTokenStorageKey(roomId)) || '';
}

function setStoredToken(roomId, token) {
  localStorage.setItem(getRoomTokenStorageKey(roomId), token);
}

function clearStoredToken(roomId) {
  localStorage.removeItem(getRoomTokenStorageKey(roomId));
}

function getAvatarStorageKey() {
  return 'gomoku_selected_avatar';
}

function getStoredAvatar() {
  return localStorage.getItem(getAvatarStorageKey()) || DEFAULT_AVATAR_ID;
}

function setStoredAvatar(avatarId) {
  localStorage.setItem(getAvatarStorageKey(), avatarId);
}


function getPlayerNameStorageKey() {
  return 'gomoku_player_name';
}

function getStoredPlayerName() {
  return localStorage.getItem(getPlayerNameStorageKey()) || 'Player A';
}

function setStoredPlayerName(name) {
  const safeName = (name || '').trim() || 'Player A';
  localStorage.setItem(getPlayerNameStorageKey(), safeName);
}

function updateAvatarPreview() {
  const avatarId = getStoredAvatar();
  const previewImage = qs('profileAvatarPreview');

  if (previewImage) {
    previewImage.src = avatarPath(avatarId);
    previewImage.alt = AVATAR_NAMES[avatarId] || '狗';
  }
}

function openAvatarModal() {
  const avatarModalGrid = qs('avatarModalGrid');
  const selectedAvatarId = getStoredAvatar();

  avatarModalGrid.innerHTML = '';

  AVATAR_IDS.forEach((avatarId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-option';

    if (avatarId === selectedAvatarId) {
      button.classList.add('selected');
    }

    const image = document.createElement('img');
    image.src = avatarPath(avatarId);
    image.alt = AVATAR_NAMES[avatarId] || avatarId;
    button.appendChild(image);

    button.addEventListener('click', () => {
      setStoredAvatar(avatarId);
      updateAvatarPreview();
      closeAvatarModal();
    });

    avatarModalGrid.appendChild(button);
  });

  qs('avatarOverlay').classList.remove('hidden');
}

function closeAvatarModal() {
  const overlay = qs('avatarOverlay');

  if (overlay) {
    overlay.classList.add('hidden');
  }
}

function openLobbyRulesModal() {
  qs('lobbyRulesOverlay')?.classList.remove('hidden');
}

function closeLobbyRulesModal() {
  qs('lobbyRulesOverlay')?.classList.add('hidden');
}

function getSelectedAvatar() {
  return getStoredAvatar();
}

function openJoinRoomModal() {
  qs('joinRoomOverlay')?.classList.remove('hidden');
}

function closeJoinRoomModal() {
  qs('joinRoomOverlay')?.classList.add('hidden');
}

async function confirmJoinRoom() {
  try {
    const roomId = qs('joinRoomId').value.trim();

    if (!roomId) {
      showToast('請先輸入 6 位房號');
      return;
    }

    const safePlayerName = qs('playerName').value.trim() || 'Player B';
    setStoredPlayerName(safePlayerName);

    const data = await postJson('/api/join_room', {
      roomId,
      playerName: safePlayerName,
      avatarId: getSelectedAvatar()
    });

    setStoredToken(data.roomId, data.playerToken);
    closeJoinRoomModal();
    window.location.href = `./room.html?roomId=${encodeURIComponent(data.roomId)}`;
  } catch (error) {
    showToast(error.message);
  }
}

function initLobbyPage() {
  const params = parseQuery();
  const timerToggle = qs('timerToggle');
  const timerOptionsBlock = qs('timerOptionsBlock');

  loadSoundSettings();
  applySoundSettingsToUI();
  attachGlobalAudioHandlers();
  updateAvatarPreview();
  qs('playerName').value = getStoredPlayerName();

  attachHoverSound(qs('profileAvatarButton'));
  attachHoverSound(qs('createBtn'));
  attachHoverSound(qs('joinBtn'));
  attachHoverSound(qs('aiBtn'));

  qs('profileAvatarButton').addEventListener('click', openAvatarModal);
  qs('avatarModalCloseBtn').addEventListener('click', closeAvatarModal);
  qs('avatarOverlay').addEventListener('click', (event) => {
    if (event.target === qs('avatarOverlay')) {
      closeAvatarModal();
    }
  });

  qs('showLobbyRulesBtn').addEventListener('click', openLobbyRulesModal);
  qs('showSettingsBtn')?.addEventListener('click', openSettingsModal);
  qs('settingsModalCloseBtn')?.addEventListener('click', closeSettingsModal);
  qs('closeSettingsBtn')?.addEventListener('click', closeSettingsModal);
  qs('settingsOverlay')?.addEventListener('click', (event) => {
    if (event.target === qs('settingsOverlay')) {
      closeSettingsModal();
    }
  });

  qs('bgmToggle')?.addEventListener('change', async () => {
    bgmEnabled = qs('bgmToggle').checked;
    persistSoundSettings();

    if (bgmEnabled) {
      await unlockAudio();
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }

    applySoundSettingsToUI();
  });

  qs('sfxToggle')?.addEventListener('change', () => {
    sfxEnabled = qs('sfxToggle').checked;
    persistSoundSettings();
    applySoundSettingsToUI();
  });

  qs('bgmVolume')?.addEventListener('input', () => {
    bgmVolume = Number(qs('bgmVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();

    if (bgmEnabled && audioUnlocked) {
      startBackgroundMusic();
    }
  });

  qs('sfxVolume')?.addEventListener('input', () => {
    sfxVolume = Number(qs('sfxVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();
  });
  qs('closeLobbyRulesBtn').addEventListener('click', closeLobbyRulesModal);
  qs('lobbyRulesOverlay').addEventListener('click', (event) => {
    if (event.target === qs('lobbyRulesOverlay')) {
      closeLobbyRulesModal();
    }
  });

  qs('joinBtn').addEventListener('click', openJoinRoomModal);
  qs('joinModalCloseBtn').addEventListener('click', closeJoinRoomModal);
  qs('confirmJoinBtn').addEventListener('click', confirmJoinRoom);
  qs('joinRoomOverlay').addEventListener('click', (event) => {
    if (event.target === qs('joinRoomOverlay')) {
      closeJoinRoomModal();
    }
  });

  timerToggle.addEventListener('change', () => {
    timerOptionsBlock.classList.toggle('hidden', !timerToggle.checked);
  });
  timerOptionsBlock.classList.toggle('hidden', !timerToggle.checked);

  if (params.roomId) {
    qs('joinRoomId').value = params.roomId;
    openJoinRoomModal();
  }


  qs('aiBtn')?.addEventListener('click', () => {
    const safePlayerName = qs('playerName').value.trim() || 'Player A';
    setStoredPlayerName(safePlayerName);

    const params = new URLSearchParams({
      mode: 'ai',
      timerEnabled: timerToggle.checked ? '1' : '0',
      turnSeconds: String(Number(qs('turnSeconds').value) || 15),
      undoEnabled: qs('undoToggle').checked ? '1' : '0',
      playerName: encodeURIComponent(safePlayerName)
    });

    window.location.href = `./room.html?${params.toString()}`;
  });

  qs('createBtn').addEventListener('click', async () => {
    try {
      const safePlayerName = qs('playerName').value.trim() || 'Player A';
      setStoredPlayerName(safePlayerName);

      const data = await postJson('/api/create_room', {
        playerName: safePlayerName,
        avatarId: getSelectedAvatar(),
        timerEnabled: timerToggle.checked,
        turnSeconds: Number(qs('turnSeconds').value),
        undoEnabled: qs('undoToggle').checked
      });

      setStoredToken(data.roomId, data.playerToken);
      window.location.href = `./room.html?roomId=${encodeURIComponent(data.roomId)}`;
    } catch (error) {
      showToast(error.message);
    }
  });
}


function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function findWinningLineOnBoard(board, specificColor = 0) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const color = board[row][col];

      if (!color || (specificColor && color !== specificColor)) {
        continue;
      }

      for (const [dr, dc] of directions) {
        const line = [[row, col]];

        for (let step = 1; step < 5; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;

          if (
            nextRow >= 0 && nextRow < BOARD_SIZE &&
            nextCol >= 0 && nextCol < BOARD_SIZE &&
            board[nextRow][nextCol] === color
          ) {
            line.push([nextRow, nextCol]);
          } else {
            break;
          }
        }

        if (line.length >= 5) {
          return line.slice(0, 5);
        }
      }
    }
  }

  return null;
}

function syncWinningLine() {
  if (!snapshot) {
    return;
  }

  if (snapshot.gameOver && snapshot.winner) {
    snapshot.winningLine = findWinningLineOnBoard(snapshot.board, snapshot.winner);
  } else {
    snapshot.winningLine = null;
  }
}

function drawWinningLine(context) {
  if (!snapshot?.winningLine || snapshot.winningLine.length < 2) {
    return;
  }

  const first = snapshot.winningLine[0];
  const last = snapshot.winningLine[snapshot.winningLine.length - 1];
  const x1 = OFFSET + first[1] * CELL;
  const y1 = OFFSET + first[0] * CELL;
  const x2 = OFFSET + last[1] * CELL;
  const y2 = OFFSET + last[0] * CELL;

  context.save();
  context.strokeStyle = 'rgba(255, 82, 82, 0.92)';
  context.lineWidth = 8;
  context.lineCap = 'round';
  context.shadowColor = 'rgba(255, 82, 82, 0.42)';
  context.shadowBlur = 12;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();

  context.lineWidth = 3;
  context.strokeStyle = '#ffd35a';
  snapshot.winningLine.forEach(([row, col]) => {
    context.beginPath();
    context.arc(OFFSET + col * CELL, OFFSET + row * CELL, 23, 0, Math.PI * 2);
    context.stroke();
  });
  context.restore();
}

function countDirection(board, row, col, dr, dc, color) {
  let count = 0;
  let nextRow = row + dr;
  let nextCol = col + dc;

  while (
    nextRow >= 0 && nextRow < BOARD_SIZE &&
    nextCol >= 0 && nextCol < BOARD_SIZE &&
    board[nextRow][nextCol] === color
  ) {
    count += 1;
    nextRow += dr;
    nextCol += dc;
  }

  const open = nextRow >= 0 && nextRow < BOARD_SIZE && nextCol >= 0 && nextCol < BOARD_SIZE && board[nextRow][nextCol] === 0;
  return { count, open };
}

function scoreMove(board, row, col, color) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let total = 0;

  for (const [dr, dc] of dirs) {
    const forward = countDirection(board, row, col, dr, dc, color);
    const backward = countDirection(board, row, col, -dr, -dc, color);
    const chain = forward.count + backward.count + 1;
    const openEnds = (forward.open ? 1 : 0) + (backward.open ? 1 : 0);

    if (chain >= 5) {
      total += 100000;
    } else if (chain === 4 && openEnds === 2) {
      total += 12000;
    } else if (chain === 4 && openEnds === 1) {
      total += 4000;
    } else if (chain === 3 && openEnds === 2) {
      total += 1400;
    } else if (chain === 3 && openEnds === 1) {
      total += 420;
    } else if (chain === 2 && openEnds === 2) {
      total += 150;
    } else if (chain === 2 && openEnds === 1) {
      total += 48;
    } else {
      total += chain * 10;
    }
  }

  const centerBias = 14 - (Math.abs(row - 7) + Math.abs(col - 7));
  return total + centerBias;
}

function getCandidateMoves(board) {
  const candidates = [];
  let hasStone = false;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] !== 0) {
        hasStone = true;
      }
    }
  }

  if (!hasStone) {
    return [{ row: 7, col: 7 }];
  }

  const used = new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (board[row][col] === 0) {
        continue;
      }

      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const nextRow = row + dr;
          const nextCol = col + dc;
          const key = `${nextRow},${nextCol}`;

          if (
            nextRow < 0 || nextRow >= BOARD_SIZE ||
            nextCol < 0 || nextCol >= BOARD_SIZE ||
            board[nextRow][nextCol] !== 0 ||
            used.has(key)
          ) {
            continue;
          }

          used.add(key);
          candidates.push({ row: nextRow, col: nextCol });
        }
      }
    }
  }

  return candidates;
}

function getBestAiMove(board) {
  const candidates = getCandidateMoves(board);

  for (const move of candidates) {
    board[move.row][move.col] = 2;
    const line = findWinningLineOnBoard(board, 2);
    board[move.row][move.col] = 0;

    if (line) {
      return move;
    }
  }

  for (const move of candidates) {
    board[move.row][move.col] = 1;
    const line = findWinningLineOnBoard(board, 1);
    board[move.row][move.col] = 0;

    if (line) {
      return move;
    }
  }

  let bestMove = candidates[0] || null;
  let bestScore = -Infinity;

  for (const move of candidates) {
    const attackScore = scoreMove(board, move.row, move.col, 2);
    const defenseScore = scoreMove(board, move.row, move.col, 1);
    const total = attackScore * 1.05 + defenseScore * 0.95;

    if (total > bestScore) {
      bestScore = total;
      bestMove = move;
    }
  }

  return bestMove;
}

function clearAiTimers() {
  if (aiTurnTimer) {
    clearInterval(aiTurnTimer);
    aiTurnTimer = null;
  }

  if (aiMoveTimer) {
    clearTimeout(aiMoveTimer);
    aiMoveTimer = null;
  }
}

function startAiTurnTimer() {
  clearAiTimers();

  if (!isAiMode || !snapshot || !snapshot.timerEnabled || snapshot.gameOver || isReplaying) {
    return;
  }

  snapshot.remainingSeconds = snapshot.turnSeconds;
  updateSidebar();

  aiTurnTimer = setInterval(() => {
    if (!snapshot || snapshot.gameOver || isReplaying) {
      clearAiTimers();
      return;
    }

    snapshot.remainingSeconds -= 1;

    if (snapshot.remainingSeconds <= 0) {
      clearAiTimers();

      if (snapshot.currentPlayer === 1) {
        snapshot.notice = '你超時了，輪到電腦。';
        snapshot.currentPlayer = 2;
        snapshot.canUndoForViewer = snapshot.undoEnabled && snapshot.history.length > 0;
        updateSidebar();
        drawBoard();
        scheduleAiMove();
        startAiTurnTimer();
      } else {
        snapshot.notice = '電腦思考超時，輪到你。';
        snapshot.currentPlayer = 1;
        snapshot.canUndoForViewer = snapshot.undoEnabled && snapshot.history.length > 0;
        updateSidebar();
        drawBoard();
        startAiTurnTimer();
      }

      return;
    }

    updateSidebar();
  }, 1000);
}

function finishLocalGame(winner, noticeText) {
  snapshot.gameOver = true;
  snapshot.winner = winner;
  snapshot.notice = noticeText;
  snapshot.replayAllowed = snapshot.history.length > 0;
  snapshot.canUndoForViewer = snapshot.undoEnabled && snapshot.history.length > 0;
  syncWinningLine();
  clearAiTimers();
  updateSidebar();
  drawBoard();
  showResultModal();
}

function applyLocalMove(row, col, color) {
  snapshot.board[row][col] = color;
  snapshot.lastMoveRow = row;
  snapshot.lastMoveCol = col;
  snapshot.history.push({ row, col, color });
  snapshot.replayAllowed = snapshot.history.length > 0;
  snapshot.canUndoForViewer = snapshot.undoEnabled && snapshot.history.length > 0;
  playMoveSound();

  const line = findWinningLineOnBoard(snapshot.board, color);

  if (line) {
    snapshot.winningLine = line;
    finishLocalGame(color, color === 1 ? '你獲勝了！' : '電腦獲勝！');
    return true;
  }

  if (snapshot.history.length >= BOARD_SIZE * BOARD_SIZE) {
    snapshot.gameOver = true;
    snapshot.winner = 0;
    snapshot.notice = '平手。';
    snapshot.winningLine = null;
    clearAiTimers();
    updateSidebar();
    drawBoard();
    return true;
  }

  snapshot.currentPlayer = color === 1 ? 2 : 1;
  snapshot.notice = color === 1 ? '電腦思考中...' : '輪到你。';
  snapshot.winningLine = null;
  updateSidebar();
  drawBoard();
  return false;
}

function scheduleAiMove() {
  if (!isAiMode || !snapshot || snapshot.gameOver || snapshot.currentPlayer !== 2 || isReplaying) {
    return;
  }

  if (aiMoveTimer) {
    clearTimeout(aiMoveTimer);
  }

  aiMoveTimer = setTimeout(() => {
    aiMoveTimer = null;

    if (!snapshot || snapshot.gameOver || snapshot.currentPlayer !== 2 || isReplaying) {
      return;
    }

    const move = getBestAiMove(snapshot.board.map((line) => [...line]));

    if (!move) {
      snapshot.gameOver = true;
      snapshot.notice = '平手。';
      updateSidebar();
      drawBoard();
      return;
    }

    const finished = applyLocalMove(move.row, move.col, 2);

    if (!finished) {
      if (snapshot.timerEnabled) {
        startAiTurnTimer();
      }
      updateSidebar();
      drawBoard();
    }
  }, 480);
}

function buildAiSnapshot(params) {
  const timerEnabled = params.timerEnabled === '1';
  const turnSeconds = Math.max(10, Number(params.turnSeconds) || 15);
  const undoEnabled = params.undoEnabled !== '0';
  const playerName = decodeURIComponent(params.playerName || getStoredPlayerName());

  return {
    roomId: 'AI',
    mode: 'ai',
    hasBlack: true,
    hasWhite: true,
    blackName: playerName,
    whiteName: '電腦',
    blackAvatarId: getStoredAvatar(),
    whiteAvatarId: 'owl',
    viewerColor: 1,
    currentPlayer: 1,
    notice: '輪到你先下。',
    timerEnabled,
    turnSeconds,
    remainingSeconds: turnSeconds,
    gameOver: false,
    winner: 0,
    board: createEmptyBoard(),
    history: [],
    lastMoveRow: -1,
    lastMoveCol: -1,
    undoEnabled,
    canUndoForViewer: false,
    replayAllowed: false,
    restartRequestedByBlack: false,
    restartRequestedByWhite: false,
    undoRequestedByBlack: false,
    undoRequestedByWhite: false,
    winningLine: null
  };
}

function resetAiGame(params = parseQuery()) {
  clearAiTimers();
  snapshot = buildAiSnapshot(params);
  didPlayResultSound = false;
  shownResultKey = '';
  closeResultModal();
  closeModal();
  updateSidebar();
  drawBoard();

  if (snapshot.timerEnabled) {
    startAiTurnTimer();
  }
}

function undoAiGame() {
  if (!snapshot || !snapshot.undoEnabled || !snapshot.history.length || isReplaying) {
    showToast('目前不能悔棋');
    return;
  }

  clearAiTimers();
  const removeCount = snapshot.history.length >= 2 ? 2 : 1;

  for (let i = 0; i < removeCount; i += 1) {
    const move = snapshot.history.pop();
    if (move) {
      snapshot.board[move.row][move.col] = 0;
    }
  }

  const last = snapshot.history[snapshot.history.length - 1];
  snapshot.lastMoveRow = last ? last.row : -1;
  snapshot.lastMoveCol = last ? last.col : -1;
  snapshot.gameOver = false;
  snapshot.winner = 0;
  snapshot.currentPlayer = 1;
  snapshot.notice = '已悔棋，輪到你。';
  snapshot.winningLine = null;
  snapshot.replayAllowed = snapshot.history.length > 0;
  snapshot.canUndoForViewer = snapshot.undoEnabled && snapshot.history.length > 0;
  didPlayResultSound = false;
  shownResultKey = '';
  closeResultModal();
  updateSidebar();
  drawBoard();

  if (snapshot.timerEnabled) {
    startAiTurnTimer();
  }
}

function initAiRoomPage() {
  const params = parseQuery();
  loadSoundSettings();
  attachGlobalAudioHandlers();
  resetAiGame(params);

  const roomTitle = document.querySelector('.room-header-row h1');
  if (roomTitle) {
    roomTitle.innerHTML = '對戰棋盤 <span class="ai-badge">AI</span>';
  }

  const roomModeText = qs('roomModeText');
  if (roomModeText) {
    roomModeText.textContent = '模式：與電腦對戰';
  }

  qs('copyRoomBtn')?.classList.add('hidden');
  qs('copyInviteBtn')?.classList.add('hidden');

  const canvas = qs('boardCanvas');

  canvas.addEventListener('mousemove', (event) => {
    hoverPoint = boardPointFromMouse(event);
    drawBoard();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverPoint = null;
    drawBoard();
  });

  canvas.addEventListener('click', async (event) => {
    await unlockAudio();

    if (!snapshot || isReplaying || snapshot.gameOver || snapshot.currentPlayer !== 1) {
      return;
    }

    const point = boardPointFromMouse(event);
    if (!point || snapshot.board[point.row][point.col]) {
      return;
    }

    clearAiTimers();
    const finished = applyLocalMove(point.row, point.col, 1);
    if (!finished) {
      if (snapshot.timerEnabled) {
        startAiTurnTimer();
      }
      scheduleAiMove();
    }
  });

  qs('showRoomSettingsBtn')?.addEventListener('click', openSettingsModal);
  qs('settingsModalCloseBtn')?.addEventListener('click', closeSettingsModal);
  qs('closeSettingsBtn')?.addEventListener('click', closeSettingsModal);
  qs('settingsOverlay')?.addEventListener('click', (event) => {
    if (event.target === qs('settingsOverlay')) {
      closeSettingsModal();
    }
  });

  qs('bgmToggle')?.addEventListener('change', async () => {
    bgmEnabled = qs('bgmToggle').checked;
    persistSoundSettings();

    if (bgmEnabled) {
      await unlockAudio();
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }

    applySoundSettingsToUI();
  });

  qs('sfxToggle')?.addEventListener('change', () => {https://lululu525.github.io/gomoku-online-arena/
    sfxEnabled = qs('sfxToggle').checked;
    persistSoundSettings();
    applySoundSettingsToUI();
  });

  qs('bgmVolume')?.addEventListener('input', () => {
    bgmVolume = Number(qs('bgmVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();
    if (bgmEnabled && audioUnlocked) {
      startBackgroundMusic();
    }
  });

  qs('sfxVolume')?.addEventListener('input', () => {
    sfxVolume = Number(qs('sfxVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();
  });

  qs('restartBtn').addEventListener('click', () => {
    resetAiGame(parseQuery());
    showToast('已重新開始');
  });

  qs('undoBtn').addEventListener('click', undoAiGame);
  qs('replayBtn').addEventListener('click', startReplay);

  qs('leaveBtn').addEventListener('click', () => {
    openModal(
      '確認離開',
      '你確定要返回大廳嗎？',
      [
        { text: '留在房間', className: 'ghost-btn' },
        { text: '確認離開', className: 'danger-btn', onClick: leaveRoom }
      ],
      'leave'
    );
  });

  qs('modalCloseBtn').addEventListener('click', closeModal);
  qs('modalOverlay').addEventListener('click', (event) => {
    if (event.target === qs('modalOverlay')) {
      closeModal();
    }
  });

  qs('closeRulesBtn').addEventListener('click', closeRulesModal);
  qs('rulesOverlay').addEventListener('click', (event) => {
    if (event.target === qs('rulesOverlay')) {
      closeRulesModal();
    }
  });

  qs('resultCloseBtn').addEventListener('click', closeResultModal);
  qs('resultOverlay').addEventListener('click', (event) => {
    if (event.target === qs('resultOverlay')) {
      closeResultModal();
    }
  });

  showRulesModalIfNeeded('AI_ROOM');
}

function getViewerColorText(viewerColor) {
  if (viewerColor === 1) {
    return '黑棋';
  }

  if (viewerColor === 2) {
    return '白棋';
  }

  return '觀察者';
}

function getCurrentTurnText(player) {
  return player === 1 ? '黑棋' : '白棋';
}

function getColorDot(color) {
  return color === 1 ? '●' : '○';
}

function drawBoard() {
  const canvas = qs('boardCanvas');

  if (!canvas || !snapshot) {
    return;
  }

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const position = OFFSET + index * CELL;
    context.strokeStyle = 'rgba(92, 61, 22, 0.55)';
    context.lineWidth = 1;

    context.beginPath();
    context.moveTo(OFFSET, position);
    context.lineTo(OFFSET + CELL * (BOARD_SIZE - 1), position);
    context.stroke();

    context.beginPath();
    context.moveTo(position, OFFSET);
    context.lineTo(position, OFFSET + CELL * (BOARD_SIZE - 1));
    context.stroke();
  }

  [3, 7, 11].forEach((row) => {
    [3, 7, 11].forEach((col) => {
      context.fillStyle = '#6e4a1f';
      context.beginPath();
      context.arc(OFFSET + col * CELL, OFFSET + row * CELL, 4.5, 0, Math.PI * 2);
      context.fill();
    });
  });

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const stone = snapshot.board[row][col];

      if (!stone) {
        continue;
      }

      const x = OFFSET + col * CELL;
      const y = OFFSET + row * CELL;

      context.beginPath();
      context.arc(x, y, 18, 0, Math.PI * 2);

      if (stone === 1) {
        const gradient = context.createRadialGradient(x - 6, y - 6, 4, x, y, 20);
        gradient.addColorStop(0, '#707070');
        gradient.addColorStop(1, '#101010');
        context.fillStyle = gradient;
      } else {
        const gradient = context.createRadialGradient(x - 6, y - 6, 4, x, y, 20);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#d4dae4');
        context.fillStyle = gradient;
      }

      context.fill();

      if (row === snapshot.lastMoveRow && col === snapshot.lastMoveCol) {
        context.strokeStyle = stone === 1 ? '#66f0cf' : '#3d8bff';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(x, y, 21, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  const canPreview = !isReplaying &&
    snapshot.viewerColor === snapshot.currentPlayer &&
    !snapshot.gameOver &&
    hoverPoint &&
    !snapshot.board[hoverPoint.row][hoverPoint.col];

  if (canPreview) {
    const x = OFFSET + hoverPoint.col * CELL;
    const y = OFFSET + hoverPoint.row * CELL;

    context.save();
    context.globalAlpha = 0.35;
    context.beginPath();
    context.arc(x, y, 18, 0, Math.PI * 2);
    context.fillStyle = snapshot.viewerColor === 1 ? '#111' : '#ffffff';
    context.fill();
    context.restore();
  }

  drawWinningLine(context);
}

function boardPointFromMouse(event) {
  const canvas = qs('boardCanvas');
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const col = Math.round((x - OFFSET) / CELL);
  const row = Math.round((y - OFFSET) / CELL);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  const pointX = OFFSET + col * CELL;
  const pointY = OFFSET + row * CELL;

  if (Math.abs(pointX - x) > 18 || Math.abs(pointY - y) > 18) {
    return null;
  }

  return { row, col };
}

function updateSidebar() {
  if (!snapshot) {
    return;
  }

  qs('roomIdText').textContent = `房號：${snapshot.roomId}`;
  if (qs('roomModeText')) {
    qs('roomModeText').textContent = snapshot.mode === 'ai' ? '模式：與電腦對戰' : '模式：線上雙人';
  }
  qs('blackPlayerName').textContent = snapshot.hasBlack ? snapshot.blackName : '等待玩家';
  qs('whitePlayerName').textContent = snapshot.hasWhite ? snapshot.whiteName : '等待玩家';
  qs('blackAvatarImg').src = avatarPath(snapshot.blackAvatarId);
  qs('whiteAvatarImg').src = avatarPath(snapshot.whiteAvatarId);

  qs('turnText').textContent = `輪到：${getCurrentTurnText(snapshot.currentPlayer)}`;
  qs('roleText').textContent = `你的身份：${getViewerColorText(snapshot.viewerColor)}`;
  qs('statusBanner').textContent = snapshot.notice || '等待中';

  const timerBar = qs('timerBar');

  if (snapshot.timerEnabled && !snapshot.gameOver) {
    qs('timerText').textContent = `本手倒數：${snapshot.remainingSeconds} / ${snapshot.turnSeconds} 秒`;
    const percent = Math.max(0, Math.min(100, (snapshot.remainingSeconds / snapshot.turnSeconds) * 100));
    timerBar.style.width = `${percent}%`;
    timerBar.className = 'progress-bar';

    if (percent <= 25) {
      timerBar.classList.add('danger');
    } else if (percent <= 50) {
      timerBar.classList.add('warn');
    }
  } else if (snapshot.timerEnabled && snapshot.gameOver) {
    qs('timerText').textContent = '本局已結束';
    timerBar.style.width = '100%';
    timerBar.className = 'progress-bar';
  } else {
    qs('timerText').textContent = snapshot.mode === 'ai' ? '本地模式未啟用計時' : '計時功能已關閉';
    timerBar.style.width = '100%';
    timerBar.className = 'progress-bar';
  }

  const historyBox = qs('moveHistory');
  historyBox.innerHTML = '';

  if (!snapshot.history.length) {
    historyBox.innerHTML = '<div class="history-item">尚未落子</div>';
  } else {
    [...snapshot.history].reverse().forEach((move, index) => {
      const actualStep = snapshot.history.length - index;
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = `${actualStep}. ${getColorDot(move.color)} (${move.row + 1}, ${move.col + 1})`;
      historyBox.appendChild(item);
    });
  }

  const canRequestRestart = !isReplaying && snapshot.history.length > 0;
  qs('restartBtn').disabled = !canRequestRestart;
  qs('undoBtn').disabled = isReplaying || !snapshot.undoEnabled || !snapshot.canUndoForViewer;
  qs('replayBtn').disabled = isReplaying || !snapshot.replayAllowed;
}

function openModal(title, message, actions = [], key = '') {
  modalState.key = key;
  qs('modalTitle').textContent = title;
  qs('modalMessage').textContent = message;

  const actionsBox = qs('modalActions');
  actionsBox.innerHTML = '';

  actions.forEach((action) => {
    const button = document.createElement('button');
    button.textContent = action.text;
    button.className = action.className || 'primary-btn';
    button.addEventListener('click', () => {
      closeModal();

      if (action.onClick) {
        action.onClick();
      }
    });
    actionsBox.appendChild(button);
  });

  qs('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  qs('modalOverlay').classList.add('hidden');
  modalState.key = '';
}

function showRulesModalIfNeeded(roomId) {
  const key = `gomoku_rules_seen_${roomId}`;

  if (sessionStorage.getItem(key) === '1') {
    return;
  }

  sessionStorage.setItem(key, '1');
  qs('rulesOverlay')?.classList.remove('hidden');
}

function closeRulesModal() {
  qs('rulesOverlay')?.classList.add('hidden');
}

function showResultModal() {
  if (!snapshot || !snapshot.gameOver || snapshot.winner === 0) {
    return;
  }

  const resultKey = `${snapshot.roomId}_${snapshot.winner}_${snapshot.history.length}`;

  if (shownResultKey === resultKey) {
    return;
  }

  shownResultKey = resultKey;

  if (!didPlayResultSound) {
    playWinSound();
    didPlayResultSound = true;
  }

  const viewerWins = snapshot.viewerColor === snapshot.winner;
  const winnerName = snapshot.winner === 1 ? snapshot.blackName : snapshot.whiteName;
  const loserName = snapshot.winner === 1 ? snapshot.whiteName : snapshot.blackName;
  const winnerAvatar = snapshot.winner === 1 ? snapshot.blackAvatarId : snapshot.whiteAvatarId;
  const loserAvatar = snapshot.winner === 1 ? snapshot.whiteAvatarId : snapshot.blackAvatarId;

  qs('resultWinnerName').textContent = winnerName || 'Winner';
  qs('resultLoserName').textContent = loserName || 'Loser';
  qs('resultWinnerAvatar').src = avatarPath(winnerAvatar);
  qs('resultLoserAvatar').src = avatarPath(loserAvatar);
  qs('resultMainText').textContent = viewerWins ? 'You Win!' : 'You Lose!';
  qs('resultOverlay').classList.remove('hidden');
}

function closeResultModal() {
  qs('resultOverlay').classList.add('hidden');
}

function maybeShowPlayerLeftModal(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot || !currentSnapshot || isReplaying) {
    return;
  }

  if (currentSnapshot.viewerColor === 0) {
    return;
  }

  const previousBothReady = previousSnapshot.hasBlack && previousSnapshot.hasWhite;
  const currentBothReady = currentSnapshot.hasBlack && currentSnapshot.hasWhite;

  if (!previousBothReady || currentBothReady) {
    return;
  }

  if (lastLeaveMessage === currentSnapshot.notice) {
    return;
  }

  lastLeaveMessage = currentSnapshot.notice;
  closeResultModal();

  openModal(
    '玩家離開通知',
    `${currentSnapshot.notice} 房間已整理完成，現在正在等待新的玩家加入。`,
    [
      { text: '我知道了', className: 'primary-btn' }
    ],
    'player-left'
  );
}

function maybeShowRequestModals() {
  if (!snapshot || isReplaying || snapshot.gameOver) {
    return;
  }

  const myColor = snapshot.viewerColor;

  const restartPendingForMe =
    (myColor === 1 && snapshot.restartRequestedByWhite && !snapshot.restartRequestedByBlack) ||
    (myColor === 2 && snapshot.restartRequestedByBlack && !snapshot.restartRequestedByWhite);

  if (restartPendingForMe && modalState.key !== 'restart') {
    openModal(
      '重新開始請求',
      '對方想要重新開始，是否同意？',
      [
        {
          text: '接受',
          className: 'primary-btn',
          onClick: async () => {
            await respondRestart(true);
          }
        },
        {
          text: '拒絕',
          className: 'danger-btn',
          onClick: async () => {
            await respondRestart(false);
          }
        }
      ],
      'restart'
    );
    return;
  }

  const undoPendingForMe =
    (myColor === 1 && snapshot.undoRequestedByWhite && !snapshot.undoRequestedByBlack) ||
    (myColor === 2 && snapshot.undoRequestedByBlack && !snapshot.undoRequestedByWhite);

  if (undoPendingForMe && modalState.key !== 'undo') {
    openModal(
      '悔棋請求',
      '對方想要悔棋一步，是否同意？',
      [
        {
          text: '接受',
          className: 'primary-btn',
          onClick: async () => {
            await respondUndo(true);
          }
        },
        {
          text: '拒絕',
          className: 'danger-btn',
          onClick: async () => {
            await respondUndo(false);
          }
        }
      ],
      'undo'
    );
  }
}

async function fetchStatus() {
  if (isReplaying) {
    return;
  }

  if (isAiMode) {
    syncWinningLine();
    updateSidebar();
    drawBoard();
    showResultModal();
    return;
  }

  const params = parseQuery();
  const roomId = params.roomId;
  const playerToken = getStoredToken(roomId);
  const previousSnapshot = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;

  const response = await fetch(`/api/status?roomId=${encodeURIComponent(roomId)}&playerToken=${encodeURIComponent(playerToken)}`);
  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Status request failed');
  }

  snapshot = data;
  syncWinningLine();

  if (!snapshot.gameOver) {
    didPlayResultSound = false;
  }

  updateSidebar();
  drawBoard();
  maybeShowPlayerLeftModal(previousSnapshot, snapshot);
  maybeShowRequestModals();
  showResultModal();
}

async function sendMove(row, col) {
  if (isReplaying || !snapshot || snapshot.gameOver) {
    return;
  }

  if (isAiMode) {
    if (snapshot.currentPlayer !== 1 || snapshot.board[row][col]) {
      return;
    }

    clearAiTimers();
    const finished = applyLocalMove(row, col, 1);
    if (!finished) {
      if (snapshot.timerEnabled) {
        startAiTurnTimer();
      }
      scheduleAiMove();
    }
    return;
  }

  const params = parseQuery();

  try {
    await postJson('/api/move', {
      roomId: params.roomId,
      playerToken: getStoredToken(params.roomId),
      row,
      col
    });

    playMoveSound();
    await fetchStatus();
  } catch (error) {
    showToast(error.message);
  }
}

async function requestRestart() {
  if (isReplaying || !snapshot) {
    return;
  }

  if (isAiMode) {
    resetAiGame(parseQuery());
    showToast('已重新開始');
    return;
  }

  if (snapshot.gameOver) {
    return;
  }

  if (!snapshot.history.length) {
    showToast('要等第一步落子後才可以要求重新開始');
    return;
  }

  const params = parseQuery();

  try {
    await postJson('/api/restart_request', {
      roomId: params.roomId,
      playerToken: getStoredToken(params.roomId)
    });
    showToast('已送出重新開始請求');
    await fetchStatus();
  } catch (error) {
    showToast(error.message);
  }
}

async function respondRestart(accepted) {
  const params = parseQuery();

  try {
    await postJson('/api/restart_respond', {
      roomId: params.roomId,
      playerToken: getStoredToken(params.roomId),
      accepted
    });
    showToast(accepted ? '你已接受重新開始' : '你已拒絕重新開始');
    await fetchStatus();
  } catch (error) {
    showToast(error.message);
  }
}

async function requestUndo() {
  if (isReplaying || !snapshot) {
    return;
  }

  if (isAiMode) {
    undoAiGame();
    return;
  }

  if (!snapshot.canUndoForViewer || snapshot.gameOver) {
    return;
  }

  const params = parseQuery();

  try {
    await postJson('/api/undo_request', {
      roomId: params.roomId,
      playerToken: getStoredToken(params.roomId)
    });
    showToast('已送出悔棋請求');
    await fetchStatus();
  } catch (error) {
    showToast(error.message);
  }
}

async function respondUndo(accepted) {
  const params = parseQuery();

  try {
    await postJson('/api/undo_respond', {
      roomId: params.roomId,
      playerToken: getStoredToken(params.roomId),
      accepted
    });
    showToast(accepted ? '你已接受悔棋' : '你已拒絕悔棋');
    await fetchStatus();
  } catch (error) {
    showToast(error.message);
  }
}

async function leaveRoom() {
  clearAiTimers();
  const params = parseQuery();

  if (!isAiMode) {
    try {
      await postJson('/api/leave_room', {
        roomId: params.roomId,
        playerToken: getStoredToken(params.roomId)
      });
    } catch (_) {
      // Ignore leave network errors.
    }

    clearStoredToken(params.roomId);
  }

  window.location.href = './index.html';
}

function startReplay() {
  if (!snapshot || !snapshot.history.length) {
    showToast('目前沒有可回放的棋譜');
    return;
  }

  clearInterval(replayTimer);
  isReplaying = true;
  hoverPoint = null;
  closeModal();
  closeResultModal();

  replayRestoreSnapshot = cloneData(snapshot);
  replayMoves = snapshot.history.map((move) => ({ ...move }));
  replayIndex = 0;

  const replaySnapshot = JSON.parse(JSON.stringify(snapshot));
  replaySnapshot.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  replaySnapshot.history = [];
  replaySnapshot.lastMoveRow = -1;
  replaySnapshot.lastMoveCol = -1;
  replaySnapshot.notice = '回放開始';
  replaySnapshot.gameOver = false;
  replaySnapshot.winner = 0;
  replaySnapshot.winningLine = null;

  snapshot = replaySnapshot;
  updateSidebar();
  drawBoard();
  showToast('開始回放');

  setTimeout(() => {
    replayTimer = setInterval(() => {
      if (replayIndex >= replayMoves.length) {
        clearInterval(replayTimer);
        isReplaying = false;
        showToast('回放結束');

        if (isAiMode && replayRestoreSnapshot) {
          snapshot = cloneData(replayRestoreSnapshot);
          replayRestoreSnapshot = null;
          updateSidebar();
          drawBoard();
          showResultModal();
          if (snapshot.timerEnabled && !snapshot.gameOver) {
            startAiTurnTimer();
          }
        } else {
          fetchStatus().catch(() => {});
        }
        return;
      }

      const move = replayMoves[replayIndex];
      snapshot.board[move.row][move.col] = move.color;
      snapshot.lastMoveRow = move.row;
      snapshot.lastMoveCol = move.col;
      snapshot.history.push(move);
      snapshot.notice = `回放第 ${replayIndex + 1} 手`;

      updateSidebar();
      drawBoard();

      replayIndex += 1;
    }, 1000);
  }, 1000);
}

function initRoomPage() {
  const params = parseQuery();

  if (isAiMode) {
    initAiRoomPage();
    return;
  }

  loadSoundSettings();
  attachGlobalAudioHandlers();

  if (!params.roomId) {
    window.location.href = './index.html';
    return;
  }

  const canvas = qs('boardCanvas');

  canvas.addEventListener('mousemove', (event) => {
    hoverPoint = boardPointFromMouse(event);
    drawBoard();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverPoint = null;
    drawBoard();
  });

  canvas.addEventListener('click', (event) => {
    if (!snapshot || isReplaying) {
      return;
    }

    const point = boardPointFromMouse(event);

    if (!point) {
      return;
    }

    sendMove(point.row, point.col);
  });

  qs('copyRoomBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(params.roomId);
    showToast('房號已複製');
  });

  qs('copyInviteBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/index.html?roomId=${encodeURIComponent(params.roomId)}`);
    showToast('邀請連結已複製');
  });
  qs('showRoomSettingsBtn')?.addEventListener('click', openSettingsModal);
  qs('settingsModalCloseBtn')?.addEventListener('click', closeSettingsModal);
  qs('closeSettingsBtn')?.addEventListener('click', closeSettingsModal);
  qs('settingsOverlay')?.addEventListener('click', (event) => {
    if (event.target === qs('settingsOverlay')) {
      closeSettingsModal();
    }
  });
  qs('bgmToggle')?.addEventListener('change', async () => {
    bgmEnabled = qs('bgmToggle').checked;
    persistSoundSettings();

    if (bgmEnabled) {
      await unlockAudio();
      startBackgroundMusic();
    } else {
      stopBackgroundMusic();
    }

    applySoundSettingsToUI();
  });

  qs('sfxToggle')?.addEventListener('change', () => {
    sfxEnabled = qs('sfxToggle').checked;
    persistSoundSettings();
    applySoundSettingsToUI();
  });

  qs('bgmVolume')?.addEventListener('input', () => {
    bgmVolume = Number(qs('bgmVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();

    if (bgmEnabled && audioUnlocked) {
      startBackgroundMusic();
    }
  });

  qs('sfxVolume')?.addEventListener('input', () => {
    sfxVolume = Number(qs('sfxVolume').value) / 100;
    persistSoundSettings();
    applySoundSettingsToUI();
  });

  qs('restartBtn').addEventListener('click', requestRestart);
  qs('undoBtn').addEventListener('click', requestUndo);
  qs('replayBtn').addEventListener('click', startReplay);

  qs('leaveBtn').addEventListener('click', () => {
    openModal(
      '確認離開',
      '你確定要返回大廳嗎？',
      [
        { text: '留在房間', className: 'ghost-btn' },
        { text: '確認離開', className: 'danger-btn', onClick: leaveRoom }
      ],
      'leave'
    );
  });

  qs('modalCloseBtn').addEventListener('click', closeModal);
  qs('modalOverlay').addEventListener('click', (event) => {
    if (event.target === qs('modalOverlay')) {
      closeModal();
    }
  });

  qs('closeRulesBtn').addEventListener('click', closeRulesModal);
  qs('rulesOverlay').addEventListener('click', (event) => {
    if (event.target === qs('rulesOverlay')) {
      closeRulesModal();
    }
  });

  qs('resultCloseBtn').addEventListener('click', closeResultModal);
  qs('resultOverlay').addEventListener('click', (event) => {
    if (event.target === qs('resultOverlay')) {
      closeResultModal();
    }
  });

  showRulesModalIfNeeded(params.roomId);
  fetchStatus().catch((error) => showToast(error.message));

  statusPollTimer = setInterval(() => {
    if (!isReplaying) {
      fetchStatus().catch(() => {});
    }
  }, 1000);
}

if (isRoomPage) {
  initRoomPage();
} else {
  initLobbyPage();
}
