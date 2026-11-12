import { Kbd } from "@/shared/ui/Display";
import Modal from "@/shared/ui/Modal";

const GROUPS: Array<{ title: string; items: Array<[string[], string]> }> = [
  {
    title: "Anywhere",
    items: [
      [["C"], "Create an epic, story, task…"],
      [["/"], "Search"],
      [["Ctrl", "K"], "Search"],
      [["?"], "Show these shortcuts"],
      [["Esc"], "Close a dialog"],
    ],
  },
  {
    title: "Go to",
    items: [
      [["G", "D"], "Dashboard"],
      [["G", "M"], "My work"],
      [["G", "I"], "Inbox"],
      [["G", "A"], "Assistant"],
      [["G", "P"], "Projects"],
      [["G", "T"], "Teams"],
    ],
  },
  {
    title: "In the New task dialog",
    items: [[["Ctrl", "Enter"], "Continue / save"]],
  },
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Keyboard shortcuts" size="sm">
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[12px] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
              {group.title}
            </h3>
            <ul className="flex flex-col">
              {group.items.map(([keys, label]) => (
                <li
                  key={label + keys.join()}
                  className="flex h-8 items-center justify-between border-b border-line/60 last:border-0"
                >
                  <span className="text-fg-muted">{label}</span>
                  <span className="flex items-center gap-1">
                    {keys.map((key, index) => (
                      <span key={key} className="flex items-center gap-1">
                        {index > 0 && (
                          <span className="text-[12px] text-fg-subtle">
                            {keys[0] === "G" ? "then" : "+"}
                          </span>
                        )}
                        <Kbd>{key}</Kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
