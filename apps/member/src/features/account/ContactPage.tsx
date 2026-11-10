/**
 * Contact us (SCREEN-048), the demo's support page: one card per channel (.m-support-grid of .m-surface). The channels
 * are the website's own (apps/website/site.config.json; owner, 30 Oct 2026; audit X06): WhatsApp and calls on one
 * number, and email; social pages only once their addresses are set there.
 */
import { ArrowUpRight, Camera, Globe, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react';
import { AppShell } from '@/components/layout';
import { useI18n, type AppTextKey } from '@/lib/i18n';
import site from '../../../../website/site.config.json';

const digits = site.telephone.replace(/\D/g, '');

type Channel = { name: string; description: AppTextKey; Icon: LucideIcon; href: string };

export default function ContactPage() {
  const { t } = useI18n();
  const social = site.social as Record<string, string | null>;
  const channels: Channel[] = [
    { name: 'WhatsApp', description: 'contact.whatsapp.desc', Icon: MessageCircle, href: `https://wa.me/${digits}` },
    { name: t('contact.call.name'), description: 'contact.call.desc', Icon: Phone, href: `tel:${site.telephone}` },
    { name: t('contact.email.name'), description: 'contact.email.desc', Icon: Mail, href: `mailto:${site.email}` },
    ...Object.entries(social)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([name, href]) => ({ name, description: 'contact.social.desc' as const, Icon: name === 'Instagram' ? Camera : Globe, href })),
  ];
  return (
    <AppShell width="wide">
      <div className="m-page-heading">
        <div>
          <span className="m-kicker uppercase">{t('contact.kicker')}</span>
          <h1>{t('contact.title')}</h1>
          <p>{t('contact.lead')}</p>
        </div>
      </div>
      <div className="m-support-grid">
        {channels.map(({ name, description, Icon, href }) => (
          <section className="m-surface" key={name} aria-labelledby={`channel-${name}`}>
            <Icon size={25} aria-hidden="true" />
            <h2 id={`channel-${name}`}>{name}</h2>
            <p>{t(description)}</p>
            <a className="m-btn m-secondary" href={href} {...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {t('contact.open', { name })}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </section>
        ))}
      </div>
      <div className="m-note">
        <p>{t('layout.staffNeverAsk')}</p>
      </div>
    </AppShell>
  );
}
