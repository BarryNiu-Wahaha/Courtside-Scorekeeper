const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const build=spawnSync(process.execPath,[path.join(root,'build.cjs')],{stdio:'inherit',cwd:root,windowsHide:true});
if(build.status!==0)process.exit(build.status||1);
const result=spawnSync(process.env.PYTHON||'python',['-m','scorekeeper_remote.publishing',...process.argv.slice(2)],{stdio:'inherit',cwd:root,windowsHide:true});
if(result.error)console.error(result.error.message);
process.exit(result.status|| (result.error?1:0));
