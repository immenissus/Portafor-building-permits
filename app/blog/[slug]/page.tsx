"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Calendar, ArrowLeft, Tag } from "lucide-react";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  author: string;
  tags: string[] | null;
  publishedAt: string | null;
};

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/posts?slug=${slug}`);
      if (!res.ok) throw new Error("Post not found");
      return res.json();
    },
    enabled: Boolean(slug)
  });

  const postSchema = post ? {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    url: `https://portafor.info/blog/${post.slug}`,
    datePublished: post.publishedAt || undefined,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Portafor",
      url: "https://portafor.info"
    },
    description: post.excerpt || post.title,
    image: post.coverImage || undefined
  } : null;

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#FAFAF8]">
        <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-3/4 rounded bg-stone-200" />
            <div className="h-4 w-1/2 rounded bg-stone-100" />
            <div className="mt-8 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 w-full rounded bg-stone-100" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !post) {
    return (
      <main className="min-h-screen bg-[#FAFAF8]">
        <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8 text-center">
          <h1 className="text-2xl font-semibold text-stone-950">Post not found</h1>
          <Link href="/blog" className="mt-4 inline-flex items-center gap-2 text-teal-700 hover:text-teal-800">
            <ArrowLeft className="h-4 w-4" /> Back to blog
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {postSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(postSchema) }} />
      )}

      <nav className="border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <div className="flex items-center gap-3">
            <Link href="/blog" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Blog</Link>
            <Link href="/sign-in" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Log in</Link>
          </div>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 transition mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to blog
        </Link>

        {post.coverImage && (
          <img src={post.coverImage} alt={post.title} className="w-full rounded-2xl object-cover mb-8" style={{ maxHeight: "400px" }} />
        )}

        <div className="flex items-center gap-3 text-sm text-stone-500 mb-4">
          <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}</span>
          <span>by {post.author}</span>
        </div>

        <h1 className="text-3xl font-semibold text-stone-950 sm:text-4xl">{post.title}</h1>

        {post.tags && post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag: string) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                <Tag className="h-3 w-3" />{tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />

        <div className="mt-12 border-t border-stone-200 pt-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-800 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to all posts
          </Link>
        </div>
      </article>
    </main>
  );
}
