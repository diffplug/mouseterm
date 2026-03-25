interface PlaygroundToolbarProps {
  children?: React.ReactNode;
}

export function PlaygroundToolbar({ children }: PlaygroundToolbarProps) {
  return (
    <div
      className="fixed top-[60px] left-0 right-0 z-10 h-10 flex items-center justify-center border-b"
      style={{
        backgroundColor: "rgba(30, 30, 30, 0.85)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        borderColor: "rgba(255, 255, 255, 0.06)",
      }}
    >
      {children}
    </div>
  );
}
