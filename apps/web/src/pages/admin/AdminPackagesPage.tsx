import { useQuery } from "@tanstack/react-query";
import { request } from "../../lib/api";
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from "../../components/States";

interface PackageRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  requiresMakerChecker: boolean;
  requirementCount: number;
  checkCount: number;
}

interface CategoryRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  types: { id: string; code: string; name: string; isActive: boolean }[];
}

export function AdminPackagesPage() {
  const packages = useQuery({
    queryKey: ["admin", "packages"],
    queryFn: () => request<PackageRow[]>("/admin/packages"),
  });

  const categories = useQuery({
    queryKey: ["admin", "document-categories"],
    queryFn: () => request<CategoryRow[]>("/admin/document-categories"),
  });

  if (packages.isLoading) return <LoadingBlock label="Loading packages" />;
  if (packages.isError) {
    return (
      <ErrorState
        title="We could not load the packages"
        message={packages.error instanceof Error ? packages.error.message : undefined}
        onRetry={() => void packages.refetch()}
      />
    );
  }

  if (!packages.data) return <LoadingBlock label="Loading packages" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Packages and document catalogue</h1>
        <p className="mt-1 text-sm text-ink-600">
          A package defines which documents a candidate must provide and which verification
          checks are run.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink-900">Background verification packages</h2>
        {packages.data.length === 0 ? (
          <EmptyState title="No packages are configured" />
        ) : (
          packages.data.map((pkg) => (
            <article key={pkg.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">
                    {pkg.name}{" "}
                    <span className="font-mono text-xs font-normal text-ink-500">{pkg.code}</span>
                  </h3>
                  {pkg.description ? (
                    <p className="mt-1 text-sm text-ink-600">{pkg.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={pkg.isActive ? "success" : "neutral"}>
                    {pkg.isActive ? "Active" : "Inactive"}
                  </StatusBadge>
                  {pkg.requiresMakerChecker ? (
                    <StatusBadge tone="info">Maker-checker</StatusBadge>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                {pkg.requirementCount} document requirement(s) · {pkg.checkCount} verification
                check(s)
              </p>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink-900">Document catalogue</h2>
        {categories.isLoading ? (
          <LoadingBlock label="Loading the catalogue" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(categories.data ?? []).map((category) => (
              <article key={category.id} className="card p-4">
                <h3 className="text-sm font-semibold text-ink-900">
                  {category.name}{" "}
                  <span className="font-mono text-xs font-normal text-ink-500">
                    {category.code}
                  </span>
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-ink-600">
                  {category.types.map((type) => (
                    <li key={type.id}>{type.name}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
