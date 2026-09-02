import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { seesOnlyOwnTasks } from "@/lib/tasks";
import { createViewUrl } from "@/lib/storage";

/**
 * Redirects to a freshly-generated, short-lived presigned S3 URL. Kept as
 * an indirection (rather than embedding a presigned URL directly in
 * server-rendered HTML) so an <img> tag keeps working no matter how long
 * a task detail page has been open in a tab -- each request here mints a
 * new URL. Also where draft/private visibility is actually enforced for
 * attachment access, not just for the task/comment record itself.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      task: { select: { id: true, isDraft: true, createdById: true, assigneeId: true } },
      comment: {
        select: {
          isPrivate: true,
          task: { select: { id: true, isDraft: true, createdById: true, assigneeId: true } },
        },
      },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owningTask = attachment.task ?? attachment.comment?.task;
  if (!owningTask) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = owningTask.createdById === session.sub;
  const isCreatorOrAssignee = isOwner || owningTask.assigneeId === session.sub;
  if (owningTask.isDraft && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attachment.comment?.isPrivate && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // An EXTERNAL user can only pull attachments off tasks in their scope.
  if (seesOnlyOwnTasks(session.role) && !isCreatorOrAssignee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await createViewUrl(attachment.key);
  return NextResponse.redirect(url);
}
