const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'src',name),'utf8');
const scripts = ['team.js','engine.js','roster.js','remote.js','app.js'].map(read).join('\n');
const html = read('template.html').replace('/* INLINE_STYLES */',()=>read('styles.css')).replace('/* INLINE_SCRIPTS */',()=>scripts);
fs.writeFileSync(path.join(__dirname,'Front.html'),html,'utf8');
console.log('Built standalone Front.html ('+Buffer.byteLength(html)+' bytes).');
