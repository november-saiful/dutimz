interface Props {
  title: string;
  action?: React.ReactNode;
}

export function SectionHeading({ title, action }: Props) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-3 text-xl font-bold md:text-2xl">
        <span className="inline-block h-6 w-1 rounded-full" style={{ background: "var(--md-sys-color-primary)" }} />
        {title}
      </h2>
      {action}
    </div>
  );
}
