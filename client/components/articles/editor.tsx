"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Action = {
  icon: typeof Bold;
  label: string;
  run: (editor: NonNullable<ReturnType<typeof useEditor>>) => void;
  active: (editor: NonNullable<ReturnType<typeof useEditor>>) => boolean;
};

const ACTIONS: (Action | "divider")[] = [
  {
    icon: Bold,
    label: "Bold",
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive("bold"),
  },
  {
    icon: Italic,
    label: "Italic",
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive("italic"),
  },
  {
    icon: Strikethrough,
    label: "Strikethrough",
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive("strike"),
  },
  "divider",
  {
    icon: Heading2,
    label: "Heading",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive("heading", { level: 2 }),
  },
  {
    icon: Heading3,
    label: "Subheading",
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (e) => e.isActive("heading", { level: 3 }),
  },
  "divider",
  {
    icon: List,
    label: "Bullet list",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive("bulletList"),
  },
  {
    icon: ListOrdered,
    label: "Numbered list",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive("orderedList"),
  },
  {
    icon: Quote,
    label: "Quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive("blockquote"),
  },
  {
    icon: Code,
    label: "Code",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    active: (e) => e.isActive("codeBlock"),
  },
];

export function ArticleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm min-h-72 max-w-[72ch] px-4 py-4 text-[14.5px] leading-7 text-ink-700 focus:outline-none [&_a]:text-brand-600 [&_a]:underline [&_blockquote]:rounded-r-md [&_blockquote]:border-l-[3px] [&_blockquote]:border-brand-500 [&_blockquote]:bg-brand-50 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:text-brand-900 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-[-0.018em] [&_h2]:text-ink-900 [&_h3]:font-medium [&_h3]:text-ink-900 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary [&_pre]:p-3 [&_strong]:text-ink-900 [&_ul,&_ol]:pl-5 [&_ul]:list-disc",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);

  if (!editor) return <div className="min-h-72 rounded-xl border bg-surface" />;

  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-rail p-1.5">
        {ACTIONS.map((action, index) =>
          action === "divider" ? (
            <Separator key={index} orientation="vertical" className="mx-1 h-5" />
          ) : (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={action.label}
              aria-pressed={action.active(editor)}
              className={cn(
                "size-8 text-ink-700",
                action.active(editor) && "bg-brand-50 text-brand-700",
              )}
              onClick={() => action.run(editor)}
            >
              <action.icon className="size-4" aria-hidden />
            </Button>
          ),
        )}
        <Separator orientation="vertical" className="mx-1 h-5" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Link"
          className={cn("size-8 text-ink-700", editor.isActive("link") && "bg-brand-50 text-brand-700")}
          onClick={() => {
            const href = window.prompt("Link to", editor.getAttributes("link").href ?? "https://");
            if (href === null) return;
            if (href === "") {
              editor.chain().focus().unsetLink().run();
              return;
            }
            editor.chain().focus().setLink({ href }).run();
          }}
        >
          <Link2 className="size-4" aria-hidden />
        </Button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
