'use strict';

// ════════════════════════════════════════════════
// ════ ROUTER ════
// Scene navigation, history stack, teardown hooks.
// Depends on globals declared elsewhere (loaded later, looked up at call time):
//   Scenes, Sfx, Haptic, Lives, PersistentHUD, Dev
// ════════════════════════════════════════════════

const Game = (() => {
  const _history = [];
  let _currentScene = null;
  let _transitioning = false;
  // Hooks fired when leaving the current scene — cancels timers/animations
  // that would otherwise spawn DOM nodes onto a detached scene. Declared
  // BEFORE `return` so the `let` initializes (otherwise stays in TDZ →
  // _mount crash on first navigation).
  let _teardownHooks = [];
  function onTeardown(fn) { _teardownHooks.push(fn); }
  function runTeardown() {
    const hooks = _teardownHooks; _teardownHooks = [];
    hooks.forEach(fn => { try { fn(); } catch(e) { console.warn('[teardown]', e); } });
  }

  const stage = () => document.getElementById('stage');

  return {
    currentScene: null,

    goto(sceneName, params = {}) {
      if (_transitioning) return;
      if (!(sceneName in Scenes)) {
        console.warn('[Router] Unknown scene:', sceneName);
        return;
      }

      const old = stage().querySelector('.scene');
      // Skip tap sound/haptic on initial boot (no previous scene) — avoids
      // Chrome autoplay-policy warnings before user has interacted.
      if (old) {
        Sfx.play('tap');
        Haptic.tap();
      }
      if (old) {
        _transitioning = true;
        const wipe = document.createElement('div');
        wipe.className = 'scene-wipe-sparkle';
        const colors = ['#e3b25a','#d28464','#8aa872','#f4d99a','#b8c8a8'];
        for (let i = 0; i < 18; i++) {
          const p = document.createElement('div');
          p.className = 'swipe-particle';
          const sz = 6 + Math.random() * 14;
          p.style.cssText = `
            width:${sz}px; height:${sz}px;
            left:${Math.random()*100}%;
            top:${Math.random()*100}%;
            background:${colors[i%colors.length]};
            animation-delay:${Math.random()*0.18}s;
          `;
          wipe.appendChild(p);
        }
        stage().appendChild(wipe);
        setTimeout(() => wipe.remove(), 450);

        old.classList.add('scene-exit');
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          if (old.parentNode) old.remove();
          _mount(sceneName, params);
          _transitioning = false;
        };
        old.addEventListener('animationend', finish, { once: true });
        // Fallback if animationend never fires (reduced-motion, missing keyframes)
        setTimeout(finish, 320);
      } else {
        _mount(sceneName, params);
      }
    },

    back() {
      if (_history.length > 1) {
        _history.pop();
        const prev = _history.pop();
        this.goto(prev.scene, prev.params);
      } else {
        this.goto('hub');
      }
    },

    currentSceneName() { return _currentScene; },

    onTeardown(fn) { onTeardown(fn); },

    // Internal access for legacy code that reaches into the history
    // (e.g. live-reload on storage event). Prefer back() / goto() in new code.
    _history
  };

  function _mount(sceneName, params) {
    runTeardown();
    if (typeof Lives !== 'undefined') Lives.stopTicker();

    const wrapper = document.createElement('div');
    wrapper.className = 'scene scene-enter';

    const content = Scenes[sceneName](params);
    wrapper.appendChild(content);
    stage().appendChild(wrapper);

    _currentScene = sceneName;
    Game.currentScene = sceneName;
    if (typeof PersistentHUD !== 'undefined') PersistentHUD.update(sceneName);
    _history.push({ scene: sceneName, params });
    if (_history.length > 20) _history.shift();

    if (typeof Dev !== 'undefined' && Dev.refresh) Dev.refresh();
  }
})();
