import {readFileSync} from 'node:fs';
export function productHtml(){return readFileSync(new URL('../dist/matrimony/index.html',import.meta.url),'utf8').replace('<script src="assets/app.js"></script>',()=>'<script>'+readFileSync(new URL('../dist/matrimony/assets/app.js',import.meta.url),'utf8')+'</script>');}
