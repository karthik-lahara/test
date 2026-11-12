import { cn } from "@/shared/lib/cn";

export interface AvatarPerson {
  name: string;
  avatarColor?: string;
}

const PALETTE = ["#7c6cff", "#5e9bff", "#a78bfa", "#f5a524", "#f472b6", "#4cc38a", "#f2705e"];

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface AvatarProps {
  person?: AvatarPerson | null;
  size?: number;
  className?: string;
}

export default function Avatar({ person, size = 20, className }: AvatarProps) {
  if (!person) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-fg-subtle",
          className,
        )}
        style={{ width: size, height: size }}
        title="Unassigned"
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.4)),
        background: person.avatarColor ?? colorFor(person.name),
      }}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

interface AvatarStackProps {
  people: AvatarPerson[];
  size?: number;
  max?: number;
}

export function AvatarStack({ people, size = 20, max = 3 }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.name + index}
          person={person}
          size={size}
          className={cn("ring-2 ring-panel", index > 0 && "-ml-1.5")}
        />
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-active text-[12px] font-medium text-fg-muted ring-2 ring-panel"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
