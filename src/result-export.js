(function(root){
 'use strict';const E=typeof module==='object'&&module.exports?require('./engine.js'):root.ScoreEngine;
 function exportGame(game,prepare,persist,download){
   if(!game.finished)throw Error('End the game before exporting final results.');
   const content=prepare();
   if(!game.finalizedAt){E.finalize(game);try{persist();}catch(error){delete game.finalizedAt;throw error;}}
   download(content);
 }
 const api={exportGame};if(typeof module==='object'&&module.exports)module.exports=api;else root.ResultExport=api;
})(globalThis);
