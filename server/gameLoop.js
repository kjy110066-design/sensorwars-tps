'use strict';

function createGameLoop(gameState, onTick) {
  const tickRate = parseInt(process.env.TICK_RATE || '20', 10);
  const tickInterval = Math.round(1000 / tickRate);
  let intervalId = null;
  let lastTickTime = Date.now();

  function tick() {
    const now = Date.now();
    const dt = (now - lastTickTime) / 1000;
    lastTickTime = now;

    const events = gameState.tick(dt);
    onTick(events || []);
  }

  return {
    start() {
      if (intervalId) return;
      lastTickTime = Date.now();
      intervalId = setInterval(tick, tickInterval);
      console.log(`[GameLoop] 시작 - ${tickRate}틱/초 (${tickInterval}ms 간격)`);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[GameLoop] 정지');
      }
    },
    isRunning() {
      return intervalId !== null;
    }
  };
}

module.exports = { createGameLoop };
