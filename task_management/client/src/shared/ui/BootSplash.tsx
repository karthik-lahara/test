import Logo from "./Logo";

export default function BootSplash() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-canvas">
      <div className="animate-pulse">
        <Logo size={36} />
      </div>
    </div>
  );
}
