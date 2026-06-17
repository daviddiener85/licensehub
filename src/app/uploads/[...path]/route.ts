import { readFile } from "fs/promises";
import path from "path";

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

function uploadPath(parts: string[]) {
  const uploadRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "uploads");
  const filePath = path.normalize(path.join(uploadRoot, ...parts));

  if (!filePath.startsWith(uploadRoot + path.sep)) {
    return null;
  }

  return filePath;
}

export async function GET(_request: Request, context: RouteContext<"/uploads/[...path]">) {
  const { path: parts } = await context.params;
  const filePath = uploadPath(parts);

  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await readFile(/* turbopackIgnore: true */ filePath);
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

    return new Response(file, {
      headers: {
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
