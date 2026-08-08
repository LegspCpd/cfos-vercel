import AppShell from '@/components/AppShell';

// All pages wrapped in the sidebar shell (except login/signup/workspace editor).
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
