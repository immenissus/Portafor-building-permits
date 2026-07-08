import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { verifyAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET - List published posts (public)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (slug) {
      const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
      if (!post || !post.published) {
        return NextResponse.json({ detail: "Post not found" }, { status: 404 });
      }
      return NextResponse.json(post);
    }

    const posts = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        coverImage: blogPosts.coverImage,
        author: blogPosts.author,
        tags: blogPosts.tags,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt
      })
      .from(blogPosts)
      .where(eq(blogPosts.published, true))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Failed to fetch blog posts:", error);
    return NextResponse.json({ detail: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST - Create a post (admin only)
export async function POST(request: Request) {
  try {
    const authError = verifyAdminKey(request);
    if (authError) return authError;

    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, author, tags, published } = body;

    if (!title || !slug || !content) {
      return NextResponse.json({ detail: "Title, slug, and content are required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(blogPosts).values({
      id,
      title,
      slug,
      excerpt: excerpt || null,
      content,
      coverImage: coverImage || null,
      author: author || "Portafor Team",
      tags: tags || [],
      published: published || false,
      publishedAt: published ? new Date() : null
    });

    return NextResponse.json({ id, slug }, { status: 201 });
  } catch (error) {
    console.error("Failed to create blog post:", error);
    return NextResponse.json({ detail: "Failed to create post" }, { status: 500 });
  }
}

// PUT - Update a post (admin only)
export async function PUT(request: Request) {
  try {
    const authError = verifyAdminKey(request);
    if (authError) return authError;

    const body = await request.json();
    const { id, title, slug, excerpt, content, coverImage, author, tags, published } = body;

    if (!id) {
      return NextResponse.json({ detail: "Post ID is required" }, { status: 400 });
    }

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (excerpt !== undefined) updateData.excerpt = excerpt;
    if (content !== undefined) updateData.content = content;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (author !== undefined) updateData.author = author;
    if (tags !== undefined) updateData.tags = tags;
    if (published !== undefined) {
      updateData.published = published;
      if (published) updateData.publishedAt = new Date();
    }

    await db.update(blogPosts).set(updateData).where(eq(blogPosts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update blog post:", error);
    return NextResponse.json({ detail: "Failed to update post" }, { status: 500 });
  }
}

// DELETE - Delete a post (admin only)
export async function DELETE(request: Request) {
  try {
    const authError = verifyAdminKey(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ detail: "Post ID is required" }, { status: 400 });

    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete blog post:", error);
    return NextResponse.json({ detail: "Failed to delete post" }, { status: 500 });
  }
}
