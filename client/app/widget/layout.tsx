export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-svh flex-col overflow-hidden bg-background">{children}</div>;
}
