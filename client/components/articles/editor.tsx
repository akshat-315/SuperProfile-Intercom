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
          "prose prose-sm max-w-none min-h-72 px-4 py-3 focus:outline-none [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-medium [&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_a]:underline",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);

  if (!editor) return <div className="min-h-72 rounded-md border" />;

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
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
              className={cn("size-8", action.active(editor) && "bg-muted")}
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
          className={cn("size-8", editor.isActive("link") && "bg-muted")}
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
