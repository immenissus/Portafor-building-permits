"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Calendar, ArrowRight, Tag } from "lucide-react";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  author: string;
  tags: string[] | null;
  publishedAt: string | null;
};

export default function BlogPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const res = await fetch("/api/blog/posts?limit=20");
      if (!res.ok) return [];
      return res.json();
    }
  });

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <nav className="border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Home</Link>
            <Link href="/sign-in" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Log in</Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
        <h1 className="text-3xl font-semibold text-stone-950">Blog</h1>
        <p className="mt-2 text-stone-600">Tips, insights, and updates from the Portafor team.</p>

        {isLoading ? (
          <div className="mt-10 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-stone-200 bg-white p-6">
                <div className="h-6 w-3/4 rounded bg-stone-200" />
                <div className="mt-3 h-4 w-full rounded bg-stone-100" />
                <div className="mt-2 h-4 w-2/3 rounded bg-stone-100" />
              </div>
            ))}
          </div>
        ) : !posts || posts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-12 text-center">
            <p className="text-stone-500">No posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="mt-10 space-y-6">
            {posts.map((post: BlogPost) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-teal-200 hover:shadow-md"
              >
                {post.coverImage && (
                  <img src={post.coverImage} alt={post.title} className="mb-4 h-48 w-full rounded-xl object-cover" />
                )}
                <div className="flex items-center gap-3 text-sm text-stone-500">
                  <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Draft"}</span>
                  <span>by {post.author}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold text-stone-900 group-hover:text-teal-700 transition">{post.title}</h2>
                {post.excerpt && <p className="mt-2 text-sm text-stone-600">{post.excerpt}</p>}
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                        <Tag className="h-3 w-3" />{tag}
                      </span>
                    ))}
                  </div>
                )}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal-700">
                  Read more <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
