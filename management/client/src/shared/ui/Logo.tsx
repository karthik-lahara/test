/**
 * The Lahara emblem (gold apple with a tree), cropped from the official logo
 * in `public/logo.jpg` (the same file the HRMS uses). The image is scaled up
 * and anchored near the top so the "LAHARA" wordmark under the emblem is cut
 * off; the logo's black background becomes the tile.
 */
export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 overflow-hidden bg-black ring-1 ring-white/10"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
      aria-hidden
    >
      <img
        src="/logo.jpg"
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="size-full object-cover select-none"
        style={{ transform: "scale(1.4)", transformOrigin: "50% 30%" }}
      />
    </span>
  );
}
