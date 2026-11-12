import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";

export interface Crumb {
  label: ReactNode;
  to?: string;
  icon?: ReactNode;
}

interface PageHeaderProps {
  /** Breadcrumb trail; the last crumb is the current page. */
  crumbs: Crumb[];
  description?: ReactNode;
  actions?: ReactNode;
  /** View tabs shown on a second row under the trail. */
  children?: ReactNode;
}

export default function PageHeader({ crumbs, description, actions, children }: PageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-line">
      <div className="flex h-header items-center gap-3 px-4 md:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            const content = (
              <>
                {crumb.icon}
                <span className="truncate">{crumb.label}</span>
              </>
            );
            return (
              <Fragment key={index}>
                {index > 0 && <CaretRight size={11} className="shrink-0 text-fg-subtle" />}
                {crumb.to && !last ? (
                  <Link
                    to={crumb.to}
                    className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                  >
                    {content}
                  </Link>
                ) : (
                  <h1
                    className={
                      last
                        ? "flex min-w-0 items-center gap-1.5 px-1 font-semibold text-fg"
                        : "flex min-w-0 items-center gap-1.5 px-1 text-fg-muted"
                    }
                  >
                    {content}
                  </h1>
                )}
              </Fragment>
            );
          })}
        </nav>
        {description && (
          <p className="hidden min-w-0 truncate text-[12.5px] text-fg-subtle lg:block">
            <span className="mr-2 text-fg-subtle/50">·</span>
            {description}
          </p>
        )}
        <span className="flex-1" />
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children && <div className="-mt-2 flex h-10 items-end gap-2 px-4 md:px-6">{children}</div>}
    </header>
  );
}
