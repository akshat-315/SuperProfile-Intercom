const ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

export type ArticleCard = {
  title: string;
  slug: string;
  preview: string;
  category_id: number | null;
};

export type CategoryBlock = { id: number; name: string; slug: string };

export type Site = {
  workspace_name: string;
  workspace_slug: string;
  categories: CategoryBlock[];
  articles: ArticleCard[];
};

export type HelpArticle = {
  title: string;
  slug: string;
  body_html: string;
  published_at: string | null;
};

async function ask<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${ORIGIN}/api/help${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function fetchSite(slug: string): Promise<Site | null> {
  return ask<Site>(`/site?slug=${encodeURIComponent(slug)}`);
}

export function fetchArticle(slug: string, article: string): Promise<HelpArticle | null> {
  return ask<HelpArticle>(
    `/article/${encodeURIComponent(article)}?slug=${encodeURIComponent(slug)}`,
  );
}

export function fetchResults(
  slug: string,
  q: string,
): Promise<{ query: string; items: ArticleCard[] } | null> {
  return ask(`/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`);
}
