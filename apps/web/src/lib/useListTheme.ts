import { useEffect } from 'react';
import type { ListTheme } from '@gubbins/shared-types';

/** Puts the list's style on `<html>`, where index.css swaps the theme tokens, and takes it off when the page goes. */
export function useListTheme(theme: ListTheme | undefined): void {
  useEffect(() => {
    if (theme === undefined) return;
    document.documentElement.dataset.listTheme = theme;
    return () => { delete document.documentElement.dataset.listTheme; };
  }, [theme]);
}
