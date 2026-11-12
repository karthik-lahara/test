import { Cube } from "@phosphor-icons/react";

export default function ProjectIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[5px]"
      style={{ width: size + 4, height: size + 4, background: `${color}26`, color }}
    >
      <Cube size={size - 2} weight="duotone" />
    </span>
  );
}
