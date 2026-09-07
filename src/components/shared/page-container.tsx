import { cn } from "@/lib/utils";

/**
 * Horizontal rhythm for every page in the app.
 *
 * One definition so headers and content align down the page — mismatched
 * container padding between a page's own sections is the most common way a
 * layout ends up looking slightly off without anyone being able to say why.
 *
 * The measure and the gutter ramp are tokens (`--page-measure`,
 * `--page-gutter*` in src/styles/tokens.css) rather than utility classes here,
 * so a sticky header that cannot nest inside this component can still align to
 * the same edge by applying `page-gutter` on its own.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("page-gutter mx-auto w-full max-w-measure", className)}>
      {children}
    </div>
  );
}

