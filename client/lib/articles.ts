import { api } from "@/lib/api";

export type ArticleStatus = "draft" | "published";

export type Category = {
  id: number;
  name: string;
  slug: string;
  position: number;
};

export type ArticleRow = {
  id: number;
  title: string;
  slug: string;
  status: ArticleStatus;
  category_id: number | null;
  published_at: string | null;
  updated_at: string;
};

export type Article = ArticleRow & {
  body_html: string;
  body_text: string;
};

export type ArticleInput = {
  title: string;
  body_html: string;
  category_id: number | null;
};

export const articles = {
  list: (status?: ArticleStatus, signal?: AbortSignal) =>
    api.get<{ items: ArticleRow[] }>(
      status ? `/articles?status=${status}` : "/articles",
      signal,
    ),
  read: (id: number, signal?: AbortSignal) => api.get<Article>(`/articles/${id}`, signal),
  create: (body: ArticleInput) => api.post<Article>("/articles", body),
  update: (id: number, body: ArticleInput) => api.patch<Article>(`/articles/${id}`, body),
  publish: (id: number) => api.post<Article>(`/articles/${id}/publish`),
  unpublish: (id: number) => api.post<Article>(`/articles/${id}/unpublish`),
  categories: (signal?: AbortSignal) => api.get<Category[]>("/articles/categories", signal),
  addCategory: (name: string) => api.post<Category>("/articles/categories", { name }),
};
