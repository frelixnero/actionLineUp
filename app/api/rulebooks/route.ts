import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { adminSupabase } from "@/lib/supabase";

const bucket = "league-rulebooks";
const folder = "seguin-8ball";
const allowedExtensions = new Set(["pdf", "doc", "docx", "txt", "png", "jpg", "jpeg", "webp"]);

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
const extensionFor = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

async function ensureBucket() {
  const { error } = await adminSupabase().storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain", "image/png", "image/jpeg", "image/webp"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

export async function GET() {
  try {
    const storage = adminSupabase().storage;
    const { data, error } = await storage.from(bucket).list(folder, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    if (error && !/not found/i.test(error.message)) throw error;
    const documents = await Promise.all((data ?? []).filter((file) => file.name !== ".emptyFolderPlaceholder").map(async (file) => {
      const { data: signed } = await storage.from(bucket).createSignedUrl(`${folder}/${file.name}`, 60 * 60);
      return { name: file.name.replace(/^\d+-/, ""), url: signed?.signedUrl ?? null, createdAt: file.created_at, size: file.metadata?.size ?? 0 };
    }));
    return NextResponse.json({ documents });
  } catch {
    return NextResponse.json({ documents: [] });
  }
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner) return NextResponse.json({ error: "Only the league owner can upload official rule documents." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) return NextResponse.json({ error: "Choose a document or rules screenshot." }, { status: 400 });
    const extension = extensionFor(file.name);
    if (!allowedExtensions.has(extension) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Use a PDF, Word, text, or image file under 10 MB." }, { status: 400 });
    await ensureBucket();
    const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
    const { error } = await adminSupabase().storage.from(bucket).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The rule document could not be uploaded. Please try again." }, { status: 503 });
  }
}
