import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {getCountry} from '@/lib/site-locale';
import {mountMatrimonyAccount} from '@/app/matrimony/account-entry';
import {createDemoAccount,initialNetwork} from '@/lib/matrimony-network';
import MatrimonyApp from './matrimony';
const container=document.getElementById('favorite-hearts-product')!;
const root=createRoot(container);
let stopEntry:(()=>void)|null=null;
let started=false;
window.openFavoriteLanding=()=>location.assign('../index.html');
function enterMatrimony(){
 if(started){flushSync(()=>root.render(null));started=false;}
 if(stopEntry){stopEntry();stopEntry=null;}
 stopEntry=mountMatrimonyAccount(container,{
  home:window.openFavoriteLanding,
  create:async(actor,name)=>{window.__heartsNetwork=createDemoAccount(window.__heartsNetwork||initialNetwork(),actor,name,getCountry());},
  enter:actor=>{if(stopEntry){stopEntry();stopEntry=null;}flushSync(()=>root.render(<MatrimonyApp initialActor={actor} onLogout={enterMatrimony}/>));started=true;}
 });
}
window.openFavoriteMatrimony=enterMatrimony;
enterMatrimony();
