"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Edit, Eye, FileText, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  author: string;
  tags: string[];
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
};

export default function BlogAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    author: "Portafor Team",
    tags: ""
  });

  const posts = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: async () => {
      const res = await fetch("/api/blog/posts?limit=50");
      if (!res.ok) return [];
      return res.json();
    }
  });

  useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title,
        slug: editing.slug,
        excerpt: editing.excerpt || "",
        content: editing.content,
        coverImage: editing.coverImage || "",
        author: editing.author,
        tags: (editing.tags || []).join(", ")
      });
    }
  }, [editing]);

  function resetForm() {
    setForm({ title: "", slug: "", excerpt: "", content: "", coverImage: "", author: "Portafor Team", tags: "" });
    setEditing(null);
    setShowNew(false);
  }

  function autoSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  const saveMutation = useMutation({
    mutationFn: async (published: boolean) => {
      const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
      const body = {
        ...(editing ? { id: editing.id } : {}),
        title: form.title,
        slug: form.slug || autoSlug(form.title),
        excerpt: form.excerpt || null,
        content: form.content,
        coverImage: form.coverImage || null,
        author: form.author,
        tags,
        published
      };
      const method = editing ? "PUT" : "POST";
      const res = await fetch("/api/blog/posts", {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? ""
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      resetForm();
      toast({ title: editing ? "Post updated" : "Post created" });
    },
    onError: (err) => {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : undefined });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/blog/posts?id=${id}`, {
        method: "DELETE",
        headers: { "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "" }
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      toast({ title: "Post deleted" });
    }
  });

  const togglePublish = useMutation({
    mutationFn: async (post: BlogPost) => {
      const res = await fetch("/api/blog/posts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? ""
        },
        body: JSON.stringify({ id: post.id, published: !post.published })
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    }
  });

  const blogList = posts.data ?? [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700"><ArrowLeft className="h-3 w-3" /> Admin</Link>
          <h1 className="text-2xl font-semibold text-stone-950">Blog posts</h1>
          <p className="text-sm text-stone-600">Create and manage articles for the public blog.</p>
        </div>
        <Button onClick={() => { resetForm(); setShowNew(true); }}><Plus className="h-4 w-4" /> New post</Button>
      </div>

      {(showNew || editing) && (
        <Card className="mb-6 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editing ? "Edit post" : "New post"}</h2>
            <button onClick={resetForm} className="text-stone-400 hover:text-stone-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); if (!editing) setForm(f => ({ ...f, title: e.target.value, slug: autoSlug(e.target.value) })); }} required /></div>
            <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="auto-generated" /></div>
            <div className="space-y-2"><Label>Author</Label><Input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Cover image URL</Label><Input value={form.coverImage} onChange={e => setForm(f => ({ ...f, coverImage: e.target.value }))} placeholder="https://..." /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Excerpt</Label><Input value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Short summary for listings" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="permits, business, tips" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>Content (HTML)</Label><Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={12} placeholder="Write your post content here. HTML is supported." /></div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button variant="secondary" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending || !form.title}>Save draft</Button>
              <Button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending || !form.title}>{saveMutation.isPending ? "Saving..." : "Publish"}</Button>
            </div>
          </div>
        </Card>
      )}

      {posts.isLoading ? (
        <Card className="p-8 text-center text-stone-500">Loading posts...</Card>
      ) : blogList.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-stone-400" />
          <h2 className="mt-4 text-lg font-semibold">No posts yet</h2>
          <p className="mt-2 text-sm text-stone-600">Click &quot;New post&quot; to write your first article.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Author</th>
                <th className="p-3">Status</th>
                <th className="p-3">Published</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blogList.map((post: BlogPost) => (
                <tr key={post.id} className="border-b border-stone-100">
                  <td className="p-3 font-medium">{post.title}</td>
                  <td className="p-3 text-stone-500">{post.author}</td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${post.published ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}>
                      {post.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-stone-500">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/blog/${post.slug}`} target="_blank" className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><Eye className="h-4 w-4" /></Link>
                      <button onClick={() => setEditing(post)} className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"><Edit className="h-4 w-4" /></button>
                      <button onClick={() => togglePublish.mutate(post)} className="rounded px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100">{post.published ? "Unpublish" : "Publish"}</button>
                      <button onClick={() => { if (confirm("Delete this post?")) deleteMutation.mutate(post.id); }} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
