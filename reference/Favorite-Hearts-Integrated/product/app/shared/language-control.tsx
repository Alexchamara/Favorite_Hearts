'use client';
import {useEffect,useState} from 'react';
import {getLanguage,setLanguage,languageLabels,localize,type SiteLanguage} from '@/lib/site-locale';
export function useSiteLanguage(selector:string){useEffect(()=>{const root=document.querySelector<HTMLElement>(selector)||document.body;return localize(root)},[selector]);}
export default function LanguageControl(){const [lang,setLang]=useState<SiteLanguage>('en');useEffect(()=>{const update=()=>setLang(getLanguage());update();window.addEventListener('fh-language',update);return()=>window.removeEventListener('fh-language',update)},[]);return <label className="fh-language"><span>Website language</span><select aria-label="Website language" value={lang} onChange={e=>setLanguage(e.target.value as SiteLanguage)} data-no-translate>{Object.entries(languageLabels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>}
