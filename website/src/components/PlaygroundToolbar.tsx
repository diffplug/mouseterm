interface PlaygroundToolbarProps {
  children?: React.ReactNode;
}

export function PlaygroundToolbar({ children }: PlaygroundToolbarProps) {
  return (
    <div
      className="fixed top-[92px] right-0 left-0 z-20 flex h-10 items-center justify-center border-b px-3 md:top-[108px]"
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
