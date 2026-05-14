'use strict';

// ════════════════════════════════════════════════
// ════ SAVE ════
// ════════════════════════════════════════════════

const SAVE_KEY = 'kvtm2_save_v1';

const DEFAULT_SAVE = {
  player: {
    name: '',
    gender: '',
    createdAt: null,
    lastLogin: null,
    dayStreak: 1
  },
  progress: {
    currentLevel: 1,
    levelsCompleted: [],
    starsBalance: 5,
    livesCount: 5,
    livesRegenAt: null
  },
  hub: {
    decorTasksDone: [],
    currentEstate: 'rose_garden'
  },
  story: {
    beatsUnlocked: ['intro'],
    chapterProgress: 0
  },
  daily: {
    loginRewards: [],
    lastClaimDay: 0
  },
  settings: {
    sound: true,
    haptic: true,
    music: true
  }
};

const Save = (() => {
  let _data = null;

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function merge(target, defaults) {
    for (const key in defaults) {
      if (!(key in target)) {
        target[key] = clone(defaults[key]);
      } else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
        merge(target[key], defaults[key]);
      }
    }
    return target;
  }

  function resolvePath(data, path) {
    const parts = path.split('.');
    let obj = data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in obj)) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    return { obj, key: parts[parts.length - 1] };
  }

  // Dev.refresh() is defined in the inline scene script; guard so this module
  // works even if loaded before Dev (early scene init, headless test, etc.).
  function _devRefresh() {
    if (typeof Dev !== 'undefined' && Dev.refresh) Dev.refresh();
  }

  return {
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          _data = merge(JSON.parse(raw), clone(DEFAULT_SAVE));
        } else {
          _data = clone(DEFAULT_SAVE);
        }
      } catch (e) {
        console.warn('[Save] Load failed, using defaults:', e);
        _data = clone(DEFAULT_SAVE);
      }
      return _data;
    },

    get() {
      if (!_data) this.load();
      return _data;
    },

    set(path, value) {
      if (!_data) this.load();
      const { obj, key } = resolvePath(_data, path);
      obj[key] = value;
      this._persist();
      _devRefresh();
    },

    inc(path, amount = 1) {
      if (!_data) this.load();
      const { obj, key } = resolvePath(_data, path);
      obj[key] = (obj[key] || 0) + amount;
      this._persist();
      _devRefresh();
    },

    reset() {
      _data = clone(DEFAULT_SAVE);
      const now = new Date().toISOString();
      _data.player.createdAt = now;
      _data.player.lastLogin = now;
      _data.progress.livesRegenAt = null;
      localStorage.setItem(SAVE_KEY, JSON.stringify(_data));
      _devRefresh();
    },

    isNewGame() {
      if (!_data) this.load();
      return !_data.player.createdAt;
    },

    _persist() {
      _data._savedAt = new Date().toISOString();
      localStorage.setItem(SAVE_KEY, JSON.stringify(_data));
    }
  };
})();

// ════════════════════════════════════════════════
// ════ LIVES ════
// ════════════════════════════════════════════════

const LIVES_MAX = 5;
const LIVES_REGEN_MS = 30 * 60 * 1000;

const Lives = (() => {
  let _timerInterval = null;

  function _devRefresh() { if (typeof Dev !== 'undefined' && Dev.refresh) Dev.refresh(); }

  return {
    getCount() {
      const save = Save.get();
      let lives = save.progress.livesCount;
      const regenAt = save.progress.livesRegenAt;

      if (lives < LIVES_MAX && regenAt) {
        const now = Date.now();
        const regen = new Date(regenAt).getTime();
        if (now >= regen) {
          const elapsed = now - regen;
          const regenCount = 1 + Math.floor(elapsed / LIVES_REGEN_MS);
          lives = Math.min(LIVES_MAX, lives + regenCount);
          if (lives >= LIVES_MAX) {
            Save.set('progress.livesCount', LIVES_MAX);
            Save.set('progress.livesRegenAt', null);
          } else {
            const newRegenAt = new Date(regen + regenCount * LIVES_REGEN_MS).toISOString();
            Save.set('progress.livesCount', lives);
            Save.set('progress.livesRegenAt', newRegenAt);
          }
        }
      }
      return lives;
    },

    consume() {
      const count = this.getCount();
      if (count <= 0) return false;
      const newCount = count - 1;
      Save.set('progress.livesCount', newCount);
      if (newCount < LIVES_MAX && !Save.get().progress.livesRegenAt) {
        const regenAt = new Date(Date.now() + LIVES_REGEN_MS).toISOString();
        Save.set('progress.livesRegenAt', regenAt);
      }
      return true;
    },

    refill(n = LIVES_MAX) {
      const newCount = Math.min(LIVES_MAX, this.getCount() + n);
      Save.set('progress.livesCount', newCount);
      if (newCount >= LIVES_MAX) {
        Save.set('progress.livesRegenAt', null);
      }
      this.updateUI();
    },

    msUntilNext() {
      const save = Save.get();
      if (save.progress.livesCount >= LIVES_MAX) return 0;
      if (!save.progress.livesRegenAt) return 0;
      return Math.max(0, new Date(save.progress.livesRegenAt).getTime() - Date.now());
    },

    formatTimer() {
      const ms = this.msUntilNext();
      if (ms <= 0) return '';
      const totalSec = Math.ceil(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${m}:${s.toString().padStart(2,'0')}`;
    },

    updateUI() {
      const count = this.getCount();
      const hearts = document.getElementById('hub-hearts');
      const heartsSub = document.getElementById('hub-hearts-sub');
      if (hearts) hearts.textContent = count;
      if (heartsSub) {
        const t = this.formatTimer();
        if (count >= LIVES_MAX) {
          heartsSub.textContent = 'Full';
          heartsSub.style.display = '';
        } else {
          heartsSub.textContent = t ? `+1 ${t}` : '';
          heartsSub.style.display = t ? '' : 'none';
        }
      }
      _devRefresh();
    },

    startTicker() {
      this.stopTicker();
      _timerInterval = setInterval(() => { this.updateUI(); }, 1000);
    },

    stopTicker() {
      if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
    }
  };
})();

// ════════════════════════════════════════════════
// ════ SFX ════
// ════════════════════════════════════════════════

const Sfx = (() => {
  let _ctx = null;

  function getCtx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return _ctx;
  }

  function playTone(freq, duration, type = 'sine', gainVal = 0.3) {
    const ctx = getCtx();
    if (!ctx) return;
    if (!Save.get().settings.sound) return;
    if (ctx.state === 'suspended') { ctx.resume(); return; }
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + duration);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  }

  const sounds = {
    tap:     () => playTone(440, 0.08, 'sine', 0.2),
    success: () => { playTone(523, 0.1, 'sine', 0.3); setTimeout(() => playTone(659, 0.15, 'sine', 0.3), 80); setTimeout(() => playTone(784, 0.2, 'sine', 0.3), 180); },
    fail:    () => { playTone(330, 0.15, 'sawtooth', 0.25); setTimeout(() => playTone(220, 0.2, 'sawtooth', 0.2), 120); },
    chime:   () => { playTone(880, 0.12, 'sine', 0.25); setTimeout(() => playTone(1046, 0.18, 'sine', 0.2), 100); },
  };

  return {
    play(name) { if (sounds[name]) sounds[name](); }
  };
})();

// ════════════════════════════════════════════════
// ════ HAPTIC ════
// ════════════════════════════════════════════════

const Haptic = {
  _ok() { return Save.get().settings.haptic && 'vibrate' in navigator; },
  tap()     { if (this._ok()) navigator.vibrate(10); },
  success() { if (this._ok()) navigator.vibrate([30, 20, 60]); },
  fail()    { if (this._ok()) navigator.vibrate([80, 30, 80]); }
};
