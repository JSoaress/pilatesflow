'use client';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <Menu trigger={(p) => (
      <Button variant="ghost" size="icon" aria-label="Alterar tema" {...p}>
        {mounted && resolvedTheme === 'dark' ? <Moon /> : <Sun />}
      </Button>
    )}>
      {(close) => (
        <>
          <MenuItem onClick={() => { setTheme('light'); close(); }}><Sun /> Claro</MenuItem>
          <MenuItem onClick={() => { setTheme('dark'); close(); }}><Moon /> Escuro</MenuItem>
          <MenuItem onClick={() => { setTheme('system'); close(); }}><Monitor /> Automático</MenuItem>
        </>
      )}
    </Menu>
  );
}
