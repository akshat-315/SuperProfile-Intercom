import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-linear-to-b from-brand-50 to-paper px-4 py-10 sm:px-6">
      <BrandMark className="size-9 text-brand-500" />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
