'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
export default function ResponsiveSection({title,children,className=''}:{title:string,children:ReactNode,className?:string}){const [open,setOpen]=useState(false);useEffect(()=>{const query=window.matchMedia('(min-width: 701px)');const sync=()=>setOpen(query.matches);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync)},[]);return <details className={'m-responsive-section '+className} open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary><h3>{title}</h3><ChevronDown size={17}/></summary><div className="m-responsive-content">{children}</div></details>}
