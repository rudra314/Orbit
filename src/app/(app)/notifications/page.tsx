import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthedUser } from "@/lib/auth";
import { notificationService } from "@/services/notificationService";
import { NotificationsClient } from "@/components/notifications/NotificationsClient";

export default async function NotificationsPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const initial = await notificationService.getForUser(user.id, { limit: 30 });

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
      </header>
      <NotificationsClient
        initialItems={initial.notifications}
        initialCursor={initial.nextCursor}
      />
    </div>
  );
}
