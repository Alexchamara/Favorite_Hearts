'use client';
import {type ReactNode} from 'react';
import {Info} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
export default function HelpNote({children,label='More information'}:{children:ReactNode,label?:string}){return <Popover><PopoverTrigger asChild><button type="button" className="fh-info" aria-label={label}><Info size={16}/></button></PopoverTrigger><PopoverContent className="fh-tooltip" aria-label={label} onOpenAutoFocus={e=>e.preventDefault()} sideOffset={6}>{children}</PopoverContent></Popover>}
