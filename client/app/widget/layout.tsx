export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh flex-col overflow-hidden bg-background">{children}</div>;
}
