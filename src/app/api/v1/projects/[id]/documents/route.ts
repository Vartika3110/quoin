import { z } from "zod";
import { ApiError, handler, ok, parseBody, requireUser } from "@/lib/http";
import {
  ProjectDocumentAlreadyAttachedError,
  ProjectDocumentFileNotFoundError,
  ProjectNotFoundError,
  attachDocument,
} from "@/lib/data/projects";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  fileId: z.string().trim().min(1, "Choose a file"),
  label: z.string().trim().max(160).optional(),
});

/**
 * POST /api/v1/projects/{id}/documents
 *
 * Attaches an existing `StoredFile` — already uploaded and confirmed via
 * `POST /api/v1/uploads` — to a project. `attachDocument` requires the
 * file to be this caller's own and already `STORED`; a `fileId` that
 * belongs to someone else, was never confirmed, or does not exist all
 * 404 identically.
 */
export const POST = handler(async (request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await parseBody(request, Body);

  try {
    const document = await attachDocument(user.id, id, body.fileId, body.label);
    return ok({ document }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      throw new ApiError("not_found", "No such project");
    }
    if (error instanceof ProjectDocumentFileNotFoundError) {
      throw new ApiError("not_found", "No such file");
    }
    if (error instanceof ProjectDocumentAlreadyAttachedError) {
      throw new ApiError("conflict", error.message);
    }
    throw error;
  }
});
