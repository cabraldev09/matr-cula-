import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IconProps = SVGProps<SVGSVGElement> & { title?: string };
export type IconComponent = (props: IconProps) => ReactNode;

/**
 * Conjunto próprio da Matrícula+: grade de 24 px, traço de 1,75, pontas arredondadas.
 * O traço principal usa a cor do texto; os detalhes com `className="icon-accent"` usam o acento (--icon-accent).
 */
export function createIcon(name: string, paths: ReactNode): IconComponent {
  function Icon({ className, title, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        className={cn("size-4 shrink-0", className)}
        {...props}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}
