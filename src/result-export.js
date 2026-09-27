(function (root) {
  'use strict';
  const Engine =
    typeof module === 'object' && module.exports ? require('./engine.js') : root.ScoreEngine;
  function exportGame(game, prepare, persist, download) {
    if (!game.finished) throw Error('End the game before exporting final results.');
    const content = prepare();
    if (!game.finalizedAt) {
      // Save the edit lock before handing a final result to the user.
      Engine.finalize(game);
      try {
        persist();
      } catch (error) {
        // A failed save must leave the game editable and must not download a result.
        delete game.finalizedAt;
        throw error;
      }
    }
    download(content);
  }
  const api = { exportGame };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResultExport = api;
})(globalThis);
