import {build,transform} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {readFile,writeFile,mkdir,cp,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const product=path.join(root,'product'),out=path.join(root,'dist');
execFileSync(process.execPath,[path.join(root,'node_modules/tailwindcss3/lib/cli.js'),'-c',path.join(root,'website/tailwind.config.cjs'),'-i',path.join(root,'website/src/tailwind/input.css'),'-o',path.join(root,'website/src/styles/tailwind.css'),'--minify'],{cwd:path.join(root,'website'),stdio:'inherit'});
execFileSync('python3',[path.join(root,'website/scripts/build.py')],{stdio:'inherit'});
await rm(out,{recursive:true,force:true});await cp(path.join(root,'website/dist'),out,{recursive:true});
await mkdir(path.join(out,'matrimony/assets'),{recursive:true});
const result=await build({entryPoints:[path.join(product,'preview/entry.tsx')],bundle:true,minify:true,write:false,metafile:true,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':product},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'matrimony-portals',setup(b){b.onLoad({filter:/components\/ui\/(dialog|sheet|select|alert-dialog|popover|tooltip)\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/<(DialogPrimitive|SheetPrimitive|SelectPrimitive|AlertDialogPrimitive|PopoverPrimitive|TooltipPrimitive)\.Portal/g,'<$1.Portal container={document.getElementById("favorite-hearts-product")}'),loader:'tsx'}));}}]});
await writeFile(path.join(out,'matrimony/assets/app.js'),result.outputFiles[0].text);
await writeFile(path.join(root,'docs/bundle-inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2));
function scope(css,id){const ast=postcss.parse(css);ast.walkRules(rule=>{for(let p=rule.parent;p;p=p.parent){if(p.type==='rule'||p.type==='atrule'&&/keyframes/.test(p.name))return;}rule.selectors=rule.selectors.map(s=>['html','body',':root'].includes(s)?id:id+' '+s.replace(/:root/g,''));});return ast.toString();}
const theme=await readFile(path.join(product,'preview/theme.css'),'utf8');
const input='@import "tailwindcss";\n@import "tw-animate-css";\n@source "./product/preview";\n@source "./product/app/matrimony";\n@source "./product/components";\n'+theme;
const compiled=await postcss([tailwind({base:root,optimize:false})]).process(input,{from:path.join(root,'portable-tailwind.css')});
let css=scope(compiled.css,'#favorite-hearts-preview');
css+=scope(await readFile(path.join(product,'preview/product.css'),'utf8'),'#favorite-hearts-product');
for(const f of ['preview/overrides.css','preview/contrast.css','preview/combined-overrides.css','app/design-system.css'])css+='\n'+await readFile(path.join(product,f),'utf8');
css+='\nhtml,body{margin:0;min-height:100%;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}#favorite-hearts-product{min-height:100dvh}#favorite-hearts-product .ma-entry{min-height:100dvh}';
css=(await transform(css,{loader:'css',minify:true})).code;
await writeFile(path.join(out,'matrimony/assets/styles.css'),css);
const page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Favorite Hearts — Matrimony</title><link rel="icon" href="../assets/favicon.svg"><link rel="stylesheet" href="assets/styles.css"></head><body><div id="favorite-hearts-preview"><div id="favorite-hearts-product"></div></div><script src="assets/app.js"></script></body></html>';
await writeFile(path.join(out,'matrimony/index.html'),page);
// Explicit relative index paths work on static hosts and extracted local folders.
async function portable(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())await portable(file);else if(file.endsWith('.html')){let html=await readFile(file,'utf8');html=html.replace(/\b(href|src|action)="\/(?!\/)([^"?#]*)([^\"]*)"/g,(_,attr,p,suffix)=>{if(!p||p.endsWith('/'))p+='index.html';return `${attr}="${path.relative(path.dirname(file),path.join(out,p)).split(path.sep).join('/')}${suffix}"`;});await writeFile(file,html);}}}
await portable(out);
console.log('Built website plus matrimony-only product. No dating entry or bundle.');
