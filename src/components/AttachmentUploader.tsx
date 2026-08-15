"use client";

import { useState } from "react";
import { requestUploadUrl } from "@/app/tasks/actions";

type UploadedFile = { key: string; filename: string };

/**
 * Uploads selected images directly browser -> S3 via a presigned URL (the
 * file never passes through our Node process). The hidden input carries
 * the resulting {key, filename} pairs as JSON so the parent <form>'s
 * Server Action (createTask/addComment) picks them up on submit.
 */
export default function AttachmentUploader({
  inputName = "attachments",
}: {
  inputName?: string;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of Array.from(fileList)) {
        const { url, key } = await requestUploadUrl(file.type);
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        uploaded.push({ key, filename: file.name });
      }
      setFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPending(false);
    }
  }

  function removeFile(key: string) {
    setFiles((prev) => prev.filter((f) => f.key !== key));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={inputName} value={JSON.stringify(files)} />
      <label className="flex items-center gap-2 text-sm text-neutral-500 cursor-pointer w-fit">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          disabled={pending}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <span className="border border-neutral-300 rounded-lg px-3 py-1.5 hover:border-neutral-400 transition-colors">
          {pending ? "Uploading..." : "+ Add photos"}
        </span>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-1.5 text-xs bg-neutral-100 rounded-md px-2 py-1"
            >
              {f.filename}
              <button
                type="button"
                onClick={() => removeFile(f.key)}
                className="text-neutral-400 hover:text-red-600"
                aria-label={`Remove ${f.filename}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
