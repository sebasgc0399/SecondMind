import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Select } from '@base-ui/react/select';
import { ChevronDown } from 'lucide-react';
import {
  CODE_LANGUAGES,
  findLanguageLabel,
} from '@/components/editor/extensions/code-block-languages';

const AUTO_VALUE = '__auto__';

export default function CodeBlockNodeView({ node, updateAttributes }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null | undefined) ?? null;
  const selectValue = language ?? AUTO_VALUE;
  const currentLabel = findLanguageLabel(language);

  const handleValueChange = (next: string | null) => {
    if (next === null) return;
    updateAttributes({ language: next === AUTO_VALUE ? null : next });
  };

  return (
    <NodeViewWrapper className="code-block-wrapper not-prose my-3 overflow-hidden rounded-lg border border-border bg-muted">
      <div
        className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5"
        contentEditable={false}
      >
        <Select.Root value={selectValue} onValueChange={handleValueChange}>
          <Select.Trigger className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/40">
            <Select.Value>{currentLabel}</Select.Value>
            <Select.Icon>
              <ChevronDown className="h-3 w-3" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} align="start" className="z-50 outline-none">
              <Select.Popup className="max-h-[70vh] min-w-[10rem] overflow-y-auto rounded-lg border border-border bg-popover py-1 text-sm text-popover-foreground shadow-xl outline-none transition-[opacity,transform,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                <Select.Item
                  value={AUTO_VALUE}
                  className="cursor-pointer px-3 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Select.ItemText>Auto</Select.ItemText>
                </Select.Item>
                {CODE_LANGUAGES.map((lang) => (
                  <Select.Item
                    key={lang.id}
                    value={lang.id}
                    className="cursor-pointer px-3 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Select.ItemText>{lang.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <div className="w-6" />
      </div>
      <pre className="hljs">
        <NodeViewContent<'code'> as="code" className="font-mono" />
      </pre>
    </NodeViewWrapper>
  );
}
