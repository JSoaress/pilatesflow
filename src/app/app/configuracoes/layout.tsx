import { getAppContext } from '@/lib/auth/context';
import { SETTINGS_SECTIONS } from '@/lib/settings-nav';
import { SettingsNav } from '@/components/app/settings/settings-nav';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const items = SETTINGS_SECTIONS.filter((s) => s.implemented && (!s.perm || ctx.can(s.perm))).map((s) => ({ href: s.href, label: s.label }));
  return (<><SettingsNav items={items} />{children}</>);
}
